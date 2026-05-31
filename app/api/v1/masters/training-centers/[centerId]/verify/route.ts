import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { verifyTrainingCenterForSidh } from "@/lib/server/services/training-centers";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    centerId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { centerId } = await context.params;

      return verifyTrainingCenterForSidh(session, centerId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Training center verified successfully",
    },
  );
}