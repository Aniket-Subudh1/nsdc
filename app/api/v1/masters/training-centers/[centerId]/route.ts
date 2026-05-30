import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { updateTrainingCenter } from "@/lib/server/services/training-centers";
import { updateTrainingCenterSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    centerId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateTrainingCenterSchema.parse(await request.json());
      const { centerId } = await context.params;

      return updateTrainingCenter(session, centerId, {
        ...body,
        requestId: request.headers.get("x-request-id") ?? undefined,
        sidhTcId: body.sidhTcId || undefined,
      });
    },
    {
      message: "Training center updated successfully",
    },
  );
}