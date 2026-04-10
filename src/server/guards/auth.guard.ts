import { requireCurrentUser } from "@/src/modules/auth/auth.service";

export async function requireAdminSession() {
  return requireCurrentUser();
}
