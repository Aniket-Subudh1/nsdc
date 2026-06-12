import Image from "next/image";
import Link from "next/link";
import { ArrowRight, User } from "lucide-react";

import { LandingPartnerLogos } from "@/components/marketing/landing-partner-logos";

export function LandingHero() {
  return (
    <section id="home" className="relative overflow-hidden bg-white">
      {/* Mobile image banner */}
      <div className="relative h-[220px] w-full sm:h-[260px] lg:hidden">
        <Image
          src="/6.jpeg"
          alt="Gram Tarang trained students"
          fill
          priority
          quality={92}
          className="object-cover object-[center_32%]"
          sizes="(max-width: 1023px) 100vw, 0px"
        />
        <div className="absolute inset-y-0 left-0 w-12 bg-linear-to-r from-white to-transparent sm:w-16" />
        <div className="absolute inset-y-0 right-0 w-12 bg-linear-to-l from-white to-transparent sm:w-16" />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-white to-transparent" />
      </div>

      <div className="mx-auto flex max-w-[1400px] flex-col lg:min-h-[clamp(520px,44vw,640px)] lg:flex-row lg:items-stretch">
        {/* Text content */}
        <div className="relative z-10 flex w-full flex-col justify-center px-5 py-8 sm:px-8 sm:py-10 lg:w-[46%] lg:px-10 lg:py-14 xl:px-14">
          <h1 className="text-[38px] font-extrabold leading-[1.04] tracking-tight text-[#0f2d5c] sm:text-[46px] lg:text-[52px]">
            Gram Tarang
          </h1>
          <p className="mt-1.5 text-[15px] font-bold text-[#cd1f0c] sm:text-[16px] lg:text-[17px]">
            Employability Training Services Pvt Ltd.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <span className="inline-block h-[3px] w-10 rounded-full bg-[#16a34a]" />
            <p className="text-[14px] font-semibold text-[#16a34a] sm:text-[15px]">
              Shaping Lives Empowering Communities
            </p>
          </div>

          <h2 className="mt-4 text-[19px] font-bold leading-snug text-[#0f2d5c] sm:text-[21px] lg:text-[23px]">
            Empowering India Through Skill Development
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-[#4b6485] sm:text-[14px]">
            Industry-aligned training, NSDC certifications, placement assistance, and career
            opportunities for youth across India.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link
              href="#courses"
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#2563eb] px-5 py-[10px] text-[13px] font-semibold text-white shadow-[0_6px_18px_rgba(37,99,235,0.28)] transition hover:bg-[#1d4ed8]"
            >
              Explore Courses
              <ArrowRight size={14} />
            </Link>
            <Link
              href="/training-partner/login"
              className="inline-flex items-center gap-1.5 rounded-[6px] bg-[#0f2d5c] px-5 py-[10px] text-[13px] font-semibold text-white transition hover:bg-[#0a2247]"
            >
              <User size={14} />
              Training Center Login
              <ArrowRight size={14} />
            </Link>
          </div>

          <LandingPartnerLogos />
        </div>

        {/* Desktop image panel */}
        <div className="relative hidden lg:block lg:w-[54%]">
          <div className="absolute inset-0">
            <Image
              src="/6.jpeg"
              alt="Gram Tarang trained students"
              fill
              priority
              quality={92}
              className="object-cover object-[center_32%]"
              sizes="(min-width: 1024px) 54vw, 0px"
            />
            <div className="absolute inset-y-0 left-0 w-28 bg-linear-to-r from-white via-white/70 to-transparent xl:w-36" />
            <div className="absolute inset-y-0 right-0 w-20 bg-linear-to-l from-white via-white/70 to-transparent xl:w-28" />
          </div>
        </div>
      </div>

      {/* Wave divider */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20" aria-hidden>
        <svg
          viewBox="0 0 1440 130"
          preserveAspectRatio="none"
          className="block w-full"
          style={{ height: "clamp(70px, 9vw, 115px)", display: "block" }}
        >
          <path
            d="M0,65
               C120,30 280,90 480,55
               C640,28 800,85 1000,50
               C1160,22 1320,68 1440,45
               L1440,130 L0,130 Z"
            fill="#16a34a"
          />
          <path
            d="M0,90
               C140,55 300,110 500,78
               C680,48 860,105 1060,72
               C1220,45 1350,88 1440,68
               L1440,130 L0,130 Z"
            fill="#0f2d5c"
          />
        </svg>
      </div>
    </section>
  );
}
