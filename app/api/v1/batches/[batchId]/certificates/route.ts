import { ApiError, apiError, getRequestId, handleRoute } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { canManageBatchSync } from "@/lib/server/rbac";
import { resolveCertificateDownloadFileName, resolveSidhBatchIdForActor } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";
import { createSidhConnector, SidhConnectorError, toApiErrorFromSidh } from "@/lib/server/services/sidh-connector";
import { certificateDownloadQuerySchema, certificateGenerationRequestSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

function ensureCanManageCertificates(roles: Parameters<typeof canManageBatchSync>[0]) {
  if (!canManageBatchSync(roles)) {
    throw new ApiError(403, "FORBIDDEN", "You do not have permission to manage batch certificates");
  }
}

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      ensureCanManageCertificates(session.user.roles);

      const requestId = request.headers.get("x-request-id") ?? createPrefixedId("certjob");
      const { batchId } = await context.params;
      const body = certificateGenerationRequestSchema.parse(await request.json());
      const { sidhBatchId } = await resolveSidhBatchIdForActor(session, batchId);
      const connector = createSidhConnector();

      try {
        return await connector.generateCertificate({
          attemptId: createPrefixedId("certatt"),
          payload: {
            batchId: sidhBatchId,
            userName: body.userName ?? body.candidateId ?? "",
          },
          syncJobId: requestId,
        });
      } catch (error) {
        if (error instanceof SidhConnectorError) {
          throw toApiErrorFromSidh(error);
        }

        throw error;
      }
    },
    {
      message: "Certificate generation requested in SIDH",
    },
  );
}

export async function GET(request: Request, context: RouteContext) {
  const requestId = getRequestId(request.headers);

  try {
    const session = await requireAuth(request);
    ensureCanManageCertificates(session.user.roles);

    const { batchId } = await context.params;
    const query = certificateDownloadQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    const { batch, sidhBatchId } = await resolveSidhBatchIdForActor(session, batchId);
    const fileName = await resolveCertificateDownloadFileName(batch.batchId, query.candidateId);
    const connector = createSidhConnector();

    let result;

    try {
      result = await connector.downloadCertificate({
        attemptId: createPrefixedId("certdownatt"),
        payload: {
          batchId: sidhBatchId,
          candidateId: query.candidateId,
          type: query.type,
        },
        syncJobId: requestId,
      });
    } catch (error) {
      if (error instanceof SidhConnectorError) {
        throw toApiErrorFromSidh(error);
      }

      throw error;
    }

    return new Response(result.responseBody, {
      headers: {
        "content-disposition": `attachment; filename="${fileName.replaceAll('"', "")}"`,
        "content-type": result.contentType ?? "application/pdf",
        "x-request-id": requestId,
      },
      status: 200,
    });
  } catch (error) {
    return apiError(error, requestId);
  }
}
