import { redirect } from "next/navigation";

import {
  assertPortalAccess,
  getDefaultRedirectPath,
  getServerSession,
} from "@/lib/server/services/session";

export default async function Page() {
  const session = await getServerSession();

  if (!session) {
    redirect("/admin/login");
  }

  try {
    assertPortalAccess(session.user.roles, "admin");
    redirect("/admin/dashboard");
  } catch {
    redirect(getDefaultRedirectPath(session.user.roles));
  }
}