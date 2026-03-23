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

export async function saveShiftCoworkers(
  userId: string,
  schedule: ParsedSchedule,
  pdfId: string
) {
  const supabase = getSupabaseAdmin();

  const { data: createdShifts, error: shiftsError } = await supabase
    .from("shifts")
    .select("id")
    .eq("user_id", userId)
    .eq("source_pdf_id", pdfId);

  if (shiftsError) {
    throw new Error(`Failed to fetch saved shifts: ${shiftsError.message}`);
  }

  const shiftIds = (createdShifts ?? []).map((s) => s.id);
  if (shiftIds.length === 0) return;

  const { error: deleteError } = await supabase
    .from("shift_coworkers")
    .delete()
    .in("shift_id", shiftIds);

  if (deleteError) {
    throw new Error(`Failed to clear shift coworkers: ${deleteError.message}`);
  }
}
