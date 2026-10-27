import {
  createRealtimeClient,
  QueryRefreshController,
  type LiveQuerySnapshot,
  type MaterializedLiveQuerySubscription,
  type SealedLiveQuery,
} from "@neon/realtime/client";
import type { BatchRealtimeBundle, BatchRealtimeRow } from "@/lib/generation/realtime-types";

type Subscription = Pick<MaterializedLiveQuerySubscription<BatchRealtimeRow>, "onChange" | "renew" | "unsubscribe">;
type Client = { subscribe(query: SealedLiveQuery<BatchRealtimeRow>): Subscription; close(): void };
type Options = {
  batchId: string;
  onChange(signal: AbortSignal): Promise<unknown> | void;
  onConnected?(): void;
  onError(message: string): void;
};
type Dependencies = {
  fetchBundle(signal: AbortSignal): Promise<BatchRealtimeBundle>;
  createClient(url: string): Client;
};

async function fetchBundle(batchId: string, signal: AbortSignal): Promise<BatchRealtimeBundle> {
  const response = await fetch(`/api/generation-batches/${batchId}/realtime`, { cache: "no-store", signal });
  if (response.status === 401 || response.status === 403) {
    throw Object.assign(new Error("Live update authorization ended."), { name: "BatchAuthorizationError" });
  }
  if (!response.ok) throw new Error("Live updates are unavailable. Reconnect to try again.");
  return response.json();
}

// One connection, one scalar query, and a coalesced content refresh.
// Capability renewals perform authentication and local encryption, not batch reads.
export function watchBatchRealtime(options: Options, dependencies: Dependencies = {
  fetchBundle: (signal) => fetchBundle(options.batchId, signal),
  createClient: (url) => createRealtimeClient({ url }),
}): { stop(): void; failed(): boolean } {
  const abort = new AbortController();
  let stopped = false;
  let failed = false;
  let client: Client | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let refreshInFlight = false;
  let dirty = false;
  let pendingBundle: Promise<BatchRealtimeBundle> | undefined;
  let renewal: QueryRefreshController<BatchRealtimeRow> | undefined;

  const fail = () => {
    if (stopped || failed) return;
    failed = true;
    abort.abort();
    dirty = false;
    if (timer) clearTimeout(timer);
    renewal?.stop();
    client?.close();
    options.onError("Live updates are unavailable. Reconnect to try again.");
  };
  const refresh = async () => {
    timer = undefined;
    if (stopped || failed || refreshInFlight || !dirty) return;
    dirty = false;
    refreshInFlight = true;
    try {
      await options.onChange(abort.signal);
    } catch {
      fail();
    } finally {
      refreshInFlight = false;
      if (dirty && !stopped && !failed) timer = setTimeout(() => void refresh(), 150);
    }
  };
  const changed = () => {
    if (stopped || failed) return;
    dirty = true;
    if (!timer && !refreshInFlight) timer = setTimeout(() => void refresh(), 150);
  };
  const bundle = () => {
    // Reuse a pending authorization request.
    pendingBundle ??= dependencies.fetchBundle(abort.signal)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "BatchAuthorizationError") fail();
        throw error;
      })
      .finally(() => { pendingBundle = undefined; });
    return pendingBundle;
  };
  void bundle().then((initial) => {
    if (stopped) return;
    client = dependencies.createClient(initial.url);
    const subscription = client.subscribe(initial.query);
    let previous: string | undefined;
    subscription.onChange((snapshot: LiveQuerySnapshot<BatchRealtimeRow>) => {
      if (snapshot.status === "error") { fail(); return; }
      if (snapshot.status !== "live" || snapshot.data === undefined) return;
      options.onConnected?.();
      const signature = JSON.stringify(snapshot.data);
      if (signature === previous) return;
      previous = signature;
      // The initial snapshot also closes the race between the HTTP load and
      // subscribing. Identical reconnect snapshots cause no additional read.
      changed();
    });
    renewal = new QueryRefreshController({
      query: initial.query,
      refreshQuery: async () => (await bundle()).query,
      renewSubscription: (query) => subscription.renew(query),
      onRefreshExhausted: fail,
    });
    renewal.start();
  }).catch(() => { if (!abort.signal.aborted) fail(); });

  return {
    failed: () => failed,
    stop() {
      stopped = true;
      abort.abort();
      if (timer) clearTimeout(timer);
      renewal?.stop();
      client?.close();
    },
  };
}
