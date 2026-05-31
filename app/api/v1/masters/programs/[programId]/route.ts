import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { deleteProgram, updateProgram } from "@/lib/server/services/masters";
import { updateProgramSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    programId: string;
  }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateProgramSchema.parse(await request.json());
      const { programId } = await context.params;

      return updateProgram(session, programId, {
        ...body,
        description: body.description || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Program updated successfully",
    },
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { programId } = await context.params;

      return deleteProgram(session, programId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Program deleted successfully",
    },
  );
}