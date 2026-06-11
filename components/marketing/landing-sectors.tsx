"use client";

import { motion, useAnimationFrame, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

import type { LandingSector } from "@/constants/landing-sectors";
import { LANDING_SECTORS } from "@/constants/landing-sectors";

const MARQUEE_DURATION_MS = 50_000;
const MARQUEE_COPIES = 3;

function SectorCard({ sector }: { sector: LandingSector }) {
  const Icon = sector.icon;

  return (
    <article className="group flex w-[132px] shrink-0 cursor-default flex-col items-center rounded-xl border border-[#e2eaf8] bg-white px-3 py-5 text-center shadow-sm transition-all duration-200 hover:border-[#bfdbfe] hover:shadow-[0_4px_16px_rgba(37,99,235,0.10)] sm:w-[148px]">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-110"
        style={{ backgroundColor: sector.bg }}
      >
        <Icon size={24} stroke={1.6} style={{ color: sector.color }} />
      </div>
      <span className="mt-2.5 text-[10px] font-bold tracking-wide text-[#16a34a]">{sector.number}</span>
      <h3 className="mt-0.5 text-[11px] font-bold leading-tight text-[#0f2d5c] sm:text-[12px]">{sector.name}</h3>
    </article>
  );
}

function SectorMarquee() {
  const prefersReducedMotion = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const segmentWidthRef = useRef(0);
  const pausedRef = useRef(false);
  const x = useMotionValue(0);
  const loop = Array.from({ length: MARQUEE_COPIES }, () => LANDING_SECTORS).flat();

  useEffect(() => {
    if (prefersReducedMotion) return;

    const measure = () => {
      const track = trackRef.current;
      if (!track) return;

      const segmentWidth = track.scrollWidth / MARQUEE_COPIES;
      if (segmentWidth <= 0) return;

      segmentWidthRef.current = segmentWidth;
      x.set(-segmentWidth);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);

    return () => observer.disconnect();
  }, [prefersReducedMotion, x]);

  useAnimationFrame((_, delta) => {
    if (prefersReducedMotion || pausedRef.current) return;

    const segmentWidth = segmentWidthRef.current;
    if (segmentWidth <= 0) return;

    const speed = segmentWidth / MARQUEE_DURATION_MS;
    let next = x.get() + speed * delta;

    // Wrap within one segment — no jump, no blank frame
    while (next >= 0) next -= segmentWidth;
    while (next < -segmentWidth) next += segmentWidth;

    x.set(next);
  });

  const handlePointerEnter = () => {
    pausedRef.current = true;
  };

  const handlePointerLeave = () => {
    pausedRef.current = false;
  };

  if (prefersReducedMotion) {
    return (
      <div className="flex gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 sm:px-6">
        {LANDING_SECTORS.map((sector) => (
          <SectorCard key={sector.number} sector={sector} />
        ))}
      </div>
    );
  }

  return (
    <div
      className="overflow-hidden"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <motion.div
        ref={trackRef}
        style={{ x }}
        className="flex w-max gap-3 py-1 will-change-transform sm:gap-4"
      >
        {loop.map((sector, index) => (
          <SectorCard key={`${sector.number}-${index}`} sector={sector} />
        ))}
      </motion.div>
    </div>
  );
}

export function LandingSectors() {
  return (
    <section id="courses" className="overflow-hidden bg-[#f8fafc] py-14 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#2563eb]/40" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
          <h2 className="text-center text-[22px] font-bold text-[#0f2d5c] sm:text-[26px]">Popular Sectors</h2>
          <span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" />
          <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#2563eb]/40" />
        </div>
      </div>

      <div className="relative mt-10">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-[#f8fafc] to-transparent sm:w-16" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-[#f8fafc] to-transparent sm:w-16" />
        <SectorMarquee />
      </div>
    </section>
  );
}
