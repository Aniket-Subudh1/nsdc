import { handleRoute } from "@/lib/server/http";
import { updateSidhBatchFieldOption } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";
import { updateSidhBatchFieldOptionSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    referenceValueId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { referenceValueId } = await context.params;
      const body = updateSidhBatchFieldOptionSchema.parse(await request.json());

      return updateSidhBatchFieldOption(
        session,
        referenceValueId,
        body,
        request.headers.get("x-request-id") ?? undefined,
      );
    },
    {
      message: "SIDH batch field option updated",
    },
  );
}
