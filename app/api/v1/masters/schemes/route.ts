import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createScheme, listSchemes } from "@/lib/server/services/masters";
import { createSchemeSchema, schemeListQuerySchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const query = schemeListQuerySchema.parse({
        page: url.searchParams.get("page") ?? undefined,
        pageSize: url.searchParams.get("pageSize") ?? undefined,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        syncEnabled: url.searchParams.get("syncEnabled") ?? undefined,
      });

      return listSchemes(session, query);
    },
    {
      message: "Schemes loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = createSchemeSchema.parse(await request.json());

      return createScheme(session, {
        ...body,
        description: body.description || undefined,
        beneficiaryType: body.beneficiaryType || undefined,
        fundingType: body.fundingType || undefined,
        requestId: request.headers.get("x-request-id") ?? undefined,
        sidhSchemeId: body.sidhSchemeId || undefined,
      });
    },
    {
      message: "Scheme created successfully",
      status: 201,
    },
  );
}