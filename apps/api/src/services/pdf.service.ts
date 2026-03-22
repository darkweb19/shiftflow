import crypto from "crypto";
import { getSupabaseAdmin } from "../lib/supabase";

export function hashPdf(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export async function uploadPdfToStorage(
  userId: string,
  hash: string,
  buffer: Buffer,
  fileName: string
) {
  const supabase = getSupabaseAdmin();
  const filePath = `${userId}/${hash}.pdf`;

  const { error } = await supabase.storage
    .from("schedule-pdfs")
    .upload(filePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (error && !error.message.includes("already exists")) {
    throw new Error(`Storage upload failed: ${error.message}`);
  }

  return filePath;
}

export async function checkDuplicate(userId: string, hash: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("pdfs")
    .select("id")
    .eq("user_id", userId)
    .eq("hash", hash)
    .maybeSingle();

  return !!data;
}

export async function createPdfRecord(
  userId: string,
  filePath: string,
  fileName: string,
  hash: string
) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("pdfs")
    .insert({
      user_id: userId,
      file_path: filePath,
      file_name: fileName,
      hash,
      status: "processing",
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create PDF record: ${error.message}`);
  return data;
}

export async function updatePdfStatus(
  pdfId: string,
  status: "completed" | "failed",
  extra?: { week_start?: string; week_end?: string; error_msg?: string }
) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("pdfs")
    .update({ status, ...extra })
    .eq("id", pdfId);
}
