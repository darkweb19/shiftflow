import { Router, type Request, type Response } from "express";
import multer from "multer";
import { getUserFromBearer } from "../lib/require-user";
import {
  hashPdf,
  checkDuplicate,
  uploadPdfToStorage,
  createPdfRecord,
  updatePdfStatus,
} from "../services/pdf.service";
import { processSchedulePdf } from "../services/parser.service";
import { saveShiftCoworkers, upsertShifts } from "../services/shift.service";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    cb(null, ok);
  },
});

export const scheduleRoutes = Router();

async function handleScheduleUpload(req: Request, res: Response) {
  const user = await getUserFromBearer(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (!req.file?.buffer?.length) {
    res.status(400).json({ error: "PDF file required (form field name: pdf)" });
    return;
  }

  const buffer = req.file.buffer;
  const fileName = req.file.originalname || "schedule.pdf";

  try {
    const hash = hashPdf(buffer);
    const isDup = await checkDuplicate(user.id, hash);
    if (isDup) {
      res.status(409).json({
        error: "This PDF was already imported",
        code: "duplicate",
      });
      return;
    }

    const filePath = await uploadPdfToStorage(user.id, hash, buffer, fileName);
    const pdfRecord = await createPdfRecord(user.id, filePath, fileName, hash);

    try {
      const schedule = await processSchedulePdf(buffer, user.name);
      await upsertShifts(user.id, schedule, pdfRecord.id);
      await saveShiftCoworkers(user.id, schedule, pdfRecord.id);
      await updatePdfStatus(pdfRecord.id, "completed", {
        week_start: schedule.weekStart,
        week_end: schedule.weekEnd,
      });
      res.json({
        success: true,
        shiftsCount: schedule.shifts.length,
        weekStart: schedule.weekStart,
        weekEnd: schedule.weekEnd,
      });
    } catch (pipelineErr) {
      console.error("Manual upload pipeline error:", pipelineErr);
      await updatePdfStatus(pdfRecord.id, "failed", {
        error_msg: String(pipelineErr),
      });
      res.status(422).json({
        error: String(pipelineErr),
        code: "parse_failed",
      });
    }
  } catch (err) {
    console.error("Manual upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
}

scheduleRoutes.post("/upload", (req, res, next) => {
  upload.single("pdf")(req, res, (err: unknown) => {
    if (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Invalid upload (PDF only, max 20MB)",
      });
      return;
    }
    void handleScheduleUpload(req, res);
  });
});
