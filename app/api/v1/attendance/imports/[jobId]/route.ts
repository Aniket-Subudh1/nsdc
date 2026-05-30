import { handleRoute } from "@/lib/server/http";
import { getAttendanceImport } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const { jobId } = await context.params;
      return getAttendanceImport(session, jobId);
    },
    {
      message: "Attendance import loaded",
    },
  );
}