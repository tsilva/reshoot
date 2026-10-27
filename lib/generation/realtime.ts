import "server-only";
import { createRealtime, rawSql } from "@neon/realtime/server";
import { ApiError } from "@/lib/api/errors";
import type { BatchRealtimeBundle, BatchRealtimeRow } from "./realtime-types";

export function batchRealtimeQuery(ownerId: string, batchId: string) {
  // Scope every capability to the authenticated browser workspace. No images,
  // signed URLs, prompts, provider diagnostics or credit records leave Postgres.
  return rawSql<BatchRealtimeRow>(
    "SELECT revision FROM public.generation_batch_revisions WHERE owner_id = $1 AND batch_id = $2",
    [ownerId, batchId],
  );
}

export async function sealBatchRealtime(ownerId: string, batchId: string): Promise<BatchRealtimeBundle> {
  const url = process.env.NEON_REALTIME_URL;
  const secret = process.env.NEON_REALTIME_SECRET;
  const connection = process.env.DATABASE_URL;
  if (!url || !secret || !connection) {
    throw new ApiError(503, "live_updates_unavailable", "Live updates are unavailable. Reconnect to try again.");
  }
  const endpoint = new URL(url);
  const db = decodeURIComponent(new URL(connection).pathname.slice(1));
  if (!["https:", "wss:"].includes(endpoint.protocol) || !db) {
    throw new ApiError(503, "live_updates_unavailable", "Live updates are unavailable.");
  }
  const realtime = createRealtime({ secret, db });
  return { url, query: await realtime.seal({ query: batchRealtimeQuery(ownerId, batchId) }) };
}
