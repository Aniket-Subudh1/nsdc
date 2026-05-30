import { handleRoute } from "@/lib/server/http";
import { requestPasswordResetOtp } from "@/lib/server/services/password-reset";
import { forgotPasswordRequestSchema } from "@/lib/server/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleRoute(
    request,
    async () => {
      const body = forgotPasswordRequestSchema.parse(await request.json());

      return requestPasswordResetOtp({
        email: body.email,
        portal: body.portal,
        requestId: request.headers.get("x-request-id") ?? undefined,
        ipAddress: request.headers.get("x-real-ip") ?? null,
      });
    },
    {
      message: "OTP request processed",
    },
  );
}