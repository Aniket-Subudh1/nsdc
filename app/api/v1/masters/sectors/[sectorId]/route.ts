import { handleRoute } from "@/lib/server/http";
import { deleteSector, updateSector } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";
import { updateSectorSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    sectorId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateSectorSchema.parse(await request.json());
      const { sectorId } = await context.params;

      return updateSector(session, sectorId, {
        ...body,
        description: body.description || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Sector updated successfully",
    },
  );
}

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
