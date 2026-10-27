import type { SealedLiveQuery } from "@neon/realtime/client";

export type BatchRealtimeRow = { revision: string };
export type BatchRealtimeBundle = { url: string; query: SealedLiveQuery<BatchRealtimeRow> };
