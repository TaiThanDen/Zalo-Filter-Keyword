import { handleRouteError, ok } from "@/src/lib/http";
import { getCurrentUser } from "@/src/modules/auth/auth.service";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return ok({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
