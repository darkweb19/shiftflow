import { Router, Request, Response } from "express";
import { getEnv } from "../config";
import { getSupabaseAdmin } from "../lib/supabase";
import { getAuthUrl, exchangeCodeForTokens, setupWatch } from "../services/gmail.service";

export const gmailRoutes = Router();

gmailRoutes.get("/connect", (req: Request, res: Response) => {
  const userId = req.query.userId as string;
  if (!userId) {
    res.status(400).json({ error: "userId query parameter required" });
    return;
  }
  const url = getAuthUrl(userId);
  res.redirect(url);
});

gmailRoutes.get("/callback", async (req: Request, res: Response) => {
  const env = getEnv();

  try {
    const code = req.query.code as string;
    const userId = req.query.state as string;

    if (!code || !userId) {
      res.status(400).json({ error: "Missing code or state" });
      return;
    }

    const tokens = await exchangeCodeForTokens(code);

    const watchResult = await setupWatch(tokens);

    const supabase = getSupabaseAdmin();
    await supabase
      .from("profiles")
      .update({
        gmail_connected: true,
        gmail_tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        },
        gmail_history_id: watchResult.historyId,
        gmail_watch_expiry: watchResult.expiration?.toISOString(),
      })
      .eq("id", userId);

    res.redirect(`${env.FRONTEND_URL}/settings?gmail=connected`);
  } catch (err) {
    console.error("Gmail callback error:", err);
    res.redirect(`${env.FRONTEND_URL}/settings?gmail=error`);
  }
});

gmailRoutes.post("/disconnect", async (req: Request, res: Response) => {
  const userId = req.body.userId as string;
  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("profiles")
    .update({
      gmail_connected: false,
      gmail_tokens: null,
      gmail_history_id: null,
      gmail_watch_expiry: null,
    })
    .eq("id", userId);

  res.json({ success: true });
});
