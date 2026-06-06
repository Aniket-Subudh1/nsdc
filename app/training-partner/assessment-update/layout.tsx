import { SidebarDemo } from "@/components/dashboard/sidebar";
import { TRAINING_PARTNER_SIDEBAR_LINKS } from "@/constants/sidebar";
import { redirect } from "next/navigation";

import {
  assertPortalAccess,
  getDefaultRedirectPath,
  getServerSession,
} from "@/lib/server/services/session";

export default async function TrainingPartnerAssessmentUpdateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/training-partner/login");
  }

  try {
    assertPortalAccess(session.user.roles, "training_partner");
  } catch {
    redirect(getDefaultRedirectPath(session.user.roles));
  }

  return (
    <SidebarDemo links={TRAINING_PARTNER_SIDEBAR_LINKS} userName={session.user.name}>
      {children}
    </SidebarDemo>
  );
}
