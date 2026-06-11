"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, User, X } from "lucide-react";
import { useState } from "react";

import { LOGO_ALT } from "@/constants/branding";
import { LANDING_NAV_LINKS } from "@/constants/landing-content";
import { cn } from "@/lib/utils";

export function LandingNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-[#e8eef6] bg-white shadow-[0_1px_8px_rgba(15,45,92,0.06)]">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0">
          <Image
            src="/logo.png"
            alt={LOGO_ALT}
            width={240}
            height={140}
            className="h-15 w-auto object-contain sm:h-15"
            priority
          />
         
        </Link>

        <nav className="hidden items-center gap-0.5 xl:flex">
          {LANDING_NAV_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={cn(
                "relative px-2.5 py-2 text-[12px] font-medium text-[#1a2b4c] transition hover:text-[#2563eb]",
                "active" in link && link.active && "text-[#2563eb] after:absolute after:bottom-0 after:left-2.5 after:right-2.5 after:h-[2px] after:rounded-full after:bg-[#2563eb]",
              )}
            >
              <span className="inline-flex items-center gap-0.5">
                {link.label}
                {"hasDropdown" in link && link.hasDropdown ? <ChevronDown size={12} className="opacity-70" /> : null}
              </span>
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/training-partner/login"
            className="hidden items-center gap-1.5 rounded-md bg-[#2563eb] px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-[#1d4ed8] sm:inline-flex"
          >
            <User size={14} />
            Login
          </Link>

          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className="inline-flex items-center justify-center rounded-md border border-[#dbeafe] p-2 text-[#1a2b4c] xl:hidden"
            onClick={() => setMobileOpen((open) => !open)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {mobileOpen ? (
        <nav className="border-t border-[#e8eef6] bg-white px-4 py-3 xl:hidden">
          <div className="flex flex-col gap-1">
            {LANDING_NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-md px-3 py-2 text-[13px] font-medium text-[#1a2b4c] hover:bg-[#f0f7ff] hover:text-[#2563eb]"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/training-partner/login"
              className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-md bg-[#2563eb] px-4 py-2.5 text-[13px] font-semibold text-white"
              onClick={() => setMobileOpen(false)}
            >
              <User size={14} />
              Login
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
