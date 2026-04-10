import { handleRouteError, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { getLogDetail } from "@/src/modules/logs/logs.service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    return ok(await getLogDetail(id));
  } catch (error) {
    return handleRouteError(error);
  }
}
