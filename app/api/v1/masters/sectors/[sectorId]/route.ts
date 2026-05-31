import { handleRoute } from "@/lib/server/http";
import { deleteSector } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sectorId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { sectorId } = await context.params;

      return deleteSector(session, sectorId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Sector deleted successfully",
    },
  );
}