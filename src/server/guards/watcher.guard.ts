import { AppError } from "@/src/lib/errors";
import { authenticateWatcherApiKey } from "@/src/modules/watchers/watchers.service";

export function requireWatcherApiKey(authorizationHeader: string | null) {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    throw new AppError("UNAUTHORIZED", "Watcher bearer token is required", 401);
  }

  const apiKey = authorizationHeader.slice("Bearer ".length).trim();

  if (!apiKey) {
    throw new AppError("UNAUTHORIZED", "Watcher bearer token is required", 401);
  }

  return apiKey;
}

export async function requireWatcherAuth(authorizationHeader: string | null) {
  return authenticateWatcherApiKey(requireWatcherApiKey(authorizationHeader));
}
