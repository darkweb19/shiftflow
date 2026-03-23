"use client";

import { cn } from "@/lib/utils";

const variants: Record<string, string> = {
  grill: "bg-[#D4736C] text-white",
  g: "bg-[#D4736C] text-white",
  board: "bg-[#D4998C] text-white",
  b: "bg-[#D4998C] text-white",
  cashier: "bg-[#E8C97A] text-white",
  $: "bg-[#E8C97A] text-white",
  prep: "bg-[#7BAEDB] text-white",
  p: "bg-[#7BAEDB] text-white",
  tortilla: "bg-[#C4A574] text-white",
  t: "bg-[#C4A574] text-white",
  salsa: "bg-[#9B8AA6] text-white",
  s: "bg-[#9B8AA6] text-white",
  default: "bg-gray-300 text-gray-700",
};

/** Map single-letter PDF codes to a readable label (Chipotle-style). */
export function friendlyStationName(station: string | null): string | null {
  if (!station) return null;
  const raw = station.trim();
  const lower = raw.toLowerCase();
  const codes: Record<string, string> = {
    t: "Tortilla",
    s: "Salsa",
    p: "Prep",
    g: "Grill",
    b: "Board",
    $: "Cashier",
  };
  if (raw.length <= 2 && codes[lower]) return codes[lower];
  return raw;
}

export function StationBadge({
  station,
  label,
}: {
  station: string | null;
  /** Override visible text (e.g. expanded from "T" → "Tortilla") */
  label?: string | null;
}) {
  if (!station) return null;

  const key = station.toLowerCase();
  const variant = variants[key] ?? variants.default;
  const text = (label ?? friendlyStationName(station) ?? station).toUpperCase();

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
        variant
      )}
    >
      {text}
    </span>
  );
}
