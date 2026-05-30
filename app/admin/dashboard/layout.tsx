import { SidebarDemo } from "@/components/dashboard/sidebar";
import { ADMIN_SIDEBAR_LINKS } from "@/constants/sidebar";
import { redirect } from "next/navigation";

import {
  assertPortalAccess,
  getDefaultRedirectPath,
  getServerSession,
} from "@/lib/server/services/session";

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/admin/login");
  }

  try {
    assertPortalAccess(session.user.roles, "admin");
  } catch {
    redirect(getDefaultRedirectPath(session.user.roles));
  }

  return (
    <SidebarDemo
      links={ADMIN_SIDEBAR_LINKS}
      userName={session.user.name}
    >
      {children}
    </SidebarDemo>
  );
}