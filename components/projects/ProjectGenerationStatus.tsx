"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationBatchStatus } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { useBatchRealtime } from "@/lib/client/use-batch-realtime";

export function ProjectGenerationStatus({ id, title, batchId, onFinished }: {
  id: string;
  title: string;
  batchId: string | null;
  onFinished(): Promise<void>;
}) {
  const [batch, setBatch] = useState<GenerationBatchStatus | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const revision = useRef(0);
  const terminal = Boolean(batch && ["succeeded", "partial", "failed"].includes(batch.status));
  const refresh = useCallback(async (signal: AbortSignal) => {
    if (!batchId) return;
    const requestRevision = ++revision.current;
    const response = await apiRequest<{ batch: GenerationBatchStatus }>(`/api/generation-batches/${batchId}`, {
      signal, cache: "no-store",
    });
    if (signal.aborted || requestRevision !== revision.current) return;
    setBatch(response.batch);
    setUnavailable(false);
    if (["succeeded", "partial", "failed"].includes(response.batch.status)) await onFinished();
  }, [batchId, onFinished]);

  useEffect(() => {
    const controller = new AbortController();
    const load = () => {
      if (document.hidden) return;
      void refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    };
    load();
    window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("focus", load); };
  }, [refresh]);

  useBatchRealtime({
    batchId: terminal ? null : batchId,
    retry: 0,
    onChange: refresh,
    onConnected: () => setUnavailable(false),
    onError: () => setUnavailable(true),
  });

  const total = batch?.jobs.length ?? 0;
  const finished = Math.min(total, (batch?.completedJobs ?? 0) + (batch?.failedJobs ?? 0));
  const progressText = batch && total
    ? `${batch.completedJobs} of ${total} views ready${batch.failedJobs ? `, ${batch.failedJobs} failed` : ""}${unavailable ? ". Live updates unavailable." : ""}`
    : unavailable ? "Progress unavailable. Open the shoot for details." : "Waiting for generation progress";
  return <span id={id} className="status-label status-generating project-generation-status"
    title={unavailable ? "Live progress is unavailable. Open the shoot for details." : undefined}>
    <span>Generating</span>
    <progress className="project-generation-progress" aria-label={`Generation progress for ${title}`}
      aria-valuetext={progressText}
      max={total || 1} value={batch && total ? finished : undefined} />
    <span className="sr-only">{progressText}</span>
  </span>;
}
