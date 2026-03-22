import { Router, Request, Response } from "express";
import { verifyPubSub } from "../middleware/verify-pubsub";
import { getSupabaseAdmin } from "../lib/supabase";
import { buildGmailClient } from "../lib/gmail-client";
import {
  getNewMessages,
  matchesScheduleEmail,
  downloadPdfAttachment,
} from "../services/gmail.service";
import { hashPdf, checkDuplicate, uploadPdfToStorage, createPdfRecord, updatePdfStatus } from "../services/pdf.service";
import { processSchedulePdf } from "../services/parser.service";
import { upsertShifts } from "../services/shift.service";

export const webhookRoutes = Router();

interface PubSubBody {
  message?: {
    data?: string;
    messageId?: string;
  };
  subscription?: string;
}

webhookRoutes.post("/webhook", verifyPubSub, async (req: Request, res: Response) => {
  try {
    const body = req.body as PubSubBody;
    if (!body.message?.data) {
      res.sendStatus(200);
      return;
    }

    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    ) as { emailAddress: string; historyId: string };

    const { emailAddress, historyId } = decoded;

    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from("profiles")
      .select("*")
      .eq("email", emailAddress)
      .single();

    if (!user?.gmail_connected || !user.gmail_tokens) {
      res.sendStatus(200);
      return;
    }

    const tokens = user.gmail_tokens as { access_token: string; refresh_token: string };
    const gmail = buildGmailClient(tokens);

    const messageRefs = await getNewMessages(gmail, user.gmail_history_id, historyId);

    for (const msgRef of messageRefs) {
      if (!msgRef.id) continue;

      try {
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

        const filePath = await uploadPdfToStorage(
          user.id,
          hash,
          pdfAttachment.buffer,
          pdfAttachment.name
        );

        const pdfRecord = await createPdfRecord(user.id, filePath, pdfAttachment.name, hash);

        const schedule = await processSchedulePdf(pdfAttachment.buffer, user.name);
        await upsertShifts(user.id, schedule, pdfRecord.id);

        await updatePdfStatus(pdfRecord.id, "completed", {
          week_start: schedule.weekStart,
          week_end: schedule.weekEnd,
        });

        console.log(`Processed schedule PDF for user ${user.id}: ${schedule.shifts.length} shifts`);
      } catch (msgErr) {
        console.error(`Error processing message ${msgRef.id}:`, msgErr);
      }
    }

    await supabase
      .from("profiles")
      .update({ gmail_history_id: historyId })
      .eq("id", user.id);

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.sendStatus(500);
  }
});
