import { handleRoute } from "@/lib/server/http";
import { linkBatchToSidh } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";
import { linkBatchToSidhSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = linkBatchToSidhSchema.parse(await request.json());
      const { batchId } = await context.params;

      return linkBatchToSidh(session, batchId, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Batch linked to existing SIDH batch",
    },
  );
}
