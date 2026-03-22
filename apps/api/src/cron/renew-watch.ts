import cron from "node-cron";
import { renewWatchForAllUsers } from "../services/gmail.service";

export function startWatchRenewalCron() {
  cron.schedule("0 6 * * *", async () => {
    console.log("Running daily Gmail watch renewal...");
    try {
      await renewWatchForAllUsers();
      console.log("Watch renewal complete.");
    } catch (err) {
      console.error("Watch renewal failed:", err);
    }
  });

  console.log("Gmail watch renewal cron scheduled (daily at 06:00 UTC)");
}
