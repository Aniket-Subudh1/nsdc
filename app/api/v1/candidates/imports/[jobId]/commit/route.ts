import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { commitCandidateImportJob } from "@/lib/server/services/candidates";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { jobId } = await context.params;
      return commitCandidateImportJob(session, jobId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidate import committed successfully",
    },
  );
}