import { handleRouteError, ok, created } from "@/src/lib/http";
import { requireAdminSession } from "@/src/server/guards/auth.guard";
import { createRuleSchema, listRulesQuerySchema } from "@/src/modules/rules/rules.schemas";
import { createRule, listRules } from "@/src/modules/rules/rules.service";

export async function GET(request: Request) {
  try {
    await requireAdminSession();
    const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
    const query = listRulesQuerySchema.parse(searchParams);
    return ok(await listRules(query));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminSession();
    const json = await request.json();
    const input = createRuleSchema.parse(json);
    return created(await createRule(input));
  } catch (error) {
    return handleRouteError(error);
  }
}
