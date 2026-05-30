import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createSector, listSectors } from "@/lib/server/services/masters";
import { createSectorSchema, sectorListQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = sectorListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      });

      return listSectors(session, query);
    },
    {
      message: "Sectors loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createSectorSchema.parse(await request.json());

      return createSector(session, {
        ...body,
        description: body.description || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Sector created successfully",
      status: 201,
    },
  );
}