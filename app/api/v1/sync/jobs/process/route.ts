import { getEnv } from "@/lib/server/env";
import { handleRoute } from "@/lib/server/http";
import { getSidhRuntime } from "@/lib/server/queue/sidh-runtime";
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
      const env = getEnv();
      const runtime = getSidhRuntime();

      return processQueuedSyncJobs(
        session,
        {
          limit: body.limit,
          requestId: request.headers.get("x-request-id") ?? undefined,
        },
        {
          circuitBreaker: runtime.circuitBreaker,
          concurrency: env.SIDH_PUSH_CONCURRENCY,
          connector: runtime.connector,
          rateLimiter: runtime.rateLimiter,
        },
      );
    },
    {
      message: "Sync jobs processed",
    },
  );
}