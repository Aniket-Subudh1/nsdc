import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { deleteBatch, getBatch, updateBatch } from "@/lib/server/services/batches";
import { updateBatchSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    batchId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId } = await context.params;
      return getBatch(session, batchId);
    },
    {
      message: "Batch loaded",
    },
  );
}

export async function PATCH(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = updateBatchSchema.parse(await request.json());
      const { batchId } = await context.params;

      return updateBatch(session, batchId, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Batch updated successfully",
    },
  );
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { batchId } = await context.params;

      return deleteBatch(session, batchId, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Batch deleted successfully",
    },
  );
}