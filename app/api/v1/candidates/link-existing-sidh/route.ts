import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { linkExistingSidhCandidate } from "@/lib/server/services/candidates";
import { linkExistingSidhCandidateSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = linkExistingSidhCandidateSchema.parse(await request.json());

      return linkExistingSidhCandidate(session, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Existing SIDH candidate linked successfully",
      status: 201,
    },
  );
}