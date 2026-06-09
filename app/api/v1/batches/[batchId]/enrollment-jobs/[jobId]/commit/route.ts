import { handleRoute } from "@/lib/server/http";
import { commitBatchEnrollmentJob } from "@/lib/server/services/batch-enrollment-jobs";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
    jobId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId, jobId } = await context.params;

      return commitBatchEnrollmentJob(session, batchId, jobId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Batch enrollment committed successfully",
    },
  );
}
