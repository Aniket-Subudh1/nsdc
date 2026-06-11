import { handleRoute } from "@/lib/server/http";
import {
  getDashboardEnrollmentAnalytics,
  type EnrollmentAnalyticsFilters,
} from "@/lib/server/services/enrollment-analytics";
import { requireAuth } from "@/lib/server/services/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleRoute(
    request,
    async () => {
      const session = await requireAuth(request);
      const url = new URL(request.url);

      const filters: EnrollmentAnalyticsFilters = {
        financialYear: url.searchParams.get("financialYear") ?? "all",
        district: url.searchParams.get("district") ?? undefined,
        sectorId: url.searchParams.get("sectorId") ?? undefined,
        programId: url.searchParams.get("programId") ?? undefined,
        centerId: url.searchParams.get("centerId") ?? undefined,
      };

      return getDashboardEnrollmentAnalytics(session, filters);
    },
    {
      message: "Enrollment analytics loaded",
    },
  );
}
