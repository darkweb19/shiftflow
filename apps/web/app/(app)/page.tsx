import { createServerSupabase } from "@/lib/supabase/server";
import { format } from "date-fns";
import { User } from "lucide-react";
import { ShiftCard } from "@/components/shift-card";
import type { Shift } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createServerSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const today = format(new Date(), "yyyy-MM-dd");

  const { data: todayShifts } = await supabase
    .from("shifts")
    .select("*")
    .eq("date", today)
    .order("start_time");

  const { data: upcomingShifts } = await supabase
    .from("shifts")
    .select("*")
    .gt("date", today)
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

        {/* Upcoming Shifts */}
        <section>
          <h2 className="mb-1 text-lg font-semibold text-[#2D3748]">
            Your Upcoming Shifts
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
              No upcoming shifts found. Connect Gmail to sync your schedule.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
