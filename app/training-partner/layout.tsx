import { SidebarDemo } from "@/components/dashboard/sidebar";

import { TRAINING_PARTNER_SIDEBAR_LINKS } from "@/constants/sidebar";

export default function TrainingPartnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarDemo
      links={TRAINING_PARTNER_SIDEBAR_LINKS}
    >
      {children}
    </SidebarDemo>
  );
}