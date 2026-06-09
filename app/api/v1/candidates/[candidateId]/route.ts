import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { deleteCandidate, getCandidate, updateCandidate } from "@/lib/server/services/candidates";
import { updateCandidateSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    candidateId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { candidateId } = await context.params;
      return getCandidate(session, candidateId);
    },
    {
      message: "Candidate loaded",
    },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateCandidateSchema.parse(await request.json());
      const { candidateId } = await context.params;

      return updateCandidate(session, candidateId, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidate updated successfully",
    },
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { candidateId } = await context.params;

      return deleteCandidate(session, candidateId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidate deleted successfully",
    },
  );
}