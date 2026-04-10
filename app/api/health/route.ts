import { ok } from "@/src/lib/http";
import { db } from "@/src/lib/db";

export async function GET() {
  const result = await db.$queryRaw`SELECT 1`;
  return ok({
    ok: true,
    timestamp: new Date().toISOString(),
    db: Array.isArray(result),
  });
}
