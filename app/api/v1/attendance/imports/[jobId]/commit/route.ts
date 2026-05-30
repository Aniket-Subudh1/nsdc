import { handleRoute } from "@/lib/server/http";
import { attendanceCommitSchema } from "@/lib/server/validation";
import { commitAttendanceImport } from "@/lib/server/services/batches";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    jobId: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const body = attendanceCommitSchema.parse(await request.json().catch(() => ({})));
      const { jobId } = await context.params;

      return commitAttendanceImport(session, jobId, body, request.headers.get("x-request-id") ?? undefined);
    },
    {
      message: "Attendance import committed",
    },
  );
}