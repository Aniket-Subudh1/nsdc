import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { deleteCourse, updateCourse } from "@/lib/server/services/masters";
import { updateCourseSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    courseId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateCourseSchema.parse(await request.json());
      const { courseId } = await context.params;

      return updateCourse(session, courseId, {
        ...body,
        approvalDate: body.approvalDate || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Course updated successfully",
    },
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { courseId } = await context.params;

      return deleteCourse(session, courseId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Course deleted successfully",
    },
  );
}