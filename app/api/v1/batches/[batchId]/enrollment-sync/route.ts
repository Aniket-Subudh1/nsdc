import { handleRoute } from "@/lib/server/http";
import { queueEnrollmentSync } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";
import { enrollmentSyncRequestSchema } from "@/lib/server/validation";

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
      const body = enrollmentSyncRequestSchema.parse(await request.json().catch(() => ({})));
      const { batchId } = await context.params;
      const immediate = new URL(request.url).searchParams.get("immediate") === "true";

      return queueEnrollmentSync(session, batchId, body, request.headers.get("x-request-id") ?? undefined, { immediate });
    },
    {
      message: "Enrollment sync queued",
    },
  );
}