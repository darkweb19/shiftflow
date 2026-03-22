"use client";

import { useState, useCallback } from "react";
import {
  startOfWeek,
  addDays,
  subWeeks,
  addWeeks,
  format,
  isSameDay,
  isToday,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface WeekPickerProps {
  selectedDate: Date;
  onDateChange: (date: Date) => void;
}

export function WeekPicker({ selectedDate, onDateChange }: WeekPickerProps) {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(selectedDate, { weekStartsOn: 1 })
  );

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const goBack = useCallback(() => {
    setWeekStart((prev) => subWeeks(prev, 1));
  }, []);

  const goForward = useCallback(() => {
    setWeekStart((prev) => addWeeks(prev, 1));
  }, []);

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
          const selected = isSameDay(day, selectedDate);
          const today = isToday(day);
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
              <span className="font-medium">{format(day, "EEE")}</span>
              <span className="text-lg font-bold leading-tight">
                {format(day, "d")}
              </span>
              <span className="uppercase text-[10px] tracking-wider opacity-80">
                {format(day, "MMM")}
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
