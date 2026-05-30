import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { queueCandidateSync } from "@/lib/server/services/candidates";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { candidateId } = await context.params;
      return queueCandidateSync(session, candidateId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidate sync queued successfully",
      status: 201,
    },
  );
}