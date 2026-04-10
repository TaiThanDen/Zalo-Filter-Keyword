import { handleRouteError, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { listLogsQuerySchema } from "@/src/modules/logs/logs.schemas";
import { listLogs } from "@/src/modules/logs/logs.service";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const query = listLogsQuerySchema.parse(searchParams);
    return ok(await listLogs(query));
  } catch (error) {
    return handleRouteError(error);
  }
}
