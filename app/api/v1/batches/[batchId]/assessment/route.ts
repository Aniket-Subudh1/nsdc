import { ApiError, handleRoute } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { canManageBatchSync } from "@/lib/server/rbac";
import { resolveSidhBatchId } from "@/lib/server/sidh-payload";
import { resolveSidhBatchIdForActor } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";
import { createSidhConnector, SidhConnectorError, toApiErrorFromSidh } from "@/lib/server/services/sidh-connector";
import { trainingAssessmentSubmissionSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      if (!canManageBatchSync(session.user.roles)) {
        throw new ApiError(403, "FORBIDDEN", "You do not have permission to submit batch assessment data");
      }

      const requestId = request.headers.get("x-request-id") ?? createPrefixedId("tasjob");
      const { batchId } = await context.params;
      const body = trainingAssessmentSubmissionSchema.parse(await request.json());
      const { sidhBatchId } = await resolveSidhBatchIdForActor(session, batchId);
      const remoteBatchId = resolveSidhBatchId(body.batchId ?? sidhBatchId);
      if (remoteBatchId === null) {
        throw new ApiError(400, "BATCH_NOT_SYNCED", "Batch must be synced to SIDH before assessments can be submitted");
      }
      const connector = createSidhConnector();

      try {
        return await connector.submitTrainingAndAssessment({
          attemptId: createPrefixedId("taatt"),
          payload: {
            ...body,
            batchId: remoteBatchId,
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
      message: "Training and assessment data submitted to SIDH",
    },
  );
}
