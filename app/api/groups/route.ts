import { handleRouteError, ok, created } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { createGroupSchema, listGroupsQuerySchema } from "@/src/modules/groups/groups.schemas";
import { createGroup, listGroups } from "@/src/modules/groups/groups.service";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const query = listGroupsQuerySchema.parse(searchParams);
    return ok(await listGroups(query));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const json = await request.json();
    const input = createGroupSchema.parse(json);
    return created(await createGroup(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
