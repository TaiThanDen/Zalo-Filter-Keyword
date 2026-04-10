import { handleRouteError, noContent, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { updateRuleSchema } from "@/src/modules/rules/rules.schemas";
import { deleteRule, getRuleById, updateRule } from "@/src/modules/rules/rules.service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    return ok(await getRuleById(id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const json = await request.json();
    const input = updateRuleSchema.parse(json);
    return ok(await updateRule(id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    await deleteRule(id);
    return noContent();
  } catch (error) {
    return handleRouteError(error);
  }
}
