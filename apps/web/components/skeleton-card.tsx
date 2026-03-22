import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCard() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-white px-4 py-4">
      <div className="min-w-[60px] flex flex-col items-center gap-1">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-3 w-10" />
      </div>
      <div className="h-10 w-px bg-gray-100" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}
