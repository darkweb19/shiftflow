import { google } from "googleapis";
import { getEnv } from "../config";

export function createOAuth2Client() {
  const env = getEnv();
  return new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    `${env.FRONTEND_URL}/api/gmail/callback-redirect`
  );
}

export function buildGmailClient(tokens: { access_token: string; refresh_token: string }) {
  const auth = createOAuth2Client();
  auth.setCredentials(tokens);
  return google.gmail({ version: "v1", auth });
}
