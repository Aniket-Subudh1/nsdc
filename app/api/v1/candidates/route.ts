import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createCandidate, listCandidates } from "@/lib/server/services/candidates";
import { candidateListQuerySchema, createCandidateRegistrationSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = candidateListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        programId: url.searchParams.get("programId") ?? undefined,
        centerId: url.searchParams.get("centerId") ?? undefined,
        referenceCourseId: url.searchParams.get("referenceCourseId") ?? undefined,
        state: url.searchParams.get("state") ?? undefined,
        district: url.searchParams.get("district") ?? undefined,
        gender: url.searchParams.get("gender") ?? undefined,
        syncStatus: url.searchParams.get("syncStatus") ?? undefined,
        registrationMode: url.searchParams.get("registrationMode") ?? undefined,
        eligibleForBatchId: url.searchParams.get("eligibleForBatchId") ?? undefined,
      });

      return listCandidates(session, query);
    },
    {
      message: "Candidates loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createCandidateRegistrationSchema.parse(await request.json());

      return createCandidate(session, body, {
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Candidate created successfully",
      status: 201,
    },
  );
}