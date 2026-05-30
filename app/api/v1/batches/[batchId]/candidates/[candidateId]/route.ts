import { handleRoute } from "@/lib/server/http";
import { removeCandidateFromBatch } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
    candidateId: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId, candidateId } = await context.params;

      return removeCandidateFromBatch(session, batchId, candidateId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidate removed from batch",
    },
  );
}