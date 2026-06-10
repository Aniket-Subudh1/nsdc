import { setAuthCookie } from "@/lib/server/auth";
import { apiError, apiSuccess, getClientIp, getRequestId } from "@/lib/server/http";
import { verifyLoginOtp } from "@/lib/server/services/session";
import { loginVerifyOtpSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);

  try {
    const requestBody = await request.json().catch(() => ({}));
    const body = loginVerifyOtpSchema.parse(
      requestBody && typeof requestBody === "object" && !Array.isArray(requestBody) ? requestBody : {},
    );
    const result = await verifyLoginOtp({
      email: body.email,
      challengeId: body.challengeId,
      otp: body.otp,
      portal: body.portal,
      requestId,
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get("user-agent"),
    });

    const response = apiSuccess(
      {
        user: result.user,
        accessToken: result.accessToken,
        permissions: result.permissions,
        redirectPath: result.redirectPath,
      },
      {
        message: "Login successful",
        requestId,
      },
    );

    setAuthCookie(response, result.accessToken);

    return response;
  } catch (error) {
    return apiError(error, requestId);
  }
}
