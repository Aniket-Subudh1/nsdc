import { ApiError, handleRoute } from "@/lib/server/http";
import { listDashboardPlatformSection, type DashboardPlatformSection } from "@/lib/server/services/dashboard";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

function parseSection(value: string | null): DashboardPlatformSection {
  if (
    value === "centers" ||
    value === "sectors" ||
    value === "courses" ||
    value === "batches" ||
    value === "activity"
  ) {
    return value;
  }

  throw new ApiError(400, "INVALID_SECTION", "Section must be centers, sectors, courses, batches, or activity");
}

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);
      const page = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
      const pageSize = Number.parseInt(url.searchParams.get("pageSize") ?? "8", 10);

      return listDashboardPlatformSection(session, {
        section: parseSection(url.searchParams.get("section")),
        page: Number.isFinite(page) ? page : 1,
        pageSize: Number.isFinite(pageSize) ? pageSize : 8,
        search: url.searchParams.get("search") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        entityType: url.searchParams.get("entityType") ?? undefined,
        centerId: url.searchParams.get("centerId") ?? undefined,
      });
    },
    {
      message: "Platform overview section loaded",
    },
  );
}
