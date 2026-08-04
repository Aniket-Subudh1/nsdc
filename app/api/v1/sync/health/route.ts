import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { getSyncHealth } from "@/lib/server/services/sync-health";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      return getSyncHealth(session);
    },
    {
      message: "Sync health",
    },
  );
}
