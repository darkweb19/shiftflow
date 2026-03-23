import { createServerSupabase } from "@/lib/supabase/server";
import { User } from "lucide-react";
import { ShiftCard } from "@/components/shift-card";
import type { Shift } from "@/lib/types";
import { getWorkplaceWeekRange, getWorkplaceYmd } from "@/lib/workplace-time";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();

  await supabase.auth.getUser();

  const now = new Date();
  const today = getWorkplaceYmd(now);
  const { from: weekStart, to: weekEnd } = getWorkplaceWeekRange(now);

  const { data: todayShifts } = await supabase
    .from("shifts")
    .select("*")
    .eq("date", today)
    .order("start_time");

  // Rest of this calendar week (Mon–Sun) so you still see shifts if “today” is empty
  const { data: weekShiftsRaw } = await supabase
    .from("shifts")
    .select("*")
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .order("date")
    .order("start_time");

  const weekShiftsNotToday = ((weekShiftsRaw as Shift[] | null) ?? []).filter(
    (s) => s.date !== today
  );

  const { data: upcomingShifts } = await supabase
    .from("shifts")
    .select("*")
    .gt("date", weekEnd)
    .order("date")
    .order("start_time")
    .limit(10);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="bg-[#3B6FB6] px-5 pb-5 pt-12 text-white">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
            <User className="h-5 w-5" />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-6 px-5 py-6">
        {/* Today's Events */}
        <section>
          <h2 className="mb-1 text-lg font-semibold text-[#2D3748]">
            Today&apos;s Events
          </h2>
          <div className="mb-3 h-0.5 w-20 rounded bg-[#3B6FB6]" />

          {(todayShifts as Shift[] | null)?.length ? (
            <div className="space-y-3">
              {(todayShifts as Shift[]).map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-gray-100 px-4 py-6 text-center text-sm text-gray-400">
              There are no events on this date
            </div>
          )}
        </section>

        {/* Rest of this week */}
        <section>
          <h2 className="mb-1 text-lg font-semibold text-[#2D3748]">
            Rest of this week
          </h2>
          <div className="mb-3 h-0.5 w-20 rounded bg-[#3B6FB6]" />

          {weekShiftsNotToday.length ? (
            <div className="space-y-3">
              {weekShiftsNotToday.map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-gray-100 px-4 py-6 text-center text-sm text-gray-400">
              No other shifts Mon–Sun. Open <strong>Schedule</strong> and use the
              arrows to jump to the week in your PDF.
            </div>
          )}
        </section>

        {/* After this week */}
        <section>
          <h2 className="mb-1 text-lg font-semibold text-[#2D3748]">
            Later
          </h2>
          <div className="mb-3 h-0.5 w-20 rounded bg-[#3B6FB6]" />

          {(upcomingShifts as Shift[] | null)?.length ? (
            <div className="space-y-3">
              {(upcomingShifts as Shift[]).map((shift) => (
                <ShiftCard key={shift.id} shift={shift} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-gray-100 px-4 py-6 text-center text-sm text-gray-400">
              Nothing scheduled after this week.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
