"use client";

import { useCallback, useMemo } from "react";
import { startOfWeek, addDays, subWeeks, addWeeks } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isSameWorkplaceCalendarDay,
  isWorkplaceToday,
  WORKPLACE_TZ,
} from "@/lib/workplace-time";

interface WeekPickerProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

/** Week strip + arrows stay in sync with selectedDate (no desynced internal week state). */
export function WeekPicker({ selectedDate, onDateChange }: WeekPickerProps) {
  const weekStart = useMemo(() => {
    const z = toZonedTime(selectedDate, WORKPLACE_TZ);
    return startOfWeek(z, { weekStartsOn: 1 });
  }, [selectedDate]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const goBack = useCallback(() => {
    onDateChange(subWeeks(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  const goForward = useCallback(() => {
    onDateChange(addWeeks(selectedDate, 1));
  }, [selectedDate, onDateChange]);

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={goBack}
        className="rounded-full p-1 hover:bg-white/20 transition-colors"
        aria-label="Previous week"
      >
        <ChevronLeft className="h-5 w-5 text-white" />
      </button>

      <div className="flex flex-1 justify-around gap-1">
        {days.map((day) => {
          const selected = isSameWorkplaceCalendarDay(day, selectedDate);
          const today = isWorkplaceToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onDateChange(day)}
              className={cn(
                "flex flex-col items-center rounded-lg px-2 py-1.5 text-xs transition-all",
                selected
                  ? "bg-white text-[#3B6FB6] font-bold shadow-sm"
                  : "text-white/90 hover:bg-white/10",
                today && !selected && "ring-1 ring-white/50"
              )}
            >
              <span className="font-medium">
                {formatInTimeZone(day, WORKPLACE_TZ, "EEE")}
              </span>
              <span className="text-lg font-bold leading-tight">
                {formatInTimeZone(day, WORKPLACE_TZ, "d")}
              </span>
              <span className="uppercase text-[10px] tracking-wider opacity-80">
                {formatInTimeZone(day, WORKPLACE_TZ, "MMM")}
              </span>
            </button>
          );
        })}
      </div>

      <button
        onClick={goForward}
        className="rounded-full p-1 hover:bg-white/20 transition-colors"
        aria-label="Next week"
      >
        <ChevronRight className="h-5 w-5 text-white" />
      </button>
    </div>
  );
}
