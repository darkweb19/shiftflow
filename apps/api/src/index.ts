import express from "express";
import cors from "cors";
import { getEnv } from "./config";
import { gmailRoutes } from "./routes/gmail.routes";
import { webhookRoutes } from "./routes/webhook.routes";
import { syncRoutes } from "./routes/sync.routes";
import { scheduleRoutes } from "./routes/schedule.routes";
import { startWatchRenewalCron } from "./cron/renew-watch";

const app = express();

const env = getEnv();

app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/gmail", gmailRoutes);
app.use("/gmail", webhookRoutes);
app.use("/sync", syncRoutes);
app.use("/schedule", scheduleRoutes);

startWatchRenewalCron();

app.listen(env.PORT, () => {
  console.log(`ShiftFlow API listening on port ${env.PORT}`);
});
