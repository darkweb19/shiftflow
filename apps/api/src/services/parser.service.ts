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
}`,
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

  parsed.shifts = parsed.shifts.map((shift) => ({
    ...shift,
    coworkers: (shift.coworkers ?? [])
      .map((name) => name.trim())
      .filter((name) => !!name && normalizeName(name) !== normalizeName(employeeName)),
  }));

  return parsed;
}

export async function processSchedulePdf(
  pdfBuffer: Buffer,
  employeeName: string
): Promise<ParsedSchedule> {
  const rawText = await extractTextFromPdf(pdfBuffer);
  return extractShiftsWithAI(rawText, employeeName);
}
