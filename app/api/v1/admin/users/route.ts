import { handleRoute } from "@/lib/server/http";
import { requireAuth } from "@/lib/server/services/session";
import { createUser, listUsers } from "@/lib/server/services/users";
import { createUserSchema, paginationQuerySchema } from "@/lib/server/validation";

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

      return listUsers(session, query.page, query.pageSize);
    },
    {
      message: "Users loaded",
    },
  );
}

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const requestId = request.headers.get("x-request-id") ?? undefined;
      const body = createUserSchema.parse(await request.json());

      return createUser(session, {
        name: body.name,
        email: body.email,
        mobileNumber: body.mobileNumber || undefined,
        roles: body.roles ?? (body.role ? [body.role] : []),
        centerIds: body.centerIds,
        temporaryPassword: body.temporaryPassword,
        requestId,
      });
    },
    {
      message: "User created successfully",
      status: 201,
    },
  );
}