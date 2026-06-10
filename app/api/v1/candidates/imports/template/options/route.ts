import { listCandidateImportTemplateOptions } from "@/lib/server/candidate-import-template";
import { apiError, apiSuccess, getRequestId } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requestId = getRequestId(request.headers);

  try {
    const session = await requireAuth(request);
    const options = await listCandidateImportTemplateOptions(session);

    return apiSuccess(options, {
      message: "Candidate import template options loaded",
      requestId,
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
