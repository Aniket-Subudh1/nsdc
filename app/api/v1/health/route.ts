import { handleRoute } from "@/lib/server/http";
import { getEnv, getSidhBaseUrl } from "@/lib/server/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const env = getEnv();

      return {
        status: "ok",
        appEnv: env.APP_ENV,
        nodeEnv: env.NODE_ENV,
        sidhEnv: env.SIDH_ENV,
        sidhBaseUrl: getSidhBaseUrl(env),
        timestamp: new Date().toISOString(),
      };
    },
    {
      message: "Service is healthy",
    },
  );
}