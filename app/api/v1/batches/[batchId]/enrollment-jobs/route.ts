import { handleRoute } from "@/lib/server/http";
import { createBatchEnrollmentJob } from "@/lib/server/services/batch-enrollment-jobs";
import { requireAuth } from "@/lib/server/services/session";
import { createBatchEnrollmentJobSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createBatchEnrollmentJobSchema.parse(await request.json());
      const { batchId } = await context.params;

      return createBatchEnrollmentJob(session, batchId, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Batch enrollment staged successfully",
      status: 201,
    },
  );
}
