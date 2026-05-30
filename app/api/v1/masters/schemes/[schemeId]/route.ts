import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { updateScheme } from "@/lib/server/services/masters";
import { updateSchemeSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    schemeId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateSchemeSchema.parse(await request.json());
      const { schemeId } = await context.params;

      return updateScheme(session, schemeId, {
        ...body,
        beneficiaryType: body.beneficiaryType || undefined,
        description: body.description || undefined,
        fundingType: body.fundingType || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
        sidhSchemeId: body.sidhSchemeId || undefined,
      });
    },
    {
      message: "Scheme updated successfully",
    },
  );
}