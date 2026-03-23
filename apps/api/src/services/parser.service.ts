import { getEnv } from "../config";
import { getOpenAIClient } from "../lib/openai";

export interface ParsedShift {
	date: string;
	day: string;
	start: string;
	end: string;
	role: string | null;
	station: string | null;
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

const SYSTEM_PROMPT = `You are a work schedule parser for ONE employee only. You receive a weekly work schedule PDF (e.g. Chipotle-style). Read the PDF visually — tables, headers, and cell layout — as the ONLY source of truth. The schedule is a table where:
- Columns are ONE day each: read the printed column headers (Mon, Tue, … or dates) left-to-right. The leftmost schedule column is day 1, the next column is the next calendar day, etc.
- Rows represent different employees
- Each cell contains shift times (e.g., "3:00p-11:45p") and often a station code letter BEFORE the time

Extract ONLY the shifts for the single named employee in the user message. Do not include any other person's shifts, names, or a "coworkers" list — ignore everyone else on the schedule entirely.
Return valid JSON only, no markdown fences.

Accuracy is critical:
- The output must match the PDF for this employee exactly (same worked days, same shift segments, same times, same station/role context).
- Do not invent, smooth, or "fix" schedule entries.
- If a cell is unreadable or ambiguous, skip that shift instead of guessing.

When matching that employee's row, treat all provided name variants as the SAME person.
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
- Read the printed dates and day headers DIRECTLY from the PDF. Map columns left-to-right to consecutive calendar days.
- "weekStart" / "weekEnd" in JSON must match the actual printed week range in the PDF (not "today" and not a guess).
- Only if there is truly no date or header information anywhere, infer a week — otherwise never substitute the current calendar week.

Split shifts:
- If a single day cell has multiple segments (e.g. "T 8:00a-1:00p" and "S 3:00p-6:00p" where T and S are stations), output EACH segment as a separate shift for that SAME column date.
- A split shift with a gap is NOT one continuous shift.

Role code mapping: P=Prep, G=Grill, $=Cashier, B=Board/Expo (and T/S etc. as stations when not column headers).
Timezone rules:
- Treat all shift times as local workplace time in America/Toronto.
- Do not convert times to UTC or any other timezone.
- Convert to 24-hour format as printed in the schedule context (HH:MM), still in Toronto local time.
Omit days with no shift for this employee.

Before final output, run a strict self-check:
- Every emitted shift must be traceable to the named employee row and one specific day column in the PDF.
- No extra shifts, no missing visible shifts for that employee, and no shifts from other employees.
- Confirm each output time range corresponds to the exact PDF segment for that employee before returning JSON.`;

function normalizeName(name: string): string {
	return name.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
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

/** OpenAI file input limit is 50MB per file; stay under with base64 data-URL overhead. */
const MAX_PDF_BYTES = 45 * 1024 * 1024;

async function extractShiftsWithAI(
	pdfBuffer: Buffer,
	employeeName: string,
): Promise<ParsedSchedule> {
	if (pdfBuffer.length > MAX_PDF_BYTES) {
		throw new Error(
			`PDF is too large (${Math.round(pdfBuffer.length / 1024 / 1024)}MB). Max ~45MB.`,
		);
	}

	const client = getOpenAIClient();
	const { OPENAI_MODEL } = getEnv();
	const nameVariants = buildNameVariants(employeeName);

	const userText = `The weekly schedule is attached as a PDF. Read the PDF visually as the ONLY source of truth for the grid, dates, times, and names. Do NOT rely on any text extraction — use only what you can see in the PDF layout.

Employee canonical name: "${employeeName}"
Employee name variants (all represent the same person): ${nameVariants
		.map((n) => `"${n}"`)
		.join(", ")}

Read the printed dates and day headers directly from the PDF. Map columns left-to-right to consecutive calendar days. Do not substitute the current calendar week unless the PDF has no dates at all.

Return JSON with this exact structure (strict JSON: double-quoted keys and strings only, no trailing commas, no comments). Do not add "coworkers" or any extra keys:
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
      "station": "Grill"
    }
  ]
}

Notes:
- If a day has 2 segments for this employee only (ex: "T 8:00a-1:00p" and "S 3:00p-6:00p"), return TWO shift objects (T and S are stations, not weekdays).
- Timezone: all returned shift times must be in America/Toronto local time (no timezone conversion).
- Accuracy requirement: output only what is explicitly visible for this employee in the PDF. Do not guess unclear values.
- Final check before responding: ensure the JSON is a strict user-only transcription of the PDF schedule for this employee.`;

	const pdfDataUrl = `data:application/pdf;base64,${pdfBuffer.toString("base64")}`;

	const response = await client.responses.create({
		model: OPENAI_MODEL,
		instructions: SYSTEM_PROMPT,
		max_output_tokens: 20000,
		input: [
			{
				role: "user",
				content: [
					{
						type: "input_file",
						filename: "weekly-schedule.pdf",
						file_data: pdfDataUrl,
					},
					{
						type: "input_text",
						text: userText,
					},
				],
			},
		],
	});

	if (response.error) {
		throw new Error(
			`OpenAI response error: ${response.error.message ?? JSON.stringify(response.error)}`,
		);
	}

	const outputText = response.output_text?.trim();
	if (!outputText) {
		throw new Error("No text response from OpenAI");
	}

	const parsed = parseModelJsonToSchedule(outputText);

	if (!parsed.shifts || !Array.isArray(parsed.shifts)) {
		throw new Error("Invalid schedule format from OpenAI");
	}

	parsed.shifts = expandMultiSegmentShifts(parsed.shifts);
	syncWeekBoundsFromShifts(parsed);

	return parsed;
}

export async function processSchedulePdf(
	pdfBuffer: Buffer,
	employeeName: string,
): Promise<ParsedSchedule> {
	return extractShiftsWithAI(pdfBuffer, employeeName);
}
