import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { assignUserCenters } from "@/lib/server/services/users";
import { assignCentersSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = assignCentersSchema.parse(await request.json());
      const { userId } = await context.params;

      return assignUserCenters(
        session,
        userId,
        body.centerIds,
        request.headers.get("x-request-id") ?? undefined,
      );
    },
    {
      message: "User centers assigned successfully",
    },
  );
}