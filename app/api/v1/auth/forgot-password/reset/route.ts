import { handleRoute } from "@/lib/server/http";
import { resetPasswordWithOtp } from "@/lib/server/services/password-reset";
import { forgotPasswordResetSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const body = forgotPasswordResetSchema.parse(await request.json());

      return resetPasswordWithOtp({
        email: body.email,
        otp: body.otp,
        newPassword: body.newPassword,
        portal: body.portal,
        requestId: request.headers.get("x-request-id") ?? undefined,
        ipAddress: request.headers.get("x-real-ip") ?? null,
      });
    },
    {
      message: "Password reset completed",
    },
  );
}