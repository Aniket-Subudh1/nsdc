import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createBatch, listBatches } from "@/lib/server/services/batches";
import { batchListQuerySchema, createBatchSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = batchListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        courseId: url.searchParams.get("courseId") ?? undefined,
        schemeId: url.searchParams.get("schemeId") ?? undefined,
        centerId: url.searchParams.get("centerId") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        syncStatus: url.searchParams.get("syncStatus") ?? undefined,
        syncEnabled: url.searchParams.get("syncEnabled") ?? undefined,
      });

      return listBatches(session, query);
    },
    {
      message: "Batches loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createBatchSchema.parse(await request.json());

      return createBatch(session, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Batch created successfully",
      status: 201,
    },
  );
}