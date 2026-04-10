import { handleRouteError, ok } from "@/src/lib/http";
import { loginSchema } from "@/src/modules/auth/auth.schemas";
import { loginWithPassword } from "@/src/modules/auth/auth.service";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const input = loginSchema.parse(json);
    const user = await loginWithPassword(input);
    return ok({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
