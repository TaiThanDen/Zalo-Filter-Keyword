import { handleRouteError, ok } from "@/src/lib/http";
import { logoutCurrentUser } from "@/src/modules/auth/auth.service";

export async function POST() {
  try {
    await logoutCurrentUser();
    return ok({ success: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
