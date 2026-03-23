import { Router, Request, Response } from "express";
import { getSupabaseAdmin } from "../lib/supabase";
import { buildGmailClient } from "../lib/gmail-client";
import {
  downloadPdfAttachment,
  matchesScheduleEmail,
} from "../services/gmail.service";
import { hashPdf, checkDuplicate, uploadPdfToStorage, createPdfRecord, updatePdfStatus } from "../services/pdf.service";
import { processSchedulePdf } from "../services/parser.service";
import { saveShiftCoworkers, upsertShifts } from "../services/shift.service";

export const syncRoutes = Router();

syncRoutes.post("/trigger", async (req: Request, res: Response) => {
  const userId = req.body.userId as string;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (!user?.gmail_connected || !user.gmail_tokens) {
      res.status(400).json({ error: "Gmail not connected" });
      return;
    }

    const tokens = user.gmail_tokens as { access_token: string; refresh_token: string };
    const gmail = buildGmailClient(tokens);

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
      q: "has:attachment filename:pdf",
    });

    const messages = list.data.messages ?? [];
    let processed = 0;

    for (const msgRef of messages) {
      if (!msgRef.id) continue;

      const msg = await gmail.users.messages.get({
        userId: "me",
        id: msgRef.id,
        format: "metadata",
        metadataHeaders: ["From", "Subject"],
      });

      const headers = msg.data.payload?.headers ?? [];
      if (!matchesScheduleEmail(headers, user.employer_email)) continue;

      const pdfAttachment = await downloadPdfAttachment(gmail, msgRef.id);
      if (!pdfAttachment) continue;

      const hash = hashPdf(pdfAttachment.buffer);

      const isDuplicate = await checkDuplicate(user.id, hash);
      if (isDuplicate) continue;

      const filePath = await uploadPdfToStorage(user.id, hash, pdfAttachment.buffer, pdfAttachment.name);
      const pdfRecord = await createPdfRecord(
        user.id,
        filePath,
        pdfAttachment.name,
        hash,
        "sync"
      );

      try {
        const schedule = await processSchedulePdf(pdfAttachment.buffer, user.name);
        await upsertShifts(user.id, schedule, pdfRecord.id);
        await saveShiftCoworkers(user.id, schedule, pdfRecord.id);
        await updatePdfStatus(pdfRecord.id, "completed", {
          week_start: schedule.weekStart,
          week_end: schedule.weekEnd,
        });
        processed++;
      } catch (parseErr) {
        await updatePdfStatus(pdfRecord.id, "failed", {
          error_msg: String(parseErr),
        });
      }
    }

    res.json({ success: true, processed });
  } catch (err) {
    console.error("Sync trigger error:", err);
    res.status(500).json({ error: "Sync failed" });
  }
});
