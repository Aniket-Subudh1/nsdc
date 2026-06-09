import { handleRoute } from "@/lib/server/http";
import { getBatchEnrollmentJob } from "@/lib/server/services/batch-enrollment-jobs";
import { requireAuth } from "@/lib/server/services/session";

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

      return getBatchEnrollmentJob(session, batchId, jobId);
    },
    {
      message: "Batch enrollment job loaded",
    },
  );
}
