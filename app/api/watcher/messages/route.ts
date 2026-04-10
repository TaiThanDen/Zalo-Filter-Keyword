import { Prisma } from "@prisma/client";
import { handleRouteError, ok } from "@/src/lib/http";
import { requireWatcherAuth } from "@/src/server/guards/watcher.guard";
import { ingestMessageSchema } from "@/src/modules/messages/messages.schemas";
import { ingestInboundMessage } from "@/src/modules/messages/messages.service";

export async function POST(request: Request) {
  try {
    const watcher = await requireWatcherAuth(request.headers.get("authorization"));
    const json = await request.json();
    const input = ingestMessageSchema.parse(json);
    return ok(
      await ingestInboundMessage(watcher, {
        ...input,
        rawPayload: input.rawPayload as Prisma.InputJsonValue | undefined,
      }),
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
