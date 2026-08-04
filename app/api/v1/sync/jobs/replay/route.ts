import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { replayDeadLetterSyncJobs } from "@/lib/server/services/sync-health";
import { replaySyncJobsSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = replaySyncJobsSchema.parse(await request.json().catch(() => ({})));

      return replayDeadLetterSyncJobs(session, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Dead-letter sync jobs replayed",
    },
  );
}
