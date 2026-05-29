import { SidebarDemo } from "@/components/dashboard/sidebar";

import { ADMIN_SIDEBAR_LINKS } from "@/constants/sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarDemo
      links={ADMIN_SIDEBAR_LINKS}
    >
      {children}
    </SidebarDemo>
  );
}