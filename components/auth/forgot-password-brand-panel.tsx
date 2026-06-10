import Image from "next/image";
import { ShieldCheck } from "lucide-react";

import { LOGO_ALT, PLATFORM_NAME, POWERED_BY_LABEL } from "@/constants/branding";

type ForgotPasswordBrandPanelProps = {
  description: string;
};

export function ForgotPasswordBrandPanel({ description }: ForgotPasswordBrandPanelProps) {
  return (
    <section className="hidden lg:flex relative w-[25%] xl:w-[25%] bg-white border-r border-[#051f42] overflow-hidden shrink-0">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(37,99,235,0.05)_1px,transparent_1px)] bg-size-[64px_64px]" />
      <div className="absolute top-0 right-0 w-105 h-105 rounded-full bg-[#60a5fa] opacity-20 blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-75 h-75 rounded-full bg-[#3b82f6] opacity-10 blur-[100px]" />
      <div className="absolute -right-20 top-[28%] w-[320px] h-80 rounded-full border border-[#93c5fd]" />
      <div className="absolute -right-15 top-[30%] w-60 h-60 rounded-full border border-[#bfdbfe]" />
      <div className="absolute -left-12.5 bottom-[15%] w-50 h-50 rounded-full border border-[#dbeafe]" />

      <div className="relative z-10 flex items-center flex-col h-full w-full px-10 xl:px-12 py-10 justify-between">
        <div className="flex items-center">
          <div className="px-6 py-3">
            <Image src="/logo.png" alt={LOGO_ALT} height={38} width={120} className="h-auto w-auto object-contain" />
          </div>
        </div>

        <div className="max-w-85">
          <h1 className="text-[#0f172a] text-[30px] xl:text-[34px] font-black leading-[1.15] tracking-tight mb-6">
            {PLATFORM_NAME}
          </h1>
          <p className="text-[#64748b] text-[14px] leading-[1.85] font-normal">{description}</p>
        </div>

        <div className="bg-[#eff6ff] border border-[#dbeafe] -mb-10 rounded-xl px-5 py-2 shadow-sm">
          <Image src="/logo.png" alt={LOGO_ALT} width={80} height={40} className="h-auto w-auto object-contain" />
        </div>

        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full border border-[#bfdbfe] bg-[#eff6ff] flex items-center justify-center">
              <ShieldCheck size={16} className="text-[#2563eb]" />
            </div>
            <span className="text-[#64748b] text-xs tracking-wide">{POWERED_BY_LABEL}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
