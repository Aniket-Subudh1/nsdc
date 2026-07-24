import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { commitCandidateImportJob } from "@/lib/server/services/candidates";
import { commitCandidateImportSchema } from "@/lib/server/validation";

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
      const body = commitCandidateImportSchema.parse(await request.json().catch(() => ({})));

      return commitCandidateImportJob(session, jobId, request.headers.get("x-request-id") ?? undefined, {
        sectorName: body.sectorName,
        courseName: body.courseName,
      });
    },
    {
      message: "Candidate import committed successfully",
    },
  );
}
