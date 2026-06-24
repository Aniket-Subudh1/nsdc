import { apiError, apiSuccess, getClientIp, getRequestId, ApiError } from "@/lib/server/http";
import { resendAdminLoginOtp } from "@/lib/server/services/login-otp";
import { loginResendOtpSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = getRequestId(request.headers);

  try {
    const requestBody = await request.json().catch(() => ({}));
    const body = loginResendOtpSchema.parse(
      requestBody && typeof requestBody === "object" && !Array.isArray(requestBody) ? requestBody : {},
    );

    if (body.portal !== "admin") {
      throw new ApiError(
        400,
        "OTP_CHALLENGE_INVALID",
        "Your verification session expired. Please sign in again.",
      );
    }

    const result = await resendAdminLoginOtp({
      email: body.email,
      challengeId: body.challengeId,
      requestId,
      ipAddress: getClientIp(request.headers),
    });

    return apiSuccess(
      {
        challengeId: result.challengeId,
        maskedEmail: result.maskedEmail,
      },
      {
        message: result.message,
        requestId,
      },
    );
  } catch (error) {
    return apiError(error, requestId);
  }
}
