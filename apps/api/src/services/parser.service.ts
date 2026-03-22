import pdfParse from "pdf-parse";
import { getAnthropicClient } from "../lib/anthropic";

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

const SYSTEM_PROMPT = `You are a work schedule parser. You receive raw text extracted from a weekly work schedule PDF (like Chipotle format). The schedule is a table where:
- Columns represent days of the week (Monday through Sunday)
- Rows represent different employees
- Each cell contains shift times (e.g., "3:00p-11:45p") and possibly role/station codes

Extract ONLY the shifts for the specified employee. Return valid JSON only, no markdown fences.

Role code mapping: P=Prep, G=Grill, $=Cashier, B=Board/Expo.
Convert all times to 24-hour format (HH:MM). Omit days with no shift.
If you cannot determine the exact dates, use the current week's dates starting from Monday.`;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}

export async function extractShiftsWithAI(
  rawText: string,
  employeeName: string
): Promise<ParsedSchedule> {
  const client = getAnthropicClient();

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Employee name: "${employeeName}"

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
      "station": "Grill"
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

  return parsed;
}

export async function processSchedulePdf(
  pdfBuffer: Buffer,
  employeeName: string
): Promise<ParsedSchedule> {
  const rawText = await extractTextFromPdf(pdfBuffer);
  return extractShiftsWithAI(rawText, employeeName);
}
