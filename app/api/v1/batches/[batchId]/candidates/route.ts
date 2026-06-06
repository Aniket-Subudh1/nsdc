import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { addCandidatesToBatch, removeAllCandidatesFromBatch } from "@/lib/server/services/batches";
import { addCandidatesToBatchSchema } from "@/lib/server/validation";

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
      const body = addCandidatesToBatchSchema.parse(await request.json());
      const { batchId } = await context.params;

      return addCandidatesToBatch(session, batchId, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidates added to batch",
    },
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId } = await context.params;

      return removeAllCandidatesFromBatch(session, batchId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Removable learners deleted from batch",
    },
  );
}