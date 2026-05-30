import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createCourse, listCourses } from "@/lib/server/services/masters";
import { courseListQuerySchema, createCourseSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = courseListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        sectorId: url.searchParams.get("sectorId") ?? undefined,
        programId: url.searchParams.get("programId") ?? undefined,
        approvalStatus: url.searchParams.get("approvalStatus") ?? undefined,
        validOn: url.searchParams.get("validOn") ?? undefined,
      });

      return listCourses(session, query);
    },
    {
      message: "Courses loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createCourseSchema.parse(await request.json());

      return createCourse(session, {
        ...body,
        approvalDate: body.approvalDate || undefined,
        gtUploadedDurationHours: body.gtUploadedDurationHours,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Course created successfully",
      status: 201,
    },
  );
}