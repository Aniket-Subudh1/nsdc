import { ApiError, handleRoute } from "@/lib/server/http";
import { listDashboardCenterSection, type DashboardCenterSection } from "@/lib/server/services/dashboard";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

function parseSection(value: string | null): DashboardCenterSection {
  if (value === "sectors" || value === "courses" || value === "batches") {
    return value;
  }

  throw new ApiError(400, "INVALID_SECTION", "Section must be sectors, courses, or batches");
}

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "8", 10);

      return listDashboardCenterSection(session, {
        section: parseSection(url.searchParams.get("section")),
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 8,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
      });
    },
    {
      message: "Center overview section loaded",
    },
  );
}
