import assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
afterEach(() => vi.useRealTimers());
import { setImmediate } from "node:timers/promises";
import { watchBatchRealtime } from "../lib/client/batch-realtime";
import type { LiveQuerySnapshot, SealedLiveQuery } from "@neon/realtime/client";
import type { BatchRealtimeRow } from "../lib/generation/realtime-types";

type Listener = (snapshot: LiveQuerySnapshot<BatchRealtimeRow>) => void;
function harness(options: { rejectRenewal?: boolean; onRefresh?: () => Promise<void> } = {}) {
  const listeners: Listener[] = [];
  const errors: string[] = [];
  let refreshes = 0;
  let bundles = 0;
  let connections = 0;
  let closes = 0;
  let renews = 0;
  const sealed = (key: string): SealedLiveQuery<BatchRealtimeRow> => ({
    capability: `${Buffer.from(JSON.stringify({ alg: "dir", enc: "A256GCM", v: 1 })).toString("base64url")}..a.b.c`,
    queryFingerprint: (key === "queue" ? "a" : "b").repeat(64), expiresAt: Date.now() + 60_000,
  });
  const session = watchBatchRealtime({
    batchId: "batch",
    onChange: () => { refreshes++; return options.onRefresh?.(); },
    onError: (message) => errors.push(message),
  }, {
    fetchBundle: async () => {
      bundles++;
      if (options.rejectRenewal && bundles > 1) {
        throw Object.assign(new Error("Signed out"), { name: "BatchAuthorizationError" });
      }
      return { url: "wss://example.invalid", query: sealed("review") };
    },
    createClient: () => {
      connections++;
      return {
        subscribe() {
          return {
            onChange(listener: Listener) { listeners.push(listener); return () => {}; },
            async renew() { renews++; },
            unsubscribe() {},
          };
        },
        close() { closes++; },
      };
    },
  });
  return { session, listeners, errors, stats: () => ({ refreshes, bundles, connections, closes, renews }) };
}

const live = (data: BatchRealtimeRow[]): LiveQuerySnapshot<BatchRealtimeRow> => ({ status: "live", error: undefined, data });

test("live batch coalesces changes, ignores unchanged snapshots, and renews without reading content", async () => {
  vi.useFakeTimers({toFake: ["setTimeout", "Date"]});
  const h = harness();

  await setImmediate();
  assert.equal(h.listeners.length, 1);
  h.listeners[0](live([{ revision: "1" }]));
  h.listeners[0](live([{ revision: "1" }]));
  vi.advanceTimersByTime(150); await setImmediate();
  assert.equal(h.stats().refreshes, 1);
  for (let i = 0; i < 10; i++) h.listeners[0](live([{ revision: "1" }]));
  vi.advanceTimersByTime(49_850); await setImmediate();
  assert.equal(h.stats().refreshes, 1);
  assert.equal(h.stats().bundles, 2);
  assert.equal(h.stats().renews, 1);
  assert.equal(h.stats().connections, 1);
  h.listeners[0](live([{ revision: "2" }]));
  h.listeners[0](live([{ revision: "3" }]));
  vi.advanceTimersByTime(150); await setImmediate();
  assert.equal(h.stats().refreshes, 2);
  assert.deepEqual(h.errors, []);
  h.session.stop();
  vi.advanceTimersByTime(120_000); await setImmediate();
  assert.equal(h.stats().bundles, 2);
});

test("terminal subscription failure closes the connection and exposes a recoverable error", async () => {
  const h = harness();

  await setImmediate();
  h.listeners[0]({ status: "error", data: undefined,
    error: Object.assign(new Error("Rejected"), { code: "rejected", retryable: false }) });
  assert.equal(h.session.failed(), true);
  assert.equal(h.errors.length, 1);
  assert.equal(h.stats().closes, 1);
});

test("authorization refusal stops renewal retries and further data requests", async () => {
  vi.useFakeTimers({toFake: ["setTimeout", "Date"]});
  const h = harness({ rejectRenewal: true });

  await setImmediate();
  vi.advanceTimersByTime(50_000); await setImmediate();
  assert.equal(h.session.failed(), true);
  assert.equal(h.errors.length, 1);
  vi.advanceTimersByTime(120_000); await setImmediate();
  assert.equal(h.stats().bundles, 2);
  assert.equal(h.stats().refreshes, 0);
});

test("changes arriving during a content request schedule one follow-up refresh", async () => {
  vi.useFakeTimers({toFake: ["setTimeout", "Date"]});
  let finish!: () => void;
  const h = harness({ onRefresh: () => new Promise<void>((resolve) => { finish = resolve; }) });

  await setImmediate();
  h.listeners[0](live([{ revision: "1" }]));
  vi.advanceTimersByTime(150); await setImmediate();
  h.listeners[0](live([{ revision: "2" }]));
  h.listeners[0](live([{ revision: "3" }]));
  vi.advanceTimersByTime(1000); await setImmediate();
  assert.equal(h.stats().refreshes, 1);
  finish(); await setImmediate();
  vi.advanceTimersByTime(150); await setImmediate();
  assert.equal(h.stats().refreshes, 2);
  finish(); await setImmediate();
});

test("unmounting during setup aborts it and never opens a late connection", async () => {
  let finish!: (value: never) => void;
  let signal: AbortSignal | undefined;
  let connections = 0;
  const session = watchBatchRealtime({ batchId: "batch", onChange() {}, onError() {} }, {
    fetchBundle: async (received) => { signal = received; return new Promise((resolve) => { finish = resolve; }); },
    createClient: () => { connections++; throw new Error("Must not connect"); },
  });
  session.stop();
  assert.equal(signal?.aborted, true);
  finish({} as never);
  await setImmediate();
  assert.equal(connections, 0);
});
