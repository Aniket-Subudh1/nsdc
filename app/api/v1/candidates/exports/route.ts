import { apiError } from "@/lib/server/http";
import { exportCandidates } from "@/lib/server/services/candidates";
import { requireAuth } from "@/lib/server/services/session";
import { candidateExportQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth(request);
    const url = new URL(request.url);
    const query = candidateExportQuerySchema.parse({
      search: url.searchParams.get("search") ?? undefined,
      programId: url.searchParams.get("programId") ?? undefined,
      centerId: url.searchParams.get("centerId") ?? undefined,
      referenceCourseId: url.searchParams.get("referenceCourseId") ?? undefined,
      referenceSectorName: url.searchParams.get("referenceSectorName") ?? undefined,
      state: url.searchParams.get("state") ?? undefined,
      district: url.searchParams.get("district") ?? undefined,
      gender: url.searchParams.get("gender") ?? undefined,
      syncStatus: url.searchParams.get("syncStatus") ?? undefined,
      registrationMode: url.searchParams.get("registrationMode") ?? undefined,
      eligibleForBatchId: url.searchParams.get("eligibleForBatchId") ?? undefined,
      registeredFrom: url.searchParams.get("registeredFrom") ?? undefined,
      registeredTo: url.searchParams.get("registeredTo") ?? undefined,
    });

    const { buffer } = await exportCandidates(session, query);
    const stamp = new Date().toISOString().slice(0, 10);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": `attachment; filename="candidates_export_${stamp}.xlsx"`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
