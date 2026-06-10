import { listCourseImportTemplateOptions } from "@/lib/server/course-import-template";
import { apiError, apiSuccess, getRequestId } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers);

  try {
    await requireAuth(request);
    const options = await listCourseImportTemplateOptions();

    return apiSuccess(options, {
      message: "Course import template options loaded",
      requestId,
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
