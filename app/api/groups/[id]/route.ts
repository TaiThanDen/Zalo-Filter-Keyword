import { handleRouteError, noContent, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { updateGroupSchema } from "@/src/modules/groups/groups.schemas";
import { deleteGroup, getGroupById, updateGroup } from "@/src/modules/groups/groups.service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    return ok(await getGroupById(id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const json = await request.json();
    const input = updateGroupSchema.parse(json);
    return ok(await updateGroup(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    await deleteGroup(id);
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
