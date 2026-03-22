"use client";

import { useState, useEffect, useCallback } from "react";
import { format, startOfWeek, endOfWeek } from "date-fns";
import { User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WeekPicker } from "@/components/week-picker";
import { StationBadge } from "@/components/station-badge";
import { SkeletonCard } from "@/components/skeleton-card";
import type { Shift } from "@/lib/types";

function formatTime12h(time24: string): string {
  const [h, m] = time24.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m.padStart(2, "0")}${ampm}`;
}

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "day">("day");

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let from: string;
    let to: string;

    if (viewMode === "day") {
      from = format(selectedDate, "yyyy-MM-dd");
      to = from;
    } else {
      const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const we = endOfWeek(selectedDate, { weekStartsOn: 1 });
      from = format(ws, "yyyy-MM-dd");
      to = format(we, "yyyy-MM-dd");
    }

    const { data } = await supabase
      .from("shifts")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("start_time");

    setShifts((data as Shift[]) ?? []);
    setLoading(false);
  }, [selectedDate, viewMode]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  const grouped = shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    const role = shift.role ?? "Shift";
    if (!acc[role]) acc[role] = [];
    acc[role].push(shift);
    return acc;
  }, {});

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="bg-[#3B6FB6] px-5 pb-4 pt-12 text-white">
        <div className="mx-auto max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-bold">Schedule</h1>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <User className="h-5 w-5" />
            </div>
          </div>

          {/* View mode toggle */}
          <div className="mb-4 flex rounded-lg bg-white/20 p-0.5">
            <button
              onClick={() => setViewMode("week")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                viewMode === "week"
                  ? "bg-white text-[#3B6FB6]"
                  : "text-white/80 hover:text-white"
              }`}
            >
              WEEK
            </button>
            <button
              onClick={() => setViewMode("day")}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                viewMode === "day"
                  ? "bg-white text-[#3B6FB6]"
                  : "text-white/80 hover:text-white"
              }`}
            >
              DAY
            </button>
          </div>

          <WeekPicker selectedDate={selectedDate} onDateChange={setSelectedDate} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md px-5 py-4">
        <p className="mb-4 text-center text-xs text-gray-400">
          Last synced {format(new Date(), "h:mma MMM do")}. Pull to refresh.
        </p>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="rounded-xl bg-gray-100 px-4 py-10 text-center text-sm text-gray-400">
            No shifts for this {viewMode === "day" ? "day" : "week"}
          </div>
        ) : (
          <div className="space-y-5">
            {Object.entries(grouped).map(([role, roleShifts]) => (
              <section key={role}>
                <div className="mb-2 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF5F0]">
                    <span className="text-sm">📋</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#2D3748]">
                    {role}
                  </h3>
                </div>

                <div className="space-y-1 rounded-xl bg-white p-3 shadow-sm">
                  {roleShifts.map((shift) => (
                    <div
                      key={shift.id}
                      className="flex items-center justify-between rounded-lg bg-[#FFF8E1]/50 px-3 py-2.5"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-[#2D3748]">
                          {format(new Date(shift.date + "T00:00:00"), "EEE, MMM d")}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <StationBadge station={shift.station} />
                          {shift.notes && (
                            <span className="text-xs text-gray-400">
                              {shift.notes}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-[#2D3748]">
                          {formatTime12h(shift.start_time)}
                        </span>
                        <span className="mx-1.5 text-gray-300">—</span>
                        <span className="text-sm font-medium text-[#2D3748]">
                          {formatTime12h(shift.end_time)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
