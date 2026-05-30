import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createCandidateImportJob } from "@/lib/server/services/candidates";
import { candidateImportSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        throw new Error("File upload is required");
      }

      const payload = candidateImportSchema.parse({
        programId: formData.get("programId"),
        centerId: formData.get("centerId"),
        registrationMode: formData.get("registrationMode") ?? undefined,
      });

      return createCandidateImportJob(
        session,
        payload,
        file.name,
        await file.arrayBuffer(),
        request.headers.get("x-request-id") ?? undefined,
      );
    },
    {
      message: "Candidate import staged successfully",
      status: 201,
    },
  );
}