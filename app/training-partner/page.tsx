import { redirect } from "next/navigation";

import {
  assertPortalAccess,
  getDefaultRedirectPath,
  getServerSession,
} from "@/lib/server/services/session";

export default async function Page() {
  const session = await getServerSession();

  if (!session) {
    redirect("/training-partner/login");
  }

  try {
    assertPortalAccess(session.user.roles, "training_partner");
    redirect("/training-partner/dashboard");
  } catch {
    redirect(getDefaultRedirectPath(session.user.roles));
  }
}