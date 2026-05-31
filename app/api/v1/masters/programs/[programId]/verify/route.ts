import { handleRoute } from "@/lib/server/http";
import { verifyProgramForSidh } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    programId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { programId } = await context.params;

      return verifyProgramForSidh(session, programId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Program verified successfully",
    },
  );
}