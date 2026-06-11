import { LandingAbout } from "@/components/marketing/landing-about";
import { LandingHero } from "@/components/marketing/landing-hero";
import { LandingNavbar } from "@/components/marketing/landing-navbar";
import { LandingSectors } from "@/components/marketing/landing-sectors";
import { LandingStatsBar } from "@/components/marketing/landing-stats-bar";

export function HomeLanding() {
  return (
    <div className="scroll-smooth bg-white">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingStatsBar />
        <LandingAbout />
        <LandingSectors />
      </main>
    </div>
  );
}
