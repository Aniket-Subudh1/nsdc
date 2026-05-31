import { handleRoute } from "@/lib/server/http";
import { verifySchemeForSidh } from "@/lib/server/services/masters";
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

      return verifySchemeForSidh(session, schemeId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Scheme verified successfully",
    },
  );
}