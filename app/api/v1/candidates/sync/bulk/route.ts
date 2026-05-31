import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { queueCandidateSyncBulk } from "@/lib/server/services/candidates";
import { bulkQueueCandidateSyncSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = bulkQueueCandidateSyncSchema.parse(await request.json());

      return queueCandidateSyncBulk(session, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Candidates queued for Skill India delivery",
      status: 201,
    },
  );
}