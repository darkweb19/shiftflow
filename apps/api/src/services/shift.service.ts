import { getSupabaseAdmin } from "../lib/supabase";
import { ParsedSchedule } from "./parser.service";

export async function upsertShifts(
  userId: string,
  schedule: ParsedSchedule,
  pdfId: string
) {
  const supabase = getSupabaseAdmin();

  const shifts = schedule.shifts.map((s) => ({
    user_id: userId,
    date: s.date,
    start_time: s.start,
    end_time: s.end,
    role: s.role,
    station: s.station,
    source_pdf_id: pdfId,
  }));

  if (shifts.length === 0) return;

  const { error } = await supabase.from("shifts").upsert(shifts, {
    onConflict: "user_id,date,start_time,end_time",
  });

  if (error) {
    throw new Error(`Failed to upsert shifts: ${error.message}`);
  }
}
