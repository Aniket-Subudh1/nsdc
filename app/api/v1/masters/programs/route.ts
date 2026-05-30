import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createProgram, listPrograms } from "@/lib/server/services/masters";
import { createProgramSchema, programListQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = programListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        syncToSidh: url.searchParams.get("syncToSidh") ?? undefined,
      });

      return listPrograms(session, query);
    },
    {
      message: "Programs loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createProgramSchema.parse(await request.json());

      return createProgram(session, {
        ...body,
        description: body.description || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
      });
    },
    {
      message: "Program created successfully",
      status: 201,
    },
  );
}