import Login from "@/components/auth/login";
import { AUTH_CONTENT } from "@/constants/auth";
import Image from "next/image";
import { ShieldCheck, Award, CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";

import { getPortalRedirectPath } from "@/lib/auth-redirect";
import { getServerSession } from "@/lib/server/services/session";

const AdminLoginPage = async () => {
  const session = await getServerSession();

  if (session) {
    redirect(getPortalRedirectPath("admin", session.user.roles));
  }

  return (
    <main className="min-h-screen flex overflow-hidden">

      {/* ── Left brand panel ── */}
      <section className="hidden lg:flex relative w-[46%] xl:w-[44%] bg-[#05111f] overflow-hidden shrink-0">

        {/* Very subtle background gradient — no dot-grid */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_100%_10%,rgba(30,64,175,0.18)_0%,transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_40%_at_0%_90%,rgba(15,40,100,0.30)_0%,transparent_70%)]" />

        {/* Single subtle ring on the right */}
        <div className="absolute -right-28 top-[30%] w-[380px] h-[380px] rounded-full border border-white/4" />
        <div className="absolute -right-12 top-[34%] w-[260px] h-[260px] rounded-full border border-white/3" />

        {/* Thin vertical accent line on right edge */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-linear-to-b from-transparent via-[#1e40af]/40 to-transparent" />

        <div className="relative z-10 flex flex-col h-full w-full px-12 xl:px-14 py-12 justify-between">

          {/* Logo — proper white background */}
          <div>
            <div className="inline-flex items-center bg-white rounded-xl px-5 py-3 shadow-sm">
              <Image
                src="/logo.png"
                alt="Gram Tarang Logo"
                height={34}
                width={116}
                className="h-auto w-auto object-contain"
              />
            </div>
          </div>

          {/* Main brand block */}
          <div>

            {/* Official portal label */}
            <div className="flex items-center gap-2 mb-8">
              <div className="w-5 h-px bg-[#2563eb]" />
              <span className="text-[#4b7cc8] text-[10px] font-semibold tracking-[0.32em] uppercase">
                Official Training Portal
              </span>
            </div>

            {/* GRAM TARANG — clean, structured, professional */}
            <div className="mb-5">
              <h1 className="text-white font-bold leading-tight tracking-tight">
                <span className="block text-[46px] xl:text-[52px] leading-[1.05]">Gram Tarang</span>
              </h1>
              {/* Blue accent underline */}
              <div className="mt-3 flex items-center gap-3">
                <div className="h-[2px] w-12 bg-[#2563eb] rounded-full" />
                <div className="h-[2px] w-4 bg-[#2563eb]/30 rounded-full" />
              </div>
              {/* Training Center sub-label */}
              <p className="mt-3 text-[#4b7cc8] text-[13px] font-medium tracking-[0.18em] uppercase">
                Training Center
              </p>
            </div>

            {/* Tagline */}
            <p className="text-[#3d5a80] text-[13px] leading-[1.9] max-w-[290px] mt-7">
              Empowering India through skill development and vocational training — fostering growth and opportunity for all.
            </p>

            {/* Feature list */}
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

            {/* Stats row */}
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

          {/* Bottom bar */}
          <div className="flex items-center justify-between pt-5 border-t border-white/6">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-[#0c1f35] border border-[#1e3a6e] flex items-center justify-center">
                <ShieldCheck size={13} className="text-[#4b7cc8]" />
              </div>
              <span className="text-[#2e4a68] text-[11px] tracking-wide">
                Powered by Skill India
              </span>
            </div>

            <div className="bg-white rounded-xl px-4 py-2.5">
              <Image
                src="/skill.png"
                alt="Skill India"
                width={68}
                height={32}
                className="h-auto w-auto object-contain"
              />
            </div>
          </div>

        </div>
      </section>

      {/* ── Right login panel ── */}
      <section className="flex-1 flex items-center justify-center px-5 sm:px-8 md:px-14 py-10 min-h-screen bg-[#f3f6fc] relative">

        {/* Very subtle background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-[#dbeafe]/40 blur-[140px]" />
          <div className="absolute -bottom-40 -left-40 w-[460px] h-[460px] rounded-full bg-[#c7d7fd]/30 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-[430px]">

          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-white border border-[#e2eaf8] rounded-2xl px-6 py-3 shadow-sm">
              <Image
                src="/logo.png"
                alt="Logo"
                height={34}
                width={105}
                className="object-contain h-auto w-auto"
              />
            </div>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-[0_2px_4px_rgba(0,0,0,0.04),0_16px_48px_rgba(37,99,235,0.09)] border border-[#e8effe] overflow-hidden">
            {/* Thin blue top border */}
            <div className="h-[3px] bg-[#2563eb]" />
            <Login
              heading={AUTH_CONTENT.admin.heading}
              subHeading={AUTH_CONTENT.admin.subHeading}
              submitButtonText={AUTH_CONTENT.admin.SubmitButtonText}
              placeholderMail={AUTH_CONTENT.admin.PlaceholderMail}
              portal={AUTH_CONTENT.admin.portal}
              forgotPasswordUrl={AUTH_CONTENT.admin.ForgotPasswordUrl}
              RedirectUrl={AUTH_CONTENT.admin.RedirectUrl}
              SecondaryButtonText={AUTH_CONTENT.admin.SecondaryButtonText}
            />
          </div>

          {/* Bottom tagline */}
          <div className="flex items-center justify-center gap-2 mt-5">
            <Award size={11} className="text-[#94a3b8]" />
            <p className="text-center text-[10.5px] text-[#94a3b8] tracking-wide">
              NSDC Affiliated · ISO Certified · Skill India Partner
            </p>
          </div>

        </div>
      </section>
    </main>
  );
};

export default AdminLoginPage;
