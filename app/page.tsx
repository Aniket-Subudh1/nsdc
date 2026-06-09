import { redirect } from "next/navigation";

import { getDefaultRedirectPath, getServerSession } from "@/lib/server/services/session";

export default async function HomePage() {
  const session = await getServerSession();

  if (session) {
    redirect(getDefaultRedirectPath(session.user.roles));
  }

  redirect("/admin/login");
}
