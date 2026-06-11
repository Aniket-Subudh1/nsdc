import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { AuthBrandGallery } from "@/components/branding/auth-brand-gallery";
import { PlatformName } from "@/components/branding/platform-name";
import { PlatformStatsBanner } from "@/components/branding/platform-stats-banner";
import { LOGO_ALT, POWERED_BY_LABEL } from "@/constants/branding";
import { NSDC_LOGO } from "@/constants/platform-stats";

export function HomeLanding() {
  return (
    <main className="relative h-dvh overflow-hidden bg-[#f3f6fc]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 right-0 h-[360px] w-[360px] rounded-full bg-[#dbeafe]/50 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[280px] w-[280px] rounded-full bg-[#c7d7fd]/30 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col px-5 py-4 sm:px-8 lg:px-10">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <div className="rounded-lg border border-[#e2eaf8] bg-white px-4 py-2 shadow-sm">
            <Image src="/logo.png" alt={LOGO_ALT} height={28} width={96} className="h-auto w-auto object-contain" />
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/training-partner/login"
              className="rounded-lg border border-[#bfdbfe] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#1d4ed8] transition hover:bg-[#eff6ff] sm:text-[12px]"
            >
              Training Center
            </Link>
            <Link
              href="/admin/login"
              className="inline-flex items-center gap-1 rounded-lg bg-[#2563eb] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-[#1d4ed8] sm:text-[12px]"
            >
              Admin
              <ArrowRight size={12} />
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-3 lg:flex-row lg:gap-10">
          <div className="min-w-0 flex-1 text-center lg:text-left">
            <h1 className="font-bold tracking-tight text-[#0f2d5c]">
              <PlatformName
                line1ClassName="block text-[26px] leading-[1.08] sm:text-[32px] lg:text-[36px]"
                line2ClassName="mt-1 block text-[22px] leading-[1.1] text-[#2563eb] sm:text-[26px] lg:text-[30px]"
              />
            </h1>

            <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-[#4b6485] sm:text-[14px] lg:mx-0">
              Empowering India through skill development and vocational training.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <Link
                href="/training-partner/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#2563eb] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.18)] transition hover:bg-[#1d4ed8]"
              >
                Sign in as Training Center
                <ArrowRight size={13} />
              </Link>
              <Link
                href="/admin/login"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#bfdbfe] bg-white px-4 py-2 text-[12px] font-semibold text-[#1d4ed8] transition hover:bg-[#eff6ff]"
              >
                Sign in as Admin
              </Link>
            </div>
          </div>

          <div className="flex w-full shrink-0 justify-center lg:max-w-[460px]">
            <AuthBrandGallery />
          </div>
        </div>

        <section className="shrink-0">
          <PlatformStatsBanner compact />
        </section>

        <footer className="flex shrink-0 items-center justify-center gap-3 pt-2">
          <p className="text-[10px] tracking-wide text-[#94a3b8]">{POWERED_BY_LABEL}</p>
          <div className="rounded-lg border border-[#e2eaf8] bg-white px-2.5 py-1">
            <Image
              src={NSDC_LOGO.src}
              alt={NSDC_LOGO.alt}
              width={64}
              height={32}
              className="h-7 w-auto object-contain"
            />
          </div>
        </footer>
      </div>
    </main>
  );
}
