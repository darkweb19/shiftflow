import { gmail_v1 } from "googleapis";
import { createOAuth2Client, buildGmailClient } from "../lib/gmail-client";
import { getEnv } from "../config";
import { getSupabaseAdmin } from "../lib/supabase";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

export function getAuthUrl(userId: string): string {
  const oauth2 = createOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: userId,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2 = createOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

export async function setupWatch(tokens: { access_token?: string | null; refresh_token?: string | null }) {
  const gmail = buildGmailClient({
    access_token: tokens.access_token ?? "",
    refresh_token: tokens.refresh_token ?? "",
  });
  const env = getEnv();

  const res = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: env.GOOGLE_PUBSUB_TOPIC,
      labelIds: ["INBOX"],
    },
  });

  return {
    historyId: res.data.historyId ?? undefined,
    expiration: res.data.expiration
      ? new Date(Number(res.data.expiration))
      : undefined,
  };
}

export async function getNewMessages(
  gmail: gmail_v1.Gmail,
  startHistoryId: string | null,
  _newHistoryId: string
) {
  if (!startHistoryId) {
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 5,
      q: "has:attachment filename:pdf",
    });
    return list.data.messages ?? [];
  }

  const history = await gmail.users.history.list({
    userId: "me",
    startHistoryId,
    historyTypes: ["messageAdded"],
  });

  const messageRefs: gmail_v1.Schema$Message[] = [];
  for (const record of history.data.history ?? []) {
    for (const added of record.messagesAdded ?? []) {
      if (added.message?.id) {
        messageRefs.push(added.message);
      }
    }
  }
  return messageRefs;
}

export function matchesScheduleEmail(
  headers: gmail_v1.Schema$MessagePartHeader[],
  employerEmail: string | null
): boolean {
  const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value ?? "";
  const subject = headers.find((h) => h.name?.toLowerCase() === "subject")?.value ?? "";

  const fromMatch = employerEmail
    ? from.toLowerCase().includes(employerEmail.toLowerCase())
    : false;
  const subjectMatch = subject.toLowerCase().includes("schedule");

  return fromMatch || subjectMatch;
}

export async function downloadPdfAttachment(
  gmail: gmail_v1.Gmail,
  messageId: string
): Promise<{ buffer: Buffer; name: string } | null> {
  const msg = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const parts = msg.data.payload?.parts ?? [];
  for (const part of parts) {
    if (
      part.mimeType === "application/pdf" &&
      part.body?.attachmentId
    ) {
      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: part.body.attachmentId,
      });

      const data = attachment.data.data;
      if (!data) continue;

      const buffer = Buffer.from(data, "base64url");
      return { buffer, name: part.filename ?? "schedule.pdf" };
    }
  }
  return null;
}

export async function renewWatchForAllUsers() {
  const supabase = getSupabaseAdmin();
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, gmail_tokens")
    .eq("gmail_connected", true)
    .not("gmail_tokens", "is", null);

  if (error || !users) {
    console.error("Failed to fetch gmail-connected users:", error);
    return;
  }

  for (const user of users) {
    try {
      const tokens = user.gmail_tokens as { access_token: string; refresh_token: string };
      const watchResult = await setupWatch(tokens);
      await supabase
        .from("profiles")
        .update({
          gmail_watch_expiry: watchResult.expiration?.toISOString(),
          gmail_history_id: watchResult.historyId,
        })
        .eq("id", user.id);
      console.log(`Renewed watch for user ${user.id}`);
    } catch (err) {
      console.error(`Failed to renew watch for user ${user.id}:`, err);
      await supabase
        .from("profiles")
        .update({ gmail_connected: false })
        .eq("id", user.id);
    }
  }
}
