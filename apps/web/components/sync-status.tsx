"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusProps {
  lastSynced: string | null;
  apiUrl: string;
  userId: string;
}

export function SyncStatus({ lastSynced, apiUrl, userId }: SyncStatusProps) {
  const [syncing, setSyncing] = useState(false);

  const triggerSync = async () => {
    setSyncing(true);
    try {
      await fetch(`${apiUrl}/sync/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
    } catch {
      // Handled silently
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="flex items-center justify-between text-xs text-gray-400 px-1">
      <span>
        {lastSynced
          ? `Last synced ${new Date(lastSynced).toLocaleString()}`
          : "Not synced yet"}
      </span>
      <button
        onClick={triggerSync}
        disabled={syncing}
        className="flex items-center gap-1 text-[#3B6FB6] hover:underline disabled:opacity-50"
      >
        <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
        {syncing ? "Syncing..." : "Sync now"}
      </button>
    </div>
  );
}
