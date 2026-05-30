import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { assignUserRoles } from "@/lib/server/services/users";
import { assignRolesSchema } from "@/lib/server/validation";

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
      const body = assignRolesSchema.parse(await request.json());
      const { userId } = await context.params;

      return assignUserRoles(
        session,
        userId,
        body.roles,
        request.headers.get("x-request-id") ?? undefined,
      );
    },
    {
      message: "User roles assigned successfully",
    },
  );
}