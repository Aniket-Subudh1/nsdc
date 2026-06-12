import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import {
  GRAM_TARANG_LEARN_MORE_LABEL,
  GRAM_TARANG_WEBSITE_URL,
  LANDING_ABOUT_FEATURES,
  LANDING_ABOUT_TEXT,
  LANDING_PARTNERSHIP_TEXT,
} from "@/constants/landing-content";
import { NSDC_LOGO } from "@/constants/platform-stats";

export function LandingAbout() {
  return (
    <section id="about" className="bg-white px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <h2 className="text-[24px] font-bold text-[#0f2d5c] sm:text-[28px]">About Gram Tarang</h2>
          <p className="mt-4 text-[13px] leading-relaxed text-[#4b6485] sm:text-[14px]">{LANDING_ABOUT_TEXT}</p>

          <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
            {LANDING_ABOUT_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#2563eb]" />
                <span className="text-[12px] font-medium leading-snug text-[#1a2b4c] sm:text-[13px]">{feature}</span>
              </li>
            ))}
          </ul>

          <p className="mt-6 text-[12px] leading-relaxed text-[#4b6485] sm:text-[13px]">
            To learn more about Gram Tarang, visit our official website.
          </p>
          <Link
            href={GRAM_TARANG_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb] transition hover:text-[#1d4ed8]"
          >
            {GRAM_TARANG_LEARN_MORE_LABEL}
            <ArrowRight size={14} />
          </Link>
        </div>

        <div className="flex items-center">
          <div className="w-full rounded-xl border border-[#c7dcf5] bg-[#f0f7ff] px-6 py-8 text-center sm:px-8 sm:py-10">
            <h3 className="text-[16px] font-semibold text-[#0f2d5c] sm:text-[17px]">Our Proud Partnership with</h3>
            <div className="mt-5 flex justify-center">
              <Image
                src={NSDC_LOGO.src}
                alt={NSDC_LOGO.alt}
                width={200}
                height={80}
                className="h-16 object-contain sm:h-20"
                style={{ width: "auto" }}
              />
            </div>
            <p className="mx-auto mt-5 max-w-md text-[12px] leading-relaxed text-[#4b6485] sm:text-[13px]">
              {LANDING_PARTNERSHIP_TEXT}
            </p>
            <Link
              href="https://www.nsdcindia.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center gap-1 text-[13px] font-semibold text-[#2563eb] transition hover:text-[#1d4ed8]"
            >
              Learn More About NSDC
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
