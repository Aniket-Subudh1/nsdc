import { buildCourseImportTemplate } from "@/lib/server/course-import-template";
import { apiError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    await requireAuth(request);
    const { buffer } = await buildCourseImportTemplate();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": 'attachment; filename="course_import_template.xlsx"',
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
