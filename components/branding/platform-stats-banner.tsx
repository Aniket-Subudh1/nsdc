import { BookOpen, Building2, Layers, Map, Target, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PLATFORM_STATS } from "@/constants/platform-stats";
import { cn } from "@/lib/utils";

const STAT_ICONS: LucideIcon[] = [Users, Building2, Layers, BookOpen, Map, Target];

type PlatformStatsBannerProps = {
  className?: string;
  compact?: boolean;
};

export function PlatformStatsBanner({ className, compact = false }: PlatformStatsBannerProps) {
  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-2 rounded-xl border border-[#dbeafe] bg-white shadow-sm sm:grid-cols-6 sm:gap-0 sm:divide-x sm:divide-[#e2e8f0]",
        compact ? "px-2 py-2.5 sm:px-0 sm:py-3" : "px-4 py-5 sm:px-0 sm:py-6",
        className,
      )}
    >
      {PLATFORM_STATS.map((stat, index) => {
        const Icon = STAT_ICONS[index] ?? Users;

        return (
          <div
            key={stat.label}
            className="flex flex-col items-center px-1 text-center sm:px-2"
          >
            <Icon
              className={cn("text-[#1d4ed8]", compact ? "mb-1 h-3.5 w-3.5" : "mb-2 h-5 w-5")}
              strokeWidth={1.75}
            />
            <p
              className={cn(
                "font-bold leading-none tracking-tight text-[#0f2d5c]",
                compact ? "text-[13px] sm:text-[14px]" : "text-[18px] sm:text-[20px]",
              )}
            >
              {stat.value}
            </p>
            <p
              className={cn(
                "font-medium leading-tight text-[#3b5f8c]",
                compact ? "mt-0.5 text-[8px] sm:text-[9px]" : "mt-2 text-[11px] sm:text-[12px]",
              )}
            >
              {stat.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
