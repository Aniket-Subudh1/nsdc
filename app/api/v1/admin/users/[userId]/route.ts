import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { getUserById, updateUser } from "@/lib/server/services/users";
import { updateUserSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    userId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { userId } = await context.params;

      return getUserById(session, userId);
    },
    {
      message: "User loaded",
    },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateUserSchema.parse(await request.json());
      const { userId } = await context.params;

      return updateUser(session, userId, {
        ...body,
        mobileNumber: body.mobileNumber || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "User updated successfully",
    },
  );
}