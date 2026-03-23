"use client";

import { StationBadge } from "./station-badge";
import type { Shift } from "@/lib/types";
import { formatShiftStoredDate } from "@/lib/workplace-time";

function formatTime12h(time24: string): string {
  const parts = time24.split(":").filter(Boolean);
  const h = parts[0] ?? "0";
  const m = (parts[1] ?? "00").slice(0, 2);
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time24;
  const ampm = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m}${ampm}`;
}

export function ShiftCard({ shift }: { shift: Shift }) {
  const label = formatShiftStoredDate(shift.date);
  const [weekdayPart, ...rest] = label.split(",");
  const dayAbbr = (weekdayPart ?? "").trim().toUpperCase();
  const monthDay = rest.join(",").trim();

  return (
    <div className="flex items-center gap-4 rounded-xl bg-[#FFF5F0] px-4 py-4 shadow-sm">
      <div className="min-w-[60px] text-center">
        <div className="text-sm font-bold text-[#3B6FB6]">{dayAbbr}</div>
        <div className="text-xs text-gray-500">{monthDay}</div>
      </div>

      <div className="h-10 w-px bg-gray-200" />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-[#D35649]">
          {shift.role ?? "Shift"}
        </div>
        <div className="text-sm text-[#2D3748]">
          {formatTime12h(shift.start_time)} to {formatTime12h(shift.end_time)}
        </div>
      </div>

      <StationBadge station={shift.station} />
    </div>
  );
}
