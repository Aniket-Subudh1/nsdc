import Image from "next/image";
import { CheckCircle2, ShieldCheck } from "lucide-react";

import { LOGO_ALT, PLATFORM_NAME, POWERED_BY_LABEL } from "@/constants/branding";

export function LoginBrandPanel() {
  return (
    <section className="hidden lg:flex relative w-[46%] xl:w-[44%] bg-[#05111f] overflow-hidden shrink-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_10%,rgba(30,64,175,0.18)_0%,transparent_70%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_0%_90%,rgba(15,40,100,0.30)_0%,transparent_70%)]" />
      <div className="absolute -right-28 top-[30%] w-[380px] h-[380px] rounded-full border border-white/4" />
      <div className="absolute -right-12 top-[34%] w-[260px] h-[260px] rounded-full border border-white/3" />
      <div className="absolute right-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-[#1e40af]/40 to-transparent" />

      <div className="relative z-10 flex flex-col h-full w-full px-12 xl:px-14 py-12 justify-between">
        <div>
          <div className="inline-flex items-center bg-white rounded-xl px-5 py-3 shadow-sm">
            <Image
              src="/logo.png"
              alt={LOGO_ALT}
              height={34}
              width={116}
              className="h-auto w-auto object-contain"
            />
          </div>
        </div>

        <div>
          <div className="mb-5">
            <h1 className="text-white font-bold leading-tight tracking-tight">
              <span className="block text-[34px] xl:text-[40px] leading-[1.1]">{PLATFORM_NAME}</span>
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <div className="h-[2px] w-12 bg-[#2563eb] rounded-full" />
              <div className="h-[2px] w-4 bg-[#2563eb]/30 rounded-full" />
            </div>
          </div>

          <p className="text-[#3d5a80] text-[13px] leading-[1.9] max-w-[290px] mt-7">
            Empowering India through skill development and vocational training — fostering growth and opportunity for all.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              "NSDC affiliated skill development programs",
              "Government-recognized certifications",
              "Industry-aligned vocational courses",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 size={14} className="text-[#2563eb] mt-0.5 shrink-0" />
                <span className="text-[#3d5a80] text-[12.5px] leading-snug">{item}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-8 mt-9 pt-7 border-t border-white/5">
            <div>
              <p className="text-white text-[18px] font-bold leading-none tracking-tight">50,000+</p>
              <p className="text-[#3d5a80] text-[10px] tracking-widest mt-1.5 uppercase font-medium">Trainees</p>
            </div>
            <div className="w-px h-8 bg-white/6" />
            <div>
              <p className="text-white text-[18px] font-bold leading-none tracking-tight">200+</p>
              <p className="text-[#3d5a80] text-[10px] tracking-widest mt-1.5 uppercase font-medium">Centers</p>
            </div>
            <div className="w-px h-8 bg-white/6" />
            <div>
              <p className="text-white text-[18px] font-bold leading-none tracking-tight">30+</p>
              <p className="text-[#3d5a80] text-[10px] tracking-widest mt-1.5 uppercase font-medium">Courses</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-5 border-t border-white/6">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#0c1f35] border border-[#1e3a6e] flex items-center justify-center">
              <ShieldCheck size={13} className="text-[#4b7cc8]" />
            </div>
            <span className="text-[#2e4a68] text-[11px] tracking-wide">{POWERED_BY_LABEL}</span>
          </div>

          <div className="bg-white rounded-xl px-4 py-2.5">
            <Image
              src="/logo.png"
              alt={LOGO_ALT}
              width={68}
              height={32}
              className="h-auto w-auto object-contain"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
