import { env } from "@/src/config/env";
import { logger } from "@/src/lib/logger";
import { processDueNotificationDeliveries } from "@/src/modules/notifications/notifications.service";

async function loop() {
  logger.info("worker_started", {
    pollIntervalMs: env.WORKER_POLL_INTERVAL_MS,
  });

  while (true) {
    try {
      const processed = await processDueNotificationDeliveries();
      logger.info("worker_tick", { processed });
    } catch (error) {
      logger.error("worker_tick_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
  }
}

loop().catch((error) => {
  logger.error("worker_fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
