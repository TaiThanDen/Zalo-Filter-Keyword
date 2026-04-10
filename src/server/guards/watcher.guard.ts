import { AppError } from "@/src/lib/errors";
import { authenticateWatcherApiKey } from "@/src/modules/watchers/watchers.service";

export async function requireWatcherAuth(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AppError("UNAUTHORIZED", "Watcher bearer token is required", 401);
  }

  const apiKey = authorizationHeader.slice("Bearer ".length).trim();

  if (!apiKey) {
    throw new AppError("UNAUTHORIZED", "Watcher bearer token is required", 401);
  }

  return authenticateWatcherApiKey(apiKey);
}
