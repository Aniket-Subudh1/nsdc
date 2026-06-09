import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { listCourseImportRows } from "@/lib/server/services/course-import";
import { paginationQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { jobId } = await context.params;
      const url = new URL(request.url);
      const query = paginationQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
      });
      const status = url.searchParams.get("status")?.trim() || undefined;

      return listCourseImportRows(session, jobId, query.page, query.pageSize, status);
    },
    {
      message: "Course import rows loaded",
    },
  );
}
