import { handleRoute } from "@/lib/server/http";
import { listBatchEnrollmentRows } from "@/lib/server/services/batch-enrollment-jobs";
import { requireAuth } from "@/lib/server/services/session";
import { paginationQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
    jobId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId, jobId } = await context.params;
      const url = new URL(request.url);
      const query = paginationQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
      });
      const status = url.searchParams.get("status") ?? undefined;

      return listBatchEnrollmentRows(session, batchId, jobId, query.page, query.pageSize, status ?? undefined);
    },
    {
      message: "Batch enrollment rows loaded",
    },
  );
}
