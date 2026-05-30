import { handleRoute } from "@/lib/server/http";
import { processQueuedSyncJobs } from "@/lib/server/services/candidate-sync-worker";
import { requireAuth } from "@/lib/server/services/session";
import { processSyncJobsSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = processSyncJobsSchema.parse(await request.json().catch(() => ({})));

      return processQueuedSyncJobs(session, {
        limit: body.limit,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Sync jobs processed",
    },
  );
}