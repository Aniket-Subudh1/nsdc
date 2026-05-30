import { handleRoute } from "@/lib/server/http";
import { attendanceImportFormSchema } from "@/lib/server/validation";
import { createAttendanceImport } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const formData = await request.formData();
      const file = formData.get("file");
      const parsed = attendanceImportFormSchema.parse({
        batchId: formData.get("batchId"),
      });

      if (!(file instanceof File)) {
        throw new Error("Attendance import requires an uploaded file");
      }

      return createAttendanceImport(session, parsed.batchId, file.name, await file.arrayBuffer());
    },
    {
      message: "Attendance import staged",
      status: 201,
    },
  );
}