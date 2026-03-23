import { getSupabaseAdmin } from "../lib/supabase";
import { ParsedSchedule } from "./parser.service";

function normalizeTimeForKey(input: string): string {
  const raw = input.trim().toLowerCase();
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!match) return raw;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[4];

  if (meridiem) {
    if (meridiem === "pm" && hours !== 12) hours += 12;
    if (meridiem === "am" && hours === 12) hours = 0;
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

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
    .select("id, date, start_time, end_time")
    .eq("user_id", userId)
    .eq("source_pdf_id", pdfId);

  if (shiftsError) {
    throw new Error(`Failed to fetch saved shifts: ${shiftsError.message}`);
  }

  const shiftKeyToId = new Map<string, string>();
  for (const shift of createdShifts ?? []) {
    const key = `${shift.date}|${normalizeTimeForKey(shift.start_time)}|${normalizeTimeForKey(
      shift.end_time
    )}`;
    shiftKeyToId.set(key, shift.id);
  }

  const shiftIds = (createdShifts ?? []).map((s) => s.id);
  if (shiftIds.length > 0) {
    const { error: deleteError } = await supabase
      .from("shift_coworkers")
      .delete()
      .in("shift_id", shiftIds);

    if (deleteError) {
      throw new Error(`Failed to clear old coworkers: ${deleteError.message}`);
    }
  }

  const coworkerRows: Array<{
    user_id: string;
    shift_id: string;
    coworker_name: string;
    start_time: string | null;
    end_time: string | null;
    station: string | null;
    role: string | null;
  }> = [];

  for (const shift of schedule.shifts) {
    const key = `${shift.date}|${normalizeTimeForKey(shift.start)}|${normalizeTimeForKey(
      shift.end
    )}`;
    const shiftId = shiftKeyToId.get(key);
    if (!shiftId) continue;

    for (const c of shift.coworkers ?? []) {
      const name = typeof c === "string" ? c.trim() : c.name?.trim();
      if (!name) continue;
      const start =
        typeof c === "string" ? null : c.start ? normalizeTimeForKey(c.start) : null;
      const end = typeof c === "string" ? null : c.end ? normalizeTimeForKey(c.end) : null;
      const station = typeof c === "string" ? null : c.station?.trim() || null;
      const role = typeof c === "string" ? null : c.role?.trim() || null;
      coworkerRows.push({
        user_id: userId,
        shift_id: shiftId,
        coworker_name: name,
        start_time: start,
        end_time: end,
        station,
        role,
      });
    }
  }

  if (coworkerRows.length === 0) return;

  const { error: insertError } = await supabase
    .from("shift_coworkers")
    .upsert(coworkerRows, { onConflict: "shift_id,coworker_name" });

  if (insertError) {
    throw new Error(`Failed to save shift coworkers: ${insertError.message}`);
  }
}
