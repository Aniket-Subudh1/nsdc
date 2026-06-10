import ForgotPasswordForm from "@/components/auth/forgot-password";
import { ForgotPasswordBrandPanel } from "@/components/auth/forgot-password-brand-panel";
import { AUTH_CONTENT } from "@/constants/auth";
import Image from "next/image";
import { redirect } from "next/navigation";

import {
  assertPortalAccess,
  getDefaultRedirectPath,
  getServerSession,
} from "@/lib/server/services/session";

const TrainingPartnerForgotPasswordPage = async () => {
  const session = await getServerSession();

  if (session) {
    try {
      assertPortalAccess(session.user.roles, "training_partner");
      redirect("/training-partner/dashboard");
    } catch {
      redirect(getDefaultRedirectPath(session.user.roles));
    }
  }

  return (
    <main className="min-h-screen flex bg-[#f8fbff] overflow-hidden">
      <ForgotPasswordBrandPanel description="Reset your training partner access securely with an OTP sent to your registered email." />

      <section className="flex-1 flex items-center justify-center px-5 sm:px-8 md:px-12 py-10 min-h-screen relative">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-25 -right-25 w-75 h-75 rounded-full bg-[#dbeafe] blur-[100px] opacity-50" />
          <div className="absolute -bottom-30 -left-30 w-65 h-65 rounded-full bg-[#bfdbfe] blur-[100px] opacity-40" />
        </div>

        <div className="relative z-10 w-full max-w-110">
          <div className="lg:hidden flex justify-center mb-8">
            <div className="bg-[#eff6ff] border border-[#dbeafe] rounded-2xl px-6 py-3 shadow-sm">
              <Image src="/logo.png" alt="Logo" height={36} width={110} className="object-contain h-auto w-auto" />
            </div>
          </div>

          <ForgotPasswordForm
            heading="Forgot your training partner password?"
            subHeading="Enter your registered training partner email to receive a 6 digit OTP and reset your password."
            placeholderMail={AUTH_CONTENT.trainingPartner.PlaceholderMail}
            portal={AUTH_CONTENT.trainingPartner.portal}
            loginUrl="/training-partner/login"
            redirectUrl={AUTH_CONTENT.trainingPartner.RedirectUrl}
            secondaryButtonText={AUTH_CONTENT.trainingPartner.SecondaryButtonText}
          />
        </div>
      </section>
    </main>
  );
};

export default TrainingPartnerForgotPasswordPage;
