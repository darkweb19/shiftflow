"use client";

import { useState, useEffect, useCallback } from "react";
import { User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { WeekPicker } from "@/components/week-picker";
import { StationBadge } from "@/components/station-badge";
import { SkeletonCard } from "@/components/skeleton-card";
import type { Shift, ShiftCoworker } from "@/lib/types";
import {
  formatInstantInWorkplace,
  formatShiftStoredDate,
  getWorkplaceWeekRange,
  getWorkplaceYmd,
} from "@/lib/workplace-time";

function formatTime12h(time24: string): string {
  const parts = time24.split(":").filter(Boolean);
  const h = parts[0] ?? "0";
  const m = (parts[1] ?? "00").slice(0, 2);
  const hour = parseInt(h, 10);
  if (Number.isNaN(hour)) return time24;
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m.padStart(2, "0")}${ampm}`;
}

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [coworkersByShiftId, setCoworkersByShiftId] = useState<
    Record<string, ShiftCoworker[]>
  >({});
  const [myDisplayName, setMyDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"week" | "day">("week");

  const fetchShifts = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .single();
      setMyDisplayName(profile?.name?.trim() || null);
    } else {
      setMyDisplayName(null);
    }

    let from: string;
    let to: string;

    if (viewMode === "day") {
      from = getWorkplaceYmd(selectedDate);
      to = from;
    } else {
      const range = getWorkplaceWeekRange(selectedDate);
      from = range.from;
      to = range.to;
    }

    const { data } = await supabase
      .from("shifts")
      .select("*")
      .gte("date", from)
      .lte("date", to)
      .order("date")
      .order("start_time");

    const fetchedShifts = (data as Shift[]) ?? [];
    setShifts(fetchedShifts);

    if (fetchedShifts.length > 0) {
      const shiftIds = fetchedShifts.map((s) => s.id);
      const { data: coworkerRows } = await supabase
        .from("shift_coworkers")
        .select("*")
        .in("shift_id", shiftIds)
        .order("coworker_name");

      const map: Record<string, ShiftCoworker[]> = {};
      for (const row of (coworkerRows as ShiftCoworker[]) ?? []) {
        if (!map[row.shift_id]) map[row.shift_id] = [];
        map[row.shift_id].push(row);
      }
      for (const id of Object.keys(map)) {
        map[id].sort((a, b) => {
          const ta = a.start_time ?? "";
          const tb = b.start_time ?? "";
          if (ta !== tb) return ta.localeCompare(tb);
          return a.coworker_name.localeCompare(b.coworker_name);
        });
      }
      setCoworkersByShiftId(map);
    } else {
      setCoworkersByShiftId({});
    }

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
      <header className="bg-[#3B6FB6] px-5 pb-4 pt-12 text-white">
        <div className="mx-auto max-w-md">
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-bold">Schedule</h1>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
              <User className="h-5 w-5" />
            </div>
          </div>

          <div className="mb-4 flex rounded-lg bg-white/20 p-0.5">
            <button
              type="button"
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
              type="button"
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
        <p className="mb-1 text-center text-[11px] text-gray-400">
          Shift times follow Toronto (Eastern Time). Dates use your work-week calendar.
        </p>
        <p className="mb-4 text-center text-xs text-gray-400">
          Last synced {formatInstantInWorkplace(new Date(), "h:mma MMM do")}. Pull to refresh.
        </p>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="rounded-xl bg-gray-100 px-4 py-10 text-center text-sm text-gray-400">
            No shifts for this {viewMode === "day" ? "day" : "week"}. Try the
            <strong className="text-gray-500"> week arrows </strong>
            if your PDF is for a different week.
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([role, roleShifts]) => (
              <section key={role}>
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF5F0]">
                    <span className="text-sm">📋</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#2D3748]">{role}</h3>
                </div>

                <div className="space-y-4">
                  {roleShifts.map((shift) => {
                    const coworkers = coworkersByShiftId[shift.id] ?? [];
                    return (
                      <div key={shift.id} className="space-y-2">
                        {/* Your shift — highlighted (reference UI) */}
                        <div className="rounded-xl border-2 border-amber-200/90 bg-[#FFF8E1] px-3 py-3 shadow-sm">
                          {myDisplayName ? (
                            <div className="mb-2 text-sm font-semibold text-[#3B6FB6]">
                              {myDisplayName}
                            </div>
                          ) : null}
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-medium text-[#2D3748]">
                                {formatShiftStoredDate(shift.date)}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <StationBadge station={shift.station} />
                                {shift.notes ? (
                                  <span className="text-xs text-gray-500">{shift.notes}</span>
                                ) : null}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="text-sm font-semibold text-[#2D3748]">
                                {formatTime12h(shift.start_time)}
                              </span>
                              <span className="mx-1 text-gray-300">—</span>
                              <span className="text-sm font-semibold text-[#2D3748]">
                                {formatTime12h(shift.end_time)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* One block per coworker (not inline comma text) */}
                        {coworkers.length > 0 ? (
                          <div className="space-y-2 pl-0.5">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
                              Coworkers
                            </p>
                            {coworkers.map((c) => {
                              const hasTimes = !!(c.start_time && c.end_time);
                              return (
                                <div
                                  key={c.id}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-[#3B6FB6]">
                                      {c.coworker_name}
                                    </p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <StationBadge station={c.station} />
                                      {c.role ? (
                                        <span className="text-xs text-gray-500">{c.role}</span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    {hasTimes ? (
                                      <>
                                        <span className="text-sm font-semibold text-[#2D3748]">
                                          {formatTime12h(c.start_time!)}
                                        </span>
                                        <span className="mx-1 text-gray-300">—</span>
                                        <span className="text-sm font-semibold text-[#2D3748]">
                                          {formatTime12h(c.end_time!)}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-xs text-gray-400">Time n/a</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
