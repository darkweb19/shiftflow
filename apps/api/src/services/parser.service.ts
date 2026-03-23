import pdfParse from "pdf-parse";
import { getAnthropicClient } from "../lib/anthropic";

export interface ParsedShift {
  date: string;
  day: string;
  start: string;
  end: string;
  role: string | null;
  station: string | null;
  coworkers?: string[];
}

export interface ParsedSchedule {
  weekStart: string;
  weekEnd: string;
  shifts: ParsedShift[];
}

const SYSTEM_PROMPT = `You are a work schedule parser. You receive raw text extracted from a weekly work schedule PDF (like Chipotle format). The schedule is a table where:
- Columns represent days of the week (Monday through Sunday)
- Rows represent different employees
- Each cell contains shift times (e.g., "3:00p-11:45p") and possibly role/station codes

Extract ONLY the shifts for the specified employee. Return valid JSON only, no markdown fences.
When matching the employee row, treat all provided name variants as the SAME person.
Name matching rules:
- Ignore case differences
- Ignore commas, periods, and extra spaces
- Consider "First Last" and "Last, First" equivalent
- Use the closest exact row match to the provided variants
- IMPORTANT: if a single day cell has multiple segments (for example "T 8:00a-1:00p" and "S 3:00p-6:00p"),
  output EACH segment as a separate shift object for that same date.
- A split shift with a gap (e.g. 8:00a-1:00p and 3:00p-6:00p) is NOT one continuous shift.
- Infer station from the segment code when present (examples: G=Grill, B=Board, $=Cashier, P=Prep, T, S).
- For each returned shift segment, include coworkers who overlap in time on that date.

Role code mapping: P=Prep, G=Grill, $=Cashier, B=Board/Expo.
Convert all times to 24-hour format (HH:MM). Omit days with no shift.
If you cannot determine the exact dates, use the current week's dates starting from Monday.`;

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  employeeName: string
): Promise<ParsedSchedule> {
  const client = getAnthropicClient();
  const nameVariants = buildNameVariants(employeeName);

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Employee canonical name: "${employeeName}"
Employee name variants (all represent the same person): ${nameVariants
          .map((n) => `"${n}"`)
          .join(", ")}

Raw schedule text:
---
${rawText}
---

Return JSON with this exact structure:
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
      "coworkers": ["First Last", "Last, First"]
    }
  ]
}

Notes:
- If a day has 2 segments for the employee (ex: "T 8:00a-1:00p" and "S 3:00p-6:00p"), return TWO shift objects.
- coworkers must be for the SAME date and overlapping time window of that shift segment.`,
      },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude");
  }

  const jsonStr = textBlock.text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(jsonStr) as ParsedSchedule;

  if (!parsed.shifts || !Array.isArray(parsed.shifts)) {
    throw new Error("Invalid schedule format from Claude");
  }

  parsed.shifts = expandMultiSegmentShifts(parsed.shifts).map((shift) => {
    const seen = new Set<string>();
    const coworkers = (shift.coworkers ?? [])
      .map((name) => name.trim())
      .filter((name) => !!name && normalizeName(name) !== normalizeName(employeeName))
      .filter((name) => {
        const key = normalizeName(name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return {
      ...shift,
      coworkers,
    };
  });

  return parsed;
}

export async function processSchedulePdf(
  pdfBuffer: Buffer,
  employeeName: string
): Promise<ParsedSchedule> {
  const rawText = await extractTextFromPdf(pdfBuffer);
  return extractShiftsWithAI(rawText, employeeName);
}
