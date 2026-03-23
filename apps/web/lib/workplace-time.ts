/**
 * All shift `date` + `start_time` / `end_time` values are treated as calendar wall-clock
 * in the workplace timezone (Toronto). Supabase stores them as `date` + text times — there
 * is no UTC timestamp on shifts; we only normalize how the UI picks "today" and formats labels.
 */
import { formatInTimeZone } from "date-fns-tz";

export const WORKPLACE_TZ = "America/Toronto";

export function formatInstantInWorkplace(instant: Date, pattern: string): string {
  return formatInTimeZone(instant, WORKPLACE_TZ, pattern);
}

/** Calendar YYYY-MM-DD for an instant, in Toronto. */
export function getWorkplaceYmd(instant: Date): string {
  return formatInTimeZone(instant, WORKPLACE_TZ, "yyyy-MM-dd");
}

// ── Pure ISO string date helpers (no JS Date timezone traps) ──

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Day of week from ISO string: Mon=1 … Sun=7 (ISO-8601). */
function isoDayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // Sun=0..Sat=6
  return jsDay === 0 ? 7 : jsDay; // convert to Mon=1..Sun=7
}

/** Add/subtract days from an ISO YYYY-MM-DD string, returns YYYY-MM-DD. */
export function addDaysToIso(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Build a UTC noon Date from an ISO string — safe anchor for formatInTimeZone. */
export function noonUtcFromIso(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Mon–Sun range (YYYY-MM-DD) for the Toronto week containing `instant`. */
export function getWorkplaceWeekRange(instant: Date): { from: string; to: string } {
  const todayIso = getWorkplaceYmd(instant);
  const dow = isoDayOfWeek(todayIso); // Mon=1..Sun=7
  const monday = addDaysToIso(todayIso, 1 - dow);
  const sunday = addDaysToIso(todayIso, 7 - dow);
  return { from: monday, to: sunday };
}

/** Label for a shift row: stored `date` is a Toronto workday (no timezone in DB). */
export function formatShiftStoredDate(ymd: string): string {
  return formatInTimeZone(noonUtcFromIso(ymd), WORKPLACE_TZ, "EEE, MMM d");
}

/** Split day header for stacked layout (e.g. THU + Mar 26). */
export function formatDayHeaderParts(ymd: string): { dow: string; monthDay: string } {
  const noon = noonUtcFromIso(ymd);
  return {
    dow: formatInTimeZone(noon, WORKPLACE_TZ, "EEE").toUpperCase(),
    monthDay: formatInTimeZone(noon, WORKPLACE_TZ, "MMM d"),
  };
}

export function isSameWorkplaceCalendarDay(a: Date, b: Date): boolean {
  return getWorkplaceYmd(a) === getWorkplaceYmd(b);
}

export function isWorkplaceToday(d: Date): boolean {
  return isSameWorkplaceCalendarDay(d, new Date());
}
