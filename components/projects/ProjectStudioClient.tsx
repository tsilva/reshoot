"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  ImageSquare,
  SpinnerGap,
  Plus,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type {
  GenerationBatchStatus,
  GenerationQuote,
  ProjectDetail,
  ProjectShot,
} from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { uploadProjectFile, validateUploadFile } from "@/lib/client/uploads";
import { exportVisibleShots } from "@/lib/client/export";
import { useBatchRealtime } from "@/lib/client/use-batch-realtime";
import { automaticShotRequests, shootReferences } from "@/lib/client/shoot-plan";
import { usePhotoPlayback } from "@/lib/client/use-photo-playback";
import { SlideshowControls } from "@/components/SlideshowControls";

function batchIsTerminal(status: GenerationBatchStatus["status"]) {
  return ["partial", "succeeded", "failed"].includes(status);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ProjectStudioClient({ initialProject, checkoutAvailable, onOpenWallet, onBalanceChange, walletRevision = 0, walletButton, pageError, children }: {
  initialProject: ProjectDetail;
  checkoutAvailable: boolean;
  onOpenWallet?: () => void;
  onBalanceChange?: () => void;
  walletRevision?: number;
  walletButton: ReactNode;
  pageError: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [storedQuote, setQuote] = useState<GenerationQuote | null>(null);
  const [quotedWalletRevision, setQuotedWalletRevision] = useState(walletRevision);
  const quote = quotedWalletRevision === walletRevision ? storedQuote : null;
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeShotId, setActiveShotId] = useState<string | null>(null);
  const [loadedPhotos, setLoadedPhotos] = useState<Set<string>>(() => new Set());
  const [batch, setBatch] = useState<GenerationBatchStatus | null>(null);
  const [uploading, setUploading] = useState<Array<{ name: string; progress: number }>>([]);
  const [photosStale, setPhotosStale] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [liveRetry, setLiveRetry] = useState(0);
  const canvasRef = useRef<HTMLDivElement>(null);
  const quoteRevision = useRef(0);
  const automaticQuoteKey = useRef<string | null>(null);
  const batchConfirmation = useRef<{ quoteId: string; key: string } | null>(null);

  function invalidateQuote() {
    quoteRevision.current += 1;
    automaticQuoteKey.current = null;
    setQuote(null);
    setQuoting(false);
  }

  const references = shootReferences(project.assets);
  const primary = references[0];
  const hasPrimary = Boolean(primary);
  const referenceKey = references.map((asset) => asset.id).join(",");
  const readyOriginals = project.assets.filter(
    (asset) => asset.kind === "original" && asset.status === "ready",
  );
  const generationStarted = project.shots.length > 0 || Boolean(batch) || Boolean(initialProject.activeBatchId);
  const busy = submitting || uploading.length > 0;
  const generating = Boolean(batch && !batchIsTerminal(batch.status)) || Boolean(initialProject.activeBatchId && !batch);

  useEffect(() => {
    if (!initialProject.activeBatchId) return;
    let active = true;
    void apiRequest<{ batch: GenerationBatchStatus }>(`/api/generation-batches/${initialProject.activeBatchId}`, { cache: "no-store" })
      .then((response) => {
        if (!active) return;
        setBatch(response.batch);
        if (!batchIsTerminal(response.batch.status)) {
          void apiRequest<void>(`/api/generation-batches/${response.batch.id}/resume`, { method: "POST" })
            .then(() => { if (active) setResumeError(null); })
            .catch(() => { if (active) setResumeError("Could not resume generation. Reconnect to try again."); });
        }
      })
      .catch((resumeError) => {
        if (active) {
          setResumeError(
            resumeError instanceof Error
              ? resumeError.message
              : "The active generation could not be resumed.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [initialProject.activeBatchId]);

  const refreshProject = useCallback(async () => {
    const response = await apiRequest<{ project: ProjectDetail }>(
      `/api/projects/${project.id}`,
    );
    setProject(response.project);
    onBalanceChange?.();
  }, [project.id, onBalanceChange]);

  const activeBatchId = batch && !batchIsTerminal(batch.status) ? batch.id : null;
  useBatchRealtime({
    batchId: activeBatchId,
    retry: liveRetry,
    onConnected: () => setLiveError(null),
    onError: setLiveError,
    onChange: async (signal) => {
      if (!activeBatchId) return;
      const response = await apiRequest<{ batch: GenerationBatchStatus }>(`/api/generation-batches/${activeBatchId}`, { cache: "no-store", signal });
      setBatch(response.batch);
      onBalanceChange?.();
    },
  });

  const terminalBatchId = batch && batchIsTerminal(batch.status) ? batch.id : null;
  useEffect(() => {
    if (!terminalBatchId) return;
    let active = true;
    void apiRequest<{ project: ProjectDetail }>(`/api/projects/${project.id}`, { cache: "no-store" })
      .then((response) => {
        if (!active) return;
        setProject(response.project);
        onBalanceChange?.();
        router.refresh();
      })
      .catch(() => { if (active) setError("Could not refresh the completed shoot. Reload the page to try again."); });
    return () => { active = false; };
  }, [terminalBatchId, project.id, onBalanceChange, router]);

  async function reconnectGeneration() {
    const batchId = activeBatchId ?? initialProject.activeBatchId;
    if (!batchId) return;
    try {
      await apiRequest<void>(`/api/generation-batches/${batchId}/resume`, { method: "POST" });
      const response = await apiRequest<{ batch: GenerationBatchStatus }>(`/api/generation-batches/${batchId}`, { cache: "no-store" });
      setBatch(response.batch);
      setLiveError(null);
      setResumeError(null);
      setLiveRetry((value) => value + 1);
    } catch { setResumeError("Could not resume generation. Reconnect to try again."); }
  }

  async function uploadMore(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const invalid = files.find(validateUploadFile);
    if (invalid) {
      setError(validateUploadFile(invalid));
      return;
    }
    if (project.originalCount + files.length > 25) {
      setError("A project can contain up to 25 original photos.");
      return;
    }
    invalidateQuote();
    setUploading(files.map((file) => ({ name: file.name, progress: 0 })));
    setError(null);
    for (let index = 0; index < files.length; index += 1) {
      try {
        await uploadProjectFile({
          projectId: project.id,
          file: files[index],
          onProgress: (progress) =>
            setUploading((current) =>
              current.map((upload, currentIndex) =>
                currentIndex === index ? { ...upload, progress } : upload,
              ),
            ),
        });
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "A photo failed to upload.");
      }
    }
    try {
      await refreshProject();
      setPhotosStale(false);
    } catch {
      setPhotosStale(true);
      setError("Could not refresh your photos. Reload the page before generating.");
    } finally {
      setUploading([]);
    }
  }

  const requestQuote = useCallback(async () => {
    if (generationStarted) return;
    const requests = automaticShotRequests(project.assets);
    if (!hasPrimary) {
      setError("Add a product photo to start.");
      return;
    }
    if (!requests.length) {
      setError("Add a product photo to start.");
      return;
    }
    if (busy || generating || quoting || photosStale) return;
    setQuoting(true);
    setQuote(null);
    setError(null);
    const revision = ++quoteRevision.current;
    try {
      const response = await apiRequest<{ quote: GenerationQuote }>(
        `/api/projects/${project.id}/generation-quotes`,
        { method: "POST", body: JSON.stringify({ shots: requests }) },
      );
      if (revision !== quoteRevision.current) return;
      setQuotedWalletRevision(walletRevision);
      setQuote(response.quote);
    } catch (quoteError) {
      if (revision === quoteRevision.current) setError(quoteError instanceof Error ? quoteError.message : "Could not create a quote.");
    } finally {
      if (revision === quoteRevision.current) setQuoting(false);
    }
  }, [busy, generating, generationStarted, hasPrimary, photosStale, project.assets, project.id, quoting, walletRevision]);

  useEffect(() => {
    if (generationStarted || !referenceKey || busy || generating || quoting || photosStale) return;
    const key = `${project.id}:${referenceKey}:${walletRevision}`;
    if (automaticQuoteKey.current === key) return;
    automaticQuoteKey.current = key;
    void requestQuote();
  }, [referenceKey, project.id, walletRevision, busy, generating, generationStarted, quoting, photosStale, requestQuote]);

  async function confirmBatch() {
    if (!quote || busy || generating || generationStarted) return;
    if (Date.now() >= new Date(quote.expiresAt).getTime()) {
      invalidateQuote();
      setError("This price expired. Check the cost again to continue.");
      return;
    }
    if (batchConfirmation.current?.quoteId !== quote.id) {
      batchConfirmation.current = { quoteId: quote.id, key: crypto.randomUUID() };
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<{ batchId: string; monitoringStarted: boolean }>(
        `/api/projects/${project.id}/generation-batches`,
        {
          method: "POST",
          body: JSON.stringify({ quoteId: quote.id, idempotencyKey: batchConfirmation.current.key }),
        },
      );
      const response = await apiRequest<{ batch: GenerationBatchStatus }>(
        `/api/generation-batches/${created.batchId}`,
      );
      setBatch(response.batch);
      setResumeError(created.monitoringStarted ? null : "Generation is saved but could not start. Reconnect to resume it.");
      setQuote(null);
      automaticQuoteKey.current = null;
      canvasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      router.refresh();
      onBalanceChange?.();
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "Could not start generation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadViews() {
    setExporting(true);
    setError(null);
    try {
      const archive = await exportVisibleShots(project.shots);
      if (!archive) {
        setNotice("Your views will be available to download once generation finishes.");
        return;
      }
      const url = URL.createObjectURL(new Blob([new Uint8Array(archive)], { type: "application/zip" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(project.title) || "project"}-reshoot.zip`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed. Please retry.");
    } finally {
      setExporting(false);
    }
  }

  const completedShots = useMemo(() => project.shots
    .filter((shot) => shot.versions.length > 0)
    .sort((a, b) => (a.azimuth ?? 360) - (b.azimuth ?? 360)), [project.shots]);
  const activeShot = completedShots.find((shot) => shot.id === activeShotId) ?? completedShots[0];
  function latestVersion(shot: ProjectShot) {
    return shot.versions.at(-1)!;
  }
  const activeVersion = activeShot ? latestVersion(activeShot) : null;
  const canvasImage = activeVersion?.previewUrl ?? primary?.previewUrl;
  const advance = useCallback(() => {
    setActiveShotId((current) => {
      const index = Math.max(0, completedShots.findIndex((shot) => shot.id === current));
      return completedShots[(index + 1) % completedShots.length]?.id ?? null;
    });
  }, [completedShots]);
  const playback = usePhotoPlayback({
    containerRef: canvasRef,
    frameKey: activeVersion?.outputId ?? "reference",
    ready: completedShots.length > 1 && completedShots.every((shot) => loadedPhotos.has(latestVersion(shot).previewUrl)),
    blocked: busy || generating,
    onAdvance: advance,
  });

  function cycleView(direction: -1 | 1) {
    if (!activeShot) return;
    playback.pause();
    const index = completedShots.findIndex((shot) => shot.id === activeShot.id);
    setActiveShotId(completedShots[(index + direction + completedShots.length) % completedShots.length].id);
  }

  function handleRotationKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target instanceof HTMLElement && event.target.closest("input, select, textarea, [contenteditable='true']")) return;
    if (completedShots.length < 2 || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    cycleView(event.key === "ArrowLeft" ? 1 : -1);
  }

  const studioContent = (
    <section id="studio" className={`home-active-studio studio-main quiet-studio${generationStarted ? " is-gallery" : ""}`} aria-label="Product studio">
      {notice ? (
        <div className="studio-notice" role="status">
          <CheckCircle size={18} /> {notice}
          <button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={16} /></button>
        </div>
      ) : null}
      {error ? (
        <div className="studio-notice error-notice" role="alert">
          <WarningCircle size={18} /> {error}
          <button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button>
        </div>
      ) : null}
      {resumeError || liveError ? (
        <div className="studio-notice error-notice" role="alert">
          <WarningCircle size={18} /> {resumeError ?? liveError}
          <button className="button secondary-button" onClick={() => void reconnectGeneration()}>Reconnect</button>
        </div>
      ) : null}
      {project.turntableUnavailable ? (
        <div className="studio-notice error-notice" role="alert">
          <WarningCircle size={18} /> The phone turntable could not be completed. Available views are shown individually.
        </div>
      ) : null}
      {batch?.jobs.some((job) => job.status === "failed") ? (
        <div className="studio-failed-jobs">
          {batch.jobs.filter((job) => job.status === "failed").map((job) => {
            const shot = project.shots.find((item) => item.id === job.shotId);
            return <div className="studio-notice error-notice" role="alert" key={job.id}>
              <WarningCircle size={18} /><span>{shot?.label ?? "View"}: {job.publicError || "Could not generate this view."}</span>
            </div>;
          })}
        </div>
      ) : null}

      <div className="studio-photo-canvas" ref={canvasRef} role="region" aria-label="Product photos" aria-roledescription="carousel"
        onFocusCapture={playback.onFocusCapture} onBlurCapture={playback.onBlurCapture}
        onKeyDown={handleRotationKey}
      >
        <div className="studio-photo-stage" aria-busy={generating}>
          {completedShots.length ? completedShots.map((shot) => {
            const version = latestVersion(shot);
            return <Image key={version.outputId} unoptimized src={version.previewUrl} fill sizes="(max-width: 720px) 95vw, 640px" loading="eager"
              hidden={shot.id !== activeShot?.id}
              alt={`${project.title}, ${shot.label.toLowerCase()}, version ${version.version}`}
              onLoad={() => setLoadedPhotos((loaded) => loaded.has(version.previewUrl) ? loaded : new Set(loaded).add(version.previewUrl))}
            />;
          }) : canvasImage ? (
            <Image unoptimized src={canvasImage} fill sizes="(max-width: 720px) 95vw, 640px" alt={`${project.title}, reference photo`} />
          ) : (
            <label className="studio-canvas-empty">
              <UploadSimple size={30} weight="light" /><span>Add reference photos</span>
              <input type="file" aria-label="Add reference photos" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadMore} disabled={busy || generating} />
            </label>
          )}
          {generating ? <div className="studio-canvas-status" role="status"><SpinnerGap className="spin" size={18} />
            {batch ? `${batch.completedJobs} of ${batch.jobs.length} views ready` : "Resuming generation…"}
          </div> : null}
        </div>
        <p className="sr-only" aria-live={playback.enabled && completedShots.length > 1 ? "off" : "polite"}>{activeShot && activeVersion ? `${activeShot.label}, version ${activeVersion.version}` : "Reference photo. Generate studio views when your photos are ready."}</p>
      </div>

      {!generationStarted ? <>
        <div className="studio-utility-row">
          <div className="studio-reference-row" role="group" aria-label="Reference photos">
            <div className="studio-reference-thumbnails">
              {readyOriginals.map((asset) => <div className="studio-reference-thumbnail" key={asset.id} title={asset.filename}>
                {asset.previewUrl ? <Image unoptimized src={asset.previewUrl} fill sizes="60px" alt={asset.filename} /> : <ImageSquare size={24} aria-label={asset.filename} />}
              </div>)}
            </div>
            <label className={`studio-add-reference${busy || generating ? " is-disabled" : ""}`}>
              <Plus size={22} weight="light" /><span>Add photos</span>
              <input type="file" aria-label="Add photos" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadMore} disabled={busy || generating} />
            </label>
          </div>
          <div className="studio-generate-actions" aria-live="polite">
            {quote ? (
              <>
                {quote.affordable ? <button className="button primary-button" onClick={() => void confirmBatch()} disabled={busy}>
                  {submitting ? <SpinnerGap className="spin" size={18} /> : null}
                  {submitting ? "Starting…" : `Generate ${quote.shots.length} views · ${quote.totalCredits} credits`}
                </button> : checkoutAvailable ? (
                  onOpenWallet ? <button className="button primary-button" onClick={onOpenWallet}>Add credits</button> : <Link href="/?wallet=open#wallet" className="button primary-button">Add credits</Link>
                ) : <button className="button primary-button" disabled>Generate {quote.shots.length} views · {quote.totalCredits} credits</button>}
              </>
            ) : <button className="button primary-button" onClick={() => void requestQuote()} disabled={quoting || busy || !primary || photosStale}>
              {quoting ? <SpinnerGap className="spin" size={18} /> : null}{quoting ? "Calculating…" : "Check cost"}
            </button>}
          </div>
        </div>
        {quote && !quote.affordable ? <p className="studio-helper-text" role="status">You need {quote.totalCredits - quote.availableCredits} more credits.{!checkoutAvailable ? " Top-ups are unavailable in this workspace." : ""}</p> : null}
        {readyOriginals.length > references.length && primary ? <p className="studio-helper-text">Up to {references.length} photos are used per view. All {readyOriginals.length} stay saved.</p> : null}
      </> : null}
      {generationStarted && !completedShots.length && !generating && !resumeError ? <p className="studio-helper-text" role="status">No views were generated. Start a new shoot to try again.</p> : null}
      {uploading.length ? <div className="inline-upload-progress" role="status" aria-label="Uploading photos">
        {uploading.map((upload, index) => <div key={`${upload.name}-${index}`}>
          <SpinnerGap className="spin" /><span>{upload.name}</span>
          <div className="progress-track"><span style={{ width: `${upload.progress * 100}%` }} /></div>
        </div>)}
      </div> : null}
    </section>
  );

  return (
    <>
      <header className="home-header">
        <div className="home-header-inner studio-topbar">
          <Link href="/projects" className="quiet-back" aria-label="All shoots"><ArrowLeft size={22} /></Link>
          <Link href="/" className="home-brand" aria-label="Reshoot home">reshoot.</Link>
          <h1 className="studio-title" title={project.title}>{project.title}</h1>
          {completedShots.length ? <>
            <div className="studio-rotation-controls" onFocusCapture={playback.onFocusCapture} onBlurCapture={playback.onBlurCapture} onKeyDown={handleRotationKey}>
              <SlideshowControls playing={playback.enabled && completedShots.length > 1} disabled={completedShots.length < 2}
                previousLabel="Rotate left" nextLabel="Rotate right"
                onPrevious={() => cycleView(1)} onNext={() => cycleView(-1)} onTogglePlayback={playback.toggle} />
            </div>
            <button type="button" className="studio-download" onClick={() => void downloadViews()} disabled={exporting}>
              {exporting ? <SpinnerGap className="spin" size={18} /> : null}{exporting ? "Downloading…" : "Download"}
            </button>
          </> : null}
          {walletButton}
        </div>
      </header>
      <main className="home-content">
        {pageError}
        {studioContent}
        {children}
      </main>
    </>
  );
}
