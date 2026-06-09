import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createCourseImportJob } from "@/lib/server/services/course-import";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        throw new Error("File upload is required");
      }

      return createCourseImportJob(
        session,
        file.name,
        await file.arrayBuffer(),
        request.headers.get("x-request-id") ?? undefined,
      );
    },
    {
      message: "Course import staged successfully",
      status: 201,
    },
  );
}
