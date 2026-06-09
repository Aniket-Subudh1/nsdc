import { buildCandidateImportTemplate } from "@/lib/server/candidate-import-template";
import { apiError } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const session = await requireAuth(request);
    const { buffer } = await buildCandidateImportTemplate(session);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Disposition": 'attachment; filename="candidate_details.xlsx"',
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-request-id": requestId,
      },
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
