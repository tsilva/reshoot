"use client";

import { useEffect, useRef } from "react";
import { watchBatchRealtime } from "./batch-realtime";

export function useBatchRealtime(options: {
  batchId: string | null;
  retry: number;
  onChange(signal: AbortSignal): Promise<unknown>;
  onConnected(): void;
  onError(message: string): void;
}) {
  const callbacks = useRef(options);
  useEffect(() => { callbacks.current = options; });
  useEffect(() => {
    const batchId = options.batchId;
    if (!batchId) return;
    let session: ReturnType<typeof watchBatchRealtime> | undefined;
    const start = () => {
      if (document.hidden || navigator.onLine === false) return;
      if (session && !session.failed()) return;
      session?.stop();
      session = watchBatchRealtime({
        batchId,
        onChange: (signal) => callbacks.current.onChange(signal),
        onConnected: () => callbacks.current.onConnected(),
        onError: (message) => callbacks.current.onError(message),
      });
    };
    const visibility = () => {
      if (document.hidden) { session?.stop(); session = undefined; }
      else start();
    };
    start();
    window.addEventListener("focus", start);
    window.addEventListener("online", start);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      session?.stop();
      window.removeEventListener("focus", start);
      window.removeEventListener("online", start);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [options.batchId, options.retry]);
}
