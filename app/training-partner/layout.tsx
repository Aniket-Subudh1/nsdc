import { PortalSWRProvider } from "@/lib/client/swr";

export default function TrainingPartnerPortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalSWRProvider>{children}</PortalSWRProvider>;
}
