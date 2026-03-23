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
import { saveShiftCoworkers, upsertShifts } from "../services/shift.service";

export const webhookRoutes = Router();

interface PubSubBody {
  message?: {
    data?: string;
    messageId?: string;
  };
  subscription?: string;
}

async function processWebhookNotification(payload: {
  emailAddress: string;
  historyId: string;
}) {
  const { emailAddress, historyId } = payload;
  const supabase = getSupabaseAdmin();

  const { data: user } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", emailAddress)
    .single();

  if (!user?.gmail_connected || !user.gmail_tokens) {
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

      const pdfRecord = await createPdfRecord(
        user.id,
        filePath,
        pdfAttachment.name,
        hash,
        "gmail"
      );

      try {
        const schedule = await processSchedulePdf(pdfAttachment.buffer, user.name);

        await upsertShifts(user.id, schedule, pdfRecord.id);
        await saveShiftCoworkers(user.id, schedule, pdfRecord.id);
        await updatePdfStatus(pdfRecord.id, "completed", {
          week_start: schedule.weekStart,
          week_end: schedule.weekEnd,
        });

        console.log(`Processed schedule PDF for user ${user.id}: ${schedule.shifts.length} shifts`);
      } catch (pipelineErr) {
        console.error(`PDF pipeline failed for message ${msgRef.id}:`, pipelineErr);
        await updatePdfStatus(pdfRecord.id, "failed", {
          error_msg: String(pipelineErr),
        });
      }
    } catch (msgErr) {
      console.error(`Error processing message ${msgRef.id}:`, msgErr);
    }
  }

  await supabase
    .from("profiles")
    .update({ gmail_history_id: historyId })
    .eq("id", user.id);
}

webhookRoutes.post("/webhook", verifyPubSub, (req: Request, res: Response) => {
  const body = req.body as PubSubBody;
  if (!body.message?.data) {
    res.sendStatus(200);
    return;
  }

  // Ack immediately so Pub/Sub doesn't keep retrying long-running deliveries.
  res.sendStatus(200);

  try {
    const decoded = JSON.parse(
      Buffer.from(body.message.data, "base64").toString()
    ) as { emailAddress: string; historyId: string };

    void processWebhookNotification(decoded).catch((err) => {
      console.error("Async webhook processing error:", err);
    });
  } catch (err) {
    console.error("Webhook decode error:", err);
  }
});
