import { handleRouteError, ok } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { replaceGroupRulesSchema } from "@/src/modules/groups/groups.schemas";
import { getGroupById, replaceGroupRules } from "@/src/modules/groups/groups.service";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const group = await getGroupById(id);
    return ok({
      groupId: group.id,
      rules: group.groupRules.map((groupRule) => groupRule.rule),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminSession();
    const { id } = await context.params;
    const json = await request.json();
    const input = replaceGroupRulesSchema.parse(json);
    return ok(await replaceGroupRules(id, input.ruleIds));
  } catch (error) {
    return handleRouteError(error);
  }
}
