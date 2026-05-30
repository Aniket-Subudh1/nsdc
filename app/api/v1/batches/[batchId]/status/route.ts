import { handleRoute } from "@/lib/server/http";
import { getBatchStatus } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId } = await context.params;

      return getBatchStatus(session, batchId);
    },
    {
      message: "Batch status loaded",
    },
  );
}