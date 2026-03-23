import pdfParse from "pdf-parse";
import { getAnthropicClient } from "../lib/anthropic";

/** Coworker row for the same day column as the employee shift (their times + station from PDF). */
export interface ParsedCoworkerShift {
	name: string;
	start: string;
	end: string;
	station: string | null;
	role: string | null;
}

export interface ParsedShift {
	date: string;
	day: string;
	start: string;
	end: string;
	role: string | null;
	station: string | null;
	coworkers?: Array<ParsedCoworkerShift | string>;
}

export interface ParsedSchedule {
	weekStart: string;
	weekEnd: string;
	shifts: ParsedShift[];
}

/** Strip invalid trailing commas before } or ] (common in model output). */
function repairTrailingCommasInJson(json: string): string {
	return json.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Extract first top-level `{ ... }` balancing braces while respecting strings.
 */
function extractBalancedJsonObject(raw: string): string | null {
	const start = raw.indexOf("{");
	if (start === -1) return null;
	let depth = 0;
	let i = start;
	let inStr = false;
	let strQuote: '"' | "'" | null = null;

	while (i < raw.length) {
		const c = raw[i];
		if (inStr) {
			if (c === "\\" && i + 1 < raw.length) {
				i += 2;
				continue;
			}
			if (c === strQuote) {
				inStr = false;
				strQuote = null;
			}
			i++;
			continue;
		}
		if (c === '"' || c === "'") {
			inStr = true;
			strQuote = c as '"' | "'";
			i++;
			continue;
		}
		if (c === "{") depth++;
		else if (c === "}") {
			depth--;
			if (depth === 0) return raw.slice(start, i + 1);
		}
		i++;
	}
	return null;
}

function parseModelJsonToSchedule(text: string): ParsedSchedule {
	const cleaned = text
		.replace(/```json?\s*/gi, "")
		.replace(/```/g, "")
		.trim();

	const attempts: Array<{ label: string; json: string }> = [
		{ label: "direct", json: cleaned },
		{
			label: "trailing-comma-fix",
			json: repairTrailingCommasInJson(cleaned),
		},
	];

	const extracted = extractBalancedJsonObject(cleaned);
	if (extracted) {
		attempts.push({ label: "extracted", json: extracted });
		attempts.push({
			label: "extracted+trailing-comma-fix",
			json: repairTrailingCommasInJson(extracted),
		});
	}

	let lastError: unknown;
	for (const { json } of attempts) {
		try {
			const parsed = JSON.parse(json) as ParsedSchedule;
			if (parsed && Array.isArray(parsed.shifts)) {
				return parsed;
			}
		} catch (e) {
			lastError = e;
		}
	}

	const hint =
		lastError instanceof Error
			? `${lastError.message} (try increasing max_tokens if JSON was cut off)`
			: String(lastError);
	throw new Error(`Failed to parse AI schedule JSON: ${hint}`);
}

const SYSTEM_PROMPT = `You are a work schedule parser. You receive raw text extracted from a weekly work schedule PDF (like Chipotle format). The schedule is a table where:
- Columns are ONE day each: read the printed column headers (Mon, Tue, … or dates) left-to-right. The leftmost schedule column is day 1, the next column is the next calendar day, etc.
- Rows represent different employees
- Each cell contains shift times (e.g., "3:00p-11:45p") and often a station code letter BEFORE the time

Extract ONLY the shifts for the specified employee. Return valid JSON only, no markdown fences.
When matching the employee row, treat all provided name variants as the SAME person.
Name matching rules:
- Ignore case differences
- Ignore commas, periods, and extra spaces
- Consider "First Last" and "Last, First" equivalent
- Use the closest exact row match to the provided variants

CRITICAL — station codes vs weekdays:
- Letters like T, S, G, P, B, $ at the start of a cell (before times) are STATION / role codes (e.g. Tortilla, Salsa, Grill, Prep, Board, Cashier) — NOT weekdays.
- NEVER treat "T" as Tuesday or "S" as Saturday/Sunday from inside a cell.
- The weekday for each shift MUST come from the COLUMN HEADER only (e.g. MON, Monday, or a date under that column).

Date rules:
- If the user message includes DETECTED_SCHEDULE_ANCHOR dates from the PDF, you MUST set each shift's "date" and "day" to match that grid: leftmost column = anchor date, then each column to the right is the next calendar day.
- "weekStart" / "weekEnd" in JSON must match the actual printed week in the PDF (not "today" and not a guess).
- Only if there is truly no date or header information anywhere, infer a week — otherwise never substitute the current calendar week.

Split shifts:
- If a single day cell has multiple segments (e.g. "T 8:00a-1:00p" and "S 3:00p-6:00p" where T and S are stations), output EACH segment as a separate shift for that SAME column date.
- A split shift with a gap is NOT one continuous shift.

Coworkers: For each employee shift segment, list EVERY other worker scheduled that same calendar day column with their own shift details (even if times match exactly). For each coworker include: name, their start/end in 24-hour HH:MM, station (Grill, Board, Cashier, etc.), and role/job title if visible. Read their row in the PDF for that day column.

Role code mapping: P=Prep, G=Grill, $=Cashier, B=Board/Expo (and T/S etc. as stations when not column headers).
Convert all times to 24-hour format (HH:MM). Omit days with no shift.`;

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCoworkerEntry(
	raw: unknown,
	employeeName: string,
): ParsedCoworkerShift | null {
	if (typeof raw === "string") {
		const name = raw.trim();
		if (!name || normalizeName(name) === normalizeName(employeeName))
			return null;
		return { name, start: "", end: "", station: null, role: null };
	}
	if (raw && typeof raw === "object") {
		const o = raw as Record<string, unknown>;
		const name = String(o.name ?? o.coworker_name ?? "").trim();
		if (!name || normalizeName(name) === normalizeName(employeeName))
			return null;
		const start = String(o.start ?? o.start_time ?? "").trim();
		const end = String(o.end ?? o.end_time ?? "").trim();
		const station =
			o.station != null && o.station !== ""
				? String(o.station).trim()
				: null;
		const role =
			o.role != null && o.role !== "" ? String(o.role).trim() : null;
		return { name, start, end, station, role };
	}
	return null;
}

function buildNameVariants(employeeName: string): string[] {
	const normalized = normalizeName(employeeName);
	const parts = normalized.split(" ").filter(Boolean);
	const variants = new Set<string>();

	variants.add(employeeName.trim());
	variants.add(normalized);

	if (parts.length >= 2) {
		const first = parts[0];
		const last = parts[parts.length - 1];
		const middle = parts.slice(1, -1).join(" ");

		const firstLast = [first, middle, last].filter(Boolean).join(" ");
		const lastFirst = [last, first, middle].filter(Boolean).join(" ");
		const lastCommaFirst = [last, `${first}${middle ? ` ${middle}` : ""}`]
			.join(", ")
			.trim();

		variants.add(firstLast);
		variants.add(lastFirst);
		variants.add(lastCommaFirst);
	}

	return Array.from(variants).filter(Boolean);
}

function pad2(n: number): string {
	return String(n).padStart(2, "0");
}

/** Parse US-style M/D/YYYY (or M-D-YY) into YYYY-MM-DD. */
function parseUsDateToIso(
	month: number,
	day: number,
	yearIn: number,
): string | null {
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	let year = yearIn;
	if (year < 100) year += 2000;
	if (year < 2000 || year > 2100) return null;
	return `${year}-${pad2(month)}-${pad2(day)}`;
}

function utcDowFromIso(iso: string): number {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function addDaysIso(iso: string, deltaDays: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
	const dt = new Date(t);
	return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function mondayOfWeekContaining(iso: string): string {
	const dow = utcDowFromIso(iso);
	const daysSinceMonday = (dow + 6) % 7;
	return addDaysIso(iso, -daysSinceMonday);
}

/** Map AI "day" string to JS getUTCDay() (Sun=0 … Sat=6). */
function parseDayNameToUtcDow(day: string | undefined): number | null {
	if (!day) return null;
	const n = day.trim().toLowerCase().replace(/\./g, "");
	if (n.startsWith("sun")) return 0;
	if (n.startsWith("mon")) return 1;
	if (n.startsWith("tue")) return 2;
	if (n.startsWith("wed")) return 3;
	if (n.startsWith("thu")) return 4;
	if (n.startsWith("fri")) return 5;
	if (n.startsWith("sat")) return 6;
	return null;
}

/**
 * Try to read a printed week range from extracted PDF text (often near the top).
 * Returns the calendar date for the LEFTmost day column (chronologically first of the pair).
 */
export function extractScheduleAnchorFromRawText(text: string): {
	firstColumnIso: string;
	lastColumnIso?: string;
} | null {
	const head = text.slice(0, 8000);

	const rangeRe =
		/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\s*[-–—]\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g;
	let match: RegExpExecArray | null;
	while ((match = rangeRe.exec(head)) !== null) {
		const iso1 = parseUsDateToIso(
			Number(match[1]),
			Number(match[2]),
			Number(match[3]),
		);
		const iso2 = parseUsDateToIso(
			Number(match[4]),
			Number(match[5]),
			Number(match[6]),
		);
		if (!iso1 || !iso2) continue;
		const [first, last] = iso1 <= iso2 ? [iso1, iso2] : [iso2, iso1];
		const spanExclusive = Math.round(
			(Date.parse(`${last}T12:00:00Z`) -
				Date.parse(`${first}T12:00:00Z`)) /
				86400000,
		);
		const inclusiveDays = spanExclusive + 1;
		if (inclusiveDays >= 6 && inclusiveDays <= 8) {
			return { firstColumnIso: first, lastColumnIso: last };
		}
	}

	const weekOf = head.match(
		/week\s+of:?\s*(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i,
	);
	if (weekOf) {
		const iso = parseUsDateToIso(
			Number(weekOf[1]),
			Number(weekOf[2]),
			Number(weekOf[3]),
		);
		if (iso) return { firstColumnIso: iso };
	}

	return null;
}

/**
 * Recompute each shift's calendar date from the weekday name + known first-column date.
 * Fixes off-by-one errors when the model mis-maps columns to dates.
 */
function realignShiftDatesToFirstColumn(
	shifts: ParsedShift[],
	firstColumnIso: string,
): ParsedShift[] {
	const firstDow = utcDowFromIso(firstColumnIso);
	return shifts.map((shift) => {
		const targetDow = parseDayNameToUtcDow(shift.day);
		if (targetDow === null) return shift;
		const delta = (targetDow - firstDow + 7) % 7;
		return { ...shift, date: addDaysIso(firstColumnIso, delta) };
	});
}

function syncWeekBoundsFromShifts(schedule: ParsedSchedule): void {
	const dates = schedule.shifts
		.map((s) => s.date)
		.filter(Boolean)
		.sort();
	if (dates.length === 0) return;
	const min = dates[0];
	const max = dates[dates.length - 1];
	const startMonday = mondayOfWeekContaining(min);
	const endMonday = mondayOfWeekContaining(max);
	schedule.weekStart = startMonday;
	schedule.weekEnd = addDaysIso(endMonday, 6);
}

function expandMultiSegmentShifts(shifts: ParsedShift[]): ParsedShift[] {
	const expanded: ParsedShift[] = [];

	for (const shift of shifts) {
		// Fast path for structured multi-part output like "08:00|15:00" + "13:00|18:00".
		const startParts = shift.start.split(/\s*[|,/;]\s*/).filter(Boolean);
		const endParts = shift.end.split(/\s*[|,/;]\s*/).filter(Boolean);

		if (startParts.length > 1 && startParts.length === endParts.length) {
			for (let i = 0; i < startParts.length; i++) {
				expanded.push({
					...shift,
					start: startParts[i],
					end: endParts[i],
				});
			}
			continue;
		}

		// Fallback for less structured responses where multiple ranges are packed into
		// start/end fields (or one side) as text like:
		// "T 8:00a - 1:00p S 3:00p - 6:00p" or "08:00-13:00 and 15:00-18:00".
		const combinedText = `${shift.start} ${shift.end}`;
		const pairRegex =
			/(\d{1,2}:\d{2}\s*[ap]m|\d{1,2}:\d{2})\s*(?:-|–|—|to)\s*(\d{1,2}:\d{2}\s*[ap]m|\d{1,2}:\d{2})/gi;
		const extractedPairs: Array<{ start: string; end: string }> = [];
		let match: RegExpExecArray | null;
		while ((match = pairRegex.exec(combinedText)) !== null) {
			extractedPairs.push({
				start: match[1].trim(),
				end: match[2].trim(),
			});
		}

		if (extractedPairs.length > 1) {
			for (const pair of extractedPairs) {
				expanded.push({
					...shift,
					start: pair.start,
					end: pair.end,
				});
			}
			continue;
		}

		expanded.push(shift);
	}

	return expanded;
}

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
	const result = await pdfParse(buffer);
	return result.text;
}

export async function extractShiftsWithAI(
	rawText: string,
	employeeName: string,
): Promise<ParsedSchedule> {
	const client = getAnthropicClient();
	const nameVariants = buildNameVariants(employeeName);
	const anchor = extractScheduleAnchorFromRawText(rawText);

	const anchorInstructions = anchor
		? `
DETECTED_SCHEDULE_ANCHOR (parsed from the PDF text — you MUST align column dates to this):
- The LEFTmost day column in the schedule grid corresponds to calendar date: ${anchor.firstColumnIso}
${anchor.lastColumnIso ? `- Printed range ends around: ${anchor.lastColumnIso} (columns should span consecutive days between these)` : ""}
- Each column to the right is the next calendar day.
- Set "day" to the COLUMN weekday (Monday, Tuesday, …). Do not infer weekday from single letters inside cells (T/S/G/P/B/$ are stations).
`
		: `
No week range was auto-detected in the first lines of text. Read any printed dates or day headers in the PDF and map columns left-to-right to consecutive calendar days. Do not substitute the current calendar week unless the PDF has no dates at all.
`;

	const message = await client.messages.create({
		model: "claude-sonnet-4-20250514",
		max_tokens: 10000,
		system: SYSTEM_PROMPT,
		messages: [
			{
				role: "user",
				content: `Employee canonical name: "${employeeName}"
Employee name variants (all represent the same person): ${nameVariants
					.map((n) => `"${n}"`)
					.join(", ")}
${anchorInstructions}

Raw schedule text:
---
${rawText}
---

Return JSON with this exact structure (strict JSON: double-quoted keys and strings only, no trailing commas, no comments):
{
  "weekStart": "YYYY-MM-DD",
  "weekEnd": "YYYY-MM-DD",
  "shifts": [
    {
      "date": "YYYY-MM-DD",
      "day": "Monday",
      "start": "HH:MM",
      "end": "HH:MM",
      "role": "Kitchen Staff",
      "station": "Grill",
      "coworkers": [
        {
          "name": "First Last",
          "start": "10:00",
          "end": "22:30",
          "station": "Board",
          "role": "Kitchen Staff"
        }
      ]
    }
  ]
}

Notes:
- If a day has 2 segments for the employee (ex: "T 8:00a-1:00p" and "S 3:00p-6:00p"), return TWO shift objects (T and S are stations, not weekdays).
- coworkers: array of objects (not plain strings). List all other workers in that same day column with their own start, end, station, and role from the PDF. Include everyone scheduled that day even if times are identical.`,
			},
		],
	});

	const textBlock = message.content.find((b) => b.type === "text");
	if (!textBlock || textBlock.type !== "text") {
		throw new Error("No text response from Claude");
	}

	const parsed = parseModelJsonToSchedule(textBlock.text);

	if (!parsed.shifts || !Array.isArray(parsed.shifts)) {
		throw new Error("Invalid schedule format from Claude");
	}

	let shifts: ParsedShift[] = expandMultiSegmentShifts(parsed.shifts).map(
		(shift) => {
			const seen = new Set<string>();
			const coworkers: ParsedCoworkerShift[] = [];
			for (const raw of shift.coworkers ?? []) {
				const c = normalizeCoworkerEntry(raw, employeeName);
				if (!c) continue;
				const key = normalizeName(c.name);
				if (seen.has(key)) continue;
				seen.add(key);
				coworkers.push(c);
			}

			return {
				...shift,
				coworkers,
			};
		},
	);

	if (anchor) {
		shifts = realignShiftDatesToFirstColumn(shifts, anchor.firstColumnIso);
	}
	parsed.shifts = shifts;
	syncWeekBoundsFromShifts(parsed);

	return parsed;
}

export async function processSchedulePdf(
	pdfBuffer: Buffer,
	employeeName: string,
): Promise<ParsedSchedule> {
	const rawText = await extractTextFromPdf(pdfBuffer);
	return extractShiftsWithAI(rawText, employeeName);
}
