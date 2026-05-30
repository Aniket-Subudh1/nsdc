import { apiError, apiSuccess, getRequestId } from "@/lib/server/http";
import { clearAuthCookie } from "@/lib/server/auth";
import { logoutUser } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);

  try {
    await logoutUser(request, requestId);
    const response = apiSuccess({}, { message: "Logout successful", requestId });

    clearAuthCookie(response);

    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}