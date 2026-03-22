"use client";

import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  grill: "bg-[#D4736C] text-white",
  board: "bg-[#D4998C] text-white",
  cashier: "bg-[#E8C97A] text-white",
  prep: "bg-[#7BAEDB] text-white",
  default: "bg-gray-300 text-gray-700",
};

export function StationBadge({ station }: { station: string | null }) {
  if (!station) return null;

  const key = station.toLowerCase();
  const variant = variants[key] ?? variants.default;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        variant
      )}
    >
      {station}
    </span>
  );
}
