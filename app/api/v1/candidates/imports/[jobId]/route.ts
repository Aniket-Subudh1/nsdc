import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { getCandidateImportJob } from "@/lib/server/services/candidates";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { jobId } = await context.params;
      return getCandidateImportJob(session, jobId);
    },
    {
      message: "Candidate import job loaded",
    },
  );
}