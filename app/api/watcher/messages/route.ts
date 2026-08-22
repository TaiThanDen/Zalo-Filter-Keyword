import { Prisma } from "@prisma/client";
import { handleRouteError, ok } from "@/src/lib/http";
import { requireWatcherAuth } from "@/src/server/guards/watcher.guard";
import { ingestMessagesRequestSchema } from "@/src/modules/messages/messages.schemas";
import { ingestInboundMessage } from "@/src/modules/messages/messages.service";

export const maxDuration = 45;

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  task: (item: T) => Promise<TResult>,
) {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

export async function POST(request: Request) {
  try {
    const watcher = await requireWatcherAuth(request.headers.get("authorization"));
    const json = await request.json();
    const input = ingestMessagesRequestSchema.parse(json);
    const messages = "messages" in input ? input.messages : [input];
    const results = await mapWithConcurrency(messages, 3, (message) =>
      ingestInboundMessage(watcher, {
        ...message,
        rawPayload: message.rawPayload as Prisma.InputJsonValue | undefined,
      }),
    );

    if (!("messages" in input)) {
      return ok(results[0]);
    }

    return ok({
      accepted: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
