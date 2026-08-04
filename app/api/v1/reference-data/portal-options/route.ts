import { handleRoute } from "@/lib/server/http";
import { getPortalOptions } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      return getPortalOptions(session);
    },
    {
      message: "Portal options loaded",
    },
  );
}
