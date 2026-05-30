import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { listSyncJobs } from "@/lib/server/services/candidates";
import { syncJobsQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = syncJobsQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        entityType: url.searchParams.get("entityType") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      });

      return listSyncJobs(session, query);
    },
    {
      message: "Sync jobs loaded",
    },
  );
}