import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { getCourseImportJob } from "@/lib/server/services/course-import";

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
      return getCourseImportJob(session, jobId);
    },
    {
      message: "Course import job loaded",
    },
  );
}
