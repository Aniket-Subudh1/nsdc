import { cn } from "@/lib/utils";

type PortalPageSkeletonProps = {
  className?: string;
  rows?: number;
  variant?: "dashboard" | "table";
};

function Pulse({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/80", className)} />;
}

export function PortalPageSkeleton({ className, rows = 6, variant = "table" }: PortalPageSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className={cn("flex flex-1 flex-col gap-6 bg-slate-100 px-4 py-4 md:px-8 md:py-8", className)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Pulse className="h-7 w-56" />
            <Pulse className="h-4 w-80" />
          </div>
          <Pulse className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Pulse key={index} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Pulse className="h-64 w-full rounded-2xl" />
          <Pulse className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-1 flex-col gap-4 bg-slate-100 px-4 py-4 md:px-8 md:py-8", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Pulse className="h-7 w-48" />
          <Pulse className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <Pulse className="h-9 w-24" />
          <Pulse className="h-9 w-28" />
        </div>
      </div>
      <Pulse className="h-12 w-full rounded-xl" />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <Pulse className="h-4 w-40" />
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: rows }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 px-4 py-3">
              <Pulse className="h-8 w-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Pulse className="h-3.5 w-1/3" />
                <Pulse className="h-3 w-1/2" />
              </div>
              <Pulse className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
