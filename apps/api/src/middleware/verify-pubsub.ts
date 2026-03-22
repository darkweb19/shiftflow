import { Request, Response, NextFunction } from "express";
import { getEnv } from "../config";

export function verifyPubSub(req: Request, res: Response, next: NextFunction) {
  const token = req.query.token as string | undefined;
  if (token !== getEnv().GOOGLE_PUBSUB_VERIFY_TOKEN) {
    res.status(403).json({ error: "Invalid verification token" });
    return;
  }
  next();
}
