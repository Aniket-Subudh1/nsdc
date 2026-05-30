import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { listCourseVersions } from "@/lib/server/services/masters";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    courseId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { courseId } = await context.params;
      return listCourseVersions(session, courseId);
    },
    {
      message: "Course versions loaded",
    },
  );
}