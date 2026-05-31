import { handleRoute } from "@/lib/server/http";
import { syncSchemeToSidh } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schemeId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { schemeId } = await context.params;

      return syncSchemeToSidh(session, schemeId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Scheme marked ready for SIDH sync",
    },
  );
}