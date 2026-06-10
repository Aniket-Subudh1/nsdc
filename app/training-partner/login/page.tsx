import Login from "@/components/auth/login";
import { LoginBrandPanel } from "@/components/auth/login-brand-panel";
import { AUTH_CONTENT } from "@/constants/auth";
import { POWERED_BY_LABEL } from "@/constants/branding";
import Image from "next/image";
import { Award } from "lucide-react";
import { redirect } from "next/navigation";

import { getPortalRedirectPath } from "@/lib/auth-redirect";
import { getServerSession } from "@/lib/server/services/session";

const TrainingPartnerLoginPage = async () => {
  const session = await getServerSession();

  if (session) {
    redirect(getPortalRedirectPath("training_partner", session.user.roles));
  }

  return (
    <main className="min-h-screen flex overflow-hidden">
      <LoginBrandPanel />

      <section className="flex-1 flex items-center justify-center px-5 sm:px-8 md:px-14 py-10 min-h-screen bg-[#f3f6fc] relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[560px] h-[560px] rounded-full bg-[#dbeafe]/40 blur-[140px]" />
          <div className="absolute -bottom-40 -left-40 w-[460px] h-[460px] rounded-full bg-[#c7d7fd]/30 blur-[120px]" />
        </div>

        <div className="relative z-10 w-full max-w-[430px]">
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

          <div className="bg-white rounded-2xl shadow-[0_2px_4px_rgba(0,0,0,0.04),0_16px_48px_rgba(37,99,235,0.09)] border border-[#e8effe] overflow-hidden">
            <div className="h-[3px] bg-[#2563eb]" />
            <Login
              heading={AUTH_CONTENT.trainingPartner.heading}
              subHeading={AUTH_CONTENT.trainingPartner.subHeading}
              submitButtonText={AUTH_CONTENT.trainingPartner.SubmitButtonText}
              placeholderMail={AUTH_CONTENT.trainingPartner.PlaceholderMail}
              portal={AUTH_CONTENT.trainingPartner.portal}
              forgotPasswordUrl={AUTH_CONTENT.trainingPartner.ForgotPasswordUrl}
              RedirectUrl={AUTH_CONTENT.trainingPartner.RedirectUrl}
              SecondaryButtonText={AUTH_CONTENT.trainingPartner.SecondaryButtonText}
            />
          </div>

          <div className="flex items-center justify-center gap-2 mt-5">
            <Award size={11} className="text-[#94a3b8]" />
            <p className="text-center text-[10.5px] text-[#94a3b8] tracking-wide">{POWERED_BY_LABEL}</p>
          </div>
        </div>
      </section>
    </main>
  );
};

export default TrainingPartnerLoginPage;
