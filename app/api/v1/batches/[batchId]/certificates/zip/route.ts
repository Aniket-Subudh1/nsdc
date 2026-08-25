import { ApiError, apiError, getRequestId } from "@/lib/server/http";
import { canManageBatchSync } from "@/lib/server/rbac";
import { downloadBatchCertificatesZip } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";
import { certificateZipQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request.headers);

  try {
    const session = await requireAuth(request);
    if (!canManageBatchSync(session.user.roles)) {
      throw new ApiError(403, "FORBIDDEN", "You do not have permission to manage batch certificates");
    }

    const { batchId } = await context.params;
    const query = certificateZipQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const result = await downloadBatchCertificatesZip(session, batchId, {
      candidateIds: query.candidateIds,
      type: query.type,
    });

    return new Response(new Uint8Array(result.zip), {
      headers: {
        "content-disposition": `attachment; filename="${result.fileName.replaceAll('"', "")}"`,
        "content-type": "application/zip",
        "x-certificate-downloaded-count": String(result.downloadedCount),
        "x-certificate-failed-count": String(result.failed.length),
        "x-request-id": requestId,
      },
      status: 200,
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
