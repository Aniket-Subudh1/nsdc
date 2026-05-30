import { handleRoute } from "@/lib/server/http";
import { ensureBootstrapData } from "@/lib/server/bootstrap";
import { connectToDatabase } from "@/lib/server/mongodb";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const mongoose = await connectToDatabase();
      await ensureBootstrapData();

      return {
        status: mongoose.connection.readyState === 1 ? "ready" : "not_ready",
        databaseState: mongoose.connection.readyState,
      };
    },
    {
      message: "Service readiness checked",
    },
  );
}