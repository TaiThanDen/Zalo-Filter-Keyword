import { handleRouteError, ok } from "@/src/lib/http";
import { getDashboardStats } from "@/src/modules/logs/logs.service";
import { requireAdminSession } from "@/src/server/guards/auth.guard";

export async function GET() {
  try {
    await requireAdminSession();
    return ok(await getDashboardStats());
  } catch (error) {
    return handleRouteError(error);
  }
}
