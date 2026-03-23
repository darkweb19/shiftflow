/**
 * All shift `date` + `start_time` / `end_time` values are treated as calendar wall-clock
 * in the workplace timezone (Toronto). Supabase stores them as `date` + text times — there
 * is no UTC timestamp on shifts; we only normalize how the UI picks "today" and formats labels.
 */
import { endOfWeek, startOfWeek } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

export const WORKPLACE_TZ = "America/Toronto";

export function formatInstantInWorkplace(instant: Date, pattern: string): string {
  return formatInTimeZone(instant, WORKPLACE_TZ, pattern);
}

/** Calendar YYYY-MM-DD for an instant, in Toronto. */
export function getWorkplaceYmd(instant: Date): string {
  return formatInTimeZone(instant, WORKPLACE_TZ, "yyyy-MM-dd");
}

/** Mon–Sun range (YYYY-MM-DD) for the Toronto week containing `instant`. */
export function getWorkplaceWeekRange(instant: Date): { from: string; to: string } {
  const z = toZonedTime(instant, WORKPLACE_TZ);
  const ws = startOfWeek(z, { weekStartsOn: 1 });
  const we = endOfWeek(z, { weekStartsOn: 1 });
  return {
    from: formatInTimeZone(ws, WORKPLACE_TZ, "yyyy-MM-dd"),
    to: formatInTimeZone(we, WORKPLACE_TZ, "yyyy-MM-dd"),
  };
}

/** Label for a shift row: stored `date` is a Toronto workday (no timezone in DB). */
export function formatShiftStoredDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  return formatInTimeZone(noonUtc, WORKPLACE_TZ, "EEE, MMM d");
}

export function isSameWorkplaceCalendarDay(a: Date, b: Date): boolean {
  return getWorkplaceYmd(a) === getWorkplaceYmd(b);
}

export function isWorkplaceToday(d: Date): boolean {
  return isSameWorkplaceCalendarDay(d, new Date());
}
