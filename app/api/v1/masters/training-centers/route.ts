import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import {
  createTrainingCenter,
  listTrainingCenters,
} from "@/lib/server/services/training-centers";
import {
  createTrainingCenterSchema,
  paginationQuerySchema,
} from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = paginationQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
      });

      return listTrainingCenters(session, query.page, query.pageSize);
    },
    {
      message: "Training centers loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createTrainingCenterSchema.parse(await request.json());

      return createTrainingCenter(session, {
        ...body,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Training center created successfully",
      status: 201,
    },
  );
}