import Image from "next/image";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { AuthBrandGallery } from "@/components/branding/auth-brand-gallery";
import { PlatformName } from "@/components/branding/platform-name";
import { LOGO_ALT, POWERED_BY_LABEL } from "@/constants/branding";
import { NSDC_LOGO, PLATFORM_STATS } from "@/constants/platform-stats";

const HIGHLIGHTS = [
  "NSDC affiliated programs",
  "Government-recognized certifications",
  "Industry-aligned courses",
] as const;

export function LoginBrandPanel() {
  return (
    <section className="relative hidden h-screen w-[42%] shrink-0 overflow-hidden bg-[#05111f] lg:flex xl:w-[40%]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_10%,rgba(30,64,175,0.18)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_0%_90%,rgba(15,40,100,0.30)_0%,transparent_70%)]" />
      <div className="absolute -right-28 top-[30%] h-[320px] w-[320px] rounded-full border border-white/4" />
      <div className="absolute right-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-[#1e40af]/40 to-transparent" />

      <div className="relative z-10 flex h-full min-h-0 w-full flex-col justify-between px-10 py-8 xl:px-12">
        <div className="inline-flex w-fit items-center rounded-lg bg-white px-4 py-2 shadow-sm">
          <Image
            src="/logo.png"
            alt={LOGO_ALT}
            height={28}
            width={96}
            className="object-contain"
            style={{ width: "auto", height: "auto" }}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center py-4">
          <h1 className="font-bold leading-tight tracking-tight text-white">
            <PlatformName
              line1ClassName="block text-[28px] leading-[1.1] xl:text-[32px]"
              line2ClassName="mt-1 block text-[22px] leading-[1.1] xl:text-[26px]"
            />
          </h1>

          <div className="mt-2.5 flex items-center gap-2.5">
            <div className="h-[2px] w-10 rounded-full bg-[#2563eb]" />
            <div className="h-[2px] w-3 rounded-full bg-[#2563eb]/30" />
          </div>

          <p className="mt-4 max-w-[300px] text-[13px] font-medium leading-relaxed text-[#cbd5e1] xl:text-[14px]">
            Empowering India through skill development and vocational training.
          </p>

          <ul className="mt-4 space-y-2.5">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-[#60a5fa]" />
                <span className="text-[12px] font-medium leading-snug text-[#e2e8f0] xl:text-[13px]">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 w-full">
            <AuthBrandGallery variant="dark" />
          </div>

          <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-4 border-t border-white/15 pt-5">
            {PLATFORM_STATS.map((stat) => (
              <div key={stat.label}>
                <p className="text-[15px] font-bold leading-none tracking-tight text-white xl:text-[16px]">
                  {stat.value}
                </p>
                <p className="mt-1.5 text-[9px] font-semibold uppercase leading-tight tracking-wide text-[#94a3b8] xl:text-[10px]">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-white/15 pt-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[#3b82f6]/40 bg-[#0f2744]">
              <ShieldCheck size={13} className="text-[#60a5fa]" />
            </div>
            <span className="text-[11px] font-medium tracking-wide text-[#cbd5e1] xl:text-[12px]">{POWERED_BY_LABEL}</span>
          </div>

          <div className="rounded-lg bg-white px-3 py-1.5">
            <Image
              src={NSDC_LOGO.src}
              alt={NSDC_LOGO.alt}
              width={72}
              height={36}
              className="h-8 object-contain"
              style={{ width: "auto" }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
