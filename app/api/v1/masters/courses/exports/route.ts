import { apiError } from "@/lib/server/http";
import { exportCourses } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";
import { courseExportQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth(request);
    const url = new URL(request.url);
    const query = courseExportQuerySchema.parse({
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      sectorId: url.searchParams.get("sectorId") ?? undefined,
      programId: url.searchParams.get("programId") ?? undefined,
      approvalStatus: url.searchParams.get("approvalStatus") ?? undefined,
      validOn: url.searchParams.get("validOn") ?? undefined,
    });

    const { buffer } = await exportCourses(session, query);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="courses_export_${stamp}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
