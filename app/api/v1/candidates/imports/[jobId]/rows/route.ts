import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { listCandidateImportRows } from "@/lib/server/services/candidates";
import { candidateImportRowsQuerySchema } from "@/lib/server/validation";

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
      const url = new URL(request.url);
      const query = candidateImportRowsQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        sectorName: url.searchParams.get("sectorName") ?? undefined,
        courseName: url.searchParams.get("courseName") ?? undefined,
      });

      return listCandidateImportRows(session, jobId, query.page, query.pageSize, query.status, {
        sectorName: query.sectorName,
        courseName: query.courseName,
      });
    },
    {
      message: "Candidate import rows loaded",
    },
  );
}
