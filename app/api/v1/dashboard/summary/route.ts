import { handleRoute } from "@/lib/server/http";
import { getDashboardSummary } from "@/lib/server/services/dashboard";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      return getDashboardSummary(session);
    },
    {
      message: "Dashboard summary loaded",
    },
  );
}
