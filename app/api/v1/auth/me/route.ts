import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);

      return {
        user: session.user,
        permissions: session.permissions,
      };
    },
    {
      message: "Authenticated user loaded",
    },
  );
}