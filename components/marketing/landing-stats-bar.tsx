import Image from "next/image";
import { BookOpen, Building2, Target, Users } from "lucide-react";

import { LANDING_STATS } from "@/constants/landing-content";

const ICON_CLASS = "h-8 w-8 shrink-0 text-[#0f2d5c] sm:h-9 sm:w-9";

function StatIcon({ index }: { index: number }) {
  switch (index) {
    case 0:
      return <Users className={ICON_CLASS} strokeWidth={1.75} />;
    case 1:
      return <Building2 className={ICON_CLASS} strokeWidth={1.75} />;
    case 2:
      return <BookOpen className={ICON_CLASS} strokeWidth={1.75} />;
    case 3:
      return (
        <Image
          src="/india.svg"
          alt=""
          width={36}
          height={36}
          aria-hidden
          className={ICON_CLASS}
        />
      );
    case 4:
      return <Target className={ICON_CLASS} strokeWidth={1.75} />;
    default:
      return <Users className={ICON_CLASS} strokeWidth={1.75} />;
  }
}

export function LandingStatsBar() {
  return (
    <section className="relative z-30 -mt-10 px-4 pb-2 sm:-mt-12 sm:px-6 lg:-mt-14 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="overflow-hidden rounded-2xl border border-[#e8eef6] bg-white shadow-[0_10px_40px_rgba(15,45,92,0.10)]">
          <div className="flex flex-col divide-y divide-[#e2e8f0] sm:flex-row sm:divide-x sm:divide-y-0">
            {LANDING_STATS.map((stat, index) => (
              <div
                key={stat.label}
                className="flex flex-1 items-center gap-3 px-5 py-5 sm:gap-3.5 sm:px-6 sm:py-6 lg:px-7"
              >
                <StatIcon index={index} />
                <div className="min-w-0">
                  <p className="text-[20px] font-bold leading-none tracking-tight text-[#0f2d5c] sm:text-[22px] lg:text-[24px]">
                    {stat.value}
                  </p>
                  <p className="mt-1.5 text-[11px] font-normal leading-tight text-[#334155] sm:text-[12px]">
                    {stat.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
