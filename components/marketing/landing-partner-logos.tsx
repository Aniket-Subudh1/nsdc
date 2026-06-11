import Image from "next/image";

import { NSDC_LOGO, SKILL_INDIA_LOGO } from "@/constants/platform-stats";

export function LandingPartnerLogos() {
  return (
    <div className="mt-8 flex items-center  gap-5">
      <Image
        src={NSDC_LOGO.src}
        alt={NSDC_LOGO.alt}
        width={600}
        height={600}
        className="h-14 w-auto object-contain sm:h-16"
      />
      <div className="h-12 w-px shrink-0 bg-[#b0b8c4] sm:h-14" aria-hidden />
      <Image
        src={SKILL_INDIA_LOGO.src}
        alt={SKILL_INDIA_LOGO.alt}
        width={400}
        height={330}
        className="h-14 w-auto object-contain sm:h-16"
      />
    </div>
  );
}
