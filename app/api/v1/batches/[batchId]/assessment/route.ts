import { ApiError, handleRoute } from "@/lib/server/http";
import { createPrefixedId } from "@/lib/server/ids";
import { canManageBatchSync } from "@/lib/server/rbac";
import { requireAuth } from "@/lib/server/services/session";
import { createSidhConnector } from "@/lib/server/services/sidh-connector";
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
      const connector = createSidhConnector();

      return connector.submitTrainingAndAssessment({
        attemptId: createPrefixedId("taatt"),
        payload: {
          ...body,
          batchId: body.batchId ?? batchId,
        },
        syncJobId: requestId,
      });
    },
    {
      message: "Training and assessment data submitted to SIDH",
    },
  );
}