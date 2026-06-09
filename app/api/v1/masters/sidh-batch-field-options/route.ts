import { handleRoute } from "@/lib/server/http";
import { createSidhBatchFieldOption, listSidhBatchFieldOptions } from "@/lib/server/services/masters";
import { requireAuth } from "@/lib/server/services/session";
import { createSidhBatchFieldOptionSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      return listSidhBatchFieldOptions(session);
    },
    {
      message: "SIDH batch field options loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createSidhBatchFieldOptionSchema.parse(await request.json());

      return createSidhBatchFieldOption(
        session,
        body,
        request.headers.get("x-request-id") ?? undefined,
      );
    },
    {
      message: "SIDH batch field option created",
      status: 201,
    },
  );
}
