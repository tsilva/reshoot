"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ClockCounterClockwise,
  DownloadSimple,
  ImageSquare,
  Plus,
  SealCheck,
  SpinnerGap,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { zipSync } from "fflate";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type {
  GenerationBatchStatus,
  GenerationQuote,
  ProjectDetail,
  ProjectShot,
} from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { uploadProjectFile, validateUploadFile } from "@/lib/client/uploads";

type StudioTab = "photos" | "create" | "review";
type ShotRequest = {
  clientId: string;
  shotId?: string;
  label: string;
  presetKey?: string;
  prompt?: string;
  azimuth?: number;
  elevation?: number;
  additionalReferenceAssetIds: string[];
};

const PRESETS = [
  { id: "front", label: "Front", azimuth: 0, elevation: 0, image: "/assets/angle-guides/front.jpg" },
  {
    id: "front-three-quarter",
    label: "3/4 right",
    azimuth: 45,
    elevation: 4,
    image: "/assets/angle-guides/front-three-quarter.jpg",
  },
  {
    id: "right-profile",
    label: "Right profile",
    azimuth: 90,
    elevation: 0,
    image: "/assets/angle-guides/right-profile.jpg",
  },
  { id: "back", label: "Back", azimuth: 180, elevation: 0, image: "/assets/angle-guides/back.jpg" },
];

function batchIsTerminal(status: GenerationBatchStatus["status"]) {
  return ["partial", "succeeded", "failed"].includes(status);
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function ProjectStudioClient({ initialProject }: { initialProject: ProjectDetail }) {
  const router = useRouter();
  const [project, setProject] = useState(initialProject);
  const [tab, setTab] = useState<StudioTab>("photos");
  const [additionalReferences, setAdditionalReferences] = useState<string[]>([]);
  const [selectedPresets, setSelectedPresets] = useState<string[]>(PRESETS.map((preset) => preset.id));
  const [quote, setQuote] = useState<GenerationQuote | null>(null);
  const [quotedRequests, setQuotedRequests] = useState<ShotRequest[]>([]);
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [batch, setBatch] = useState<GenerationBatchStatus | null>(null);
  const [uploading, setUploading] = useState<Array<{ name: string; progress: number }>>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<number | null>(null);

  const primary = project.assets.find((asset) => asset.isPrimary && asset.status === "ready");
  const readyOriginals = project.assets.filter(
    (asset) => asset.kind === "original" && asset.status === "ready",
  );
  const referenceCount = primary ? 1 + additionalReferences.length : 0;

  useEffect(() => {
    if (!initialProject.activeBatchId) return;
    let active = true;
    void apiRequest<{ batch: GenerationBatchStatus }>(
      `/api/generation-batches/${initialProject.activeBatchId}`,
    )
      .then((response) => {
        if (!active) return;
        setBatch(response.batch);
        setTab("review");
        setNotice("Your active generation resumed from its saved workflow.");
      })
      .catch((resumeError) => {
        if (active) {
          setError(
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
  }, [project.id]);

  useEffect(() => {
    if (!batch || batchIsTerminal(batch.status)) return;
    let active = true;
    async function poll() {
      try {
        const response = await apiRequest<{ batch: GenerationBatchStatus }>(
          `/api/generation-batches/${batch!.id}`,
        );
        if (!active) return;
        setBatch(response.batch);
        if (batchIsTerminal(response.batch.status)) {
          await refreshProject();
          router.refresh();
          return;
        }
      } catch (pollError) {
        if (active) setError(pollError instanceof Error ? pollError.message : "Could not refresh generation.");
      }
      if (active) {
        pollingRef.current = window.setTimeout(poll, document.hidden ? 5000 : 2000);
      }
    }
    pollingRef.current = window.setTimeout(poll, document.hidden ? 5000 : 2000);
    return () => {
      active = false;
      if (pollingRef.current) window.clearTimeout(pollingRef.current);
    };
  }, [batch, refreshProject, router]);

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
    setUploading([]);
    await refreshProject();
  }

  async function choosePrimary(assetId: string) {
    try {
      const response = await apiRequest<{ project: ProjectDetail }>(
        `/api/projects/${project.id}`,
        { method: "PATCH", body: JSON.stringify({ primaryAssetId: assetId }) },
      );
      setProject(response.project);
      setAdditionalReferences((current) => current.filter((id) => id !== assetId));
      setQuote(null);
      setNotice("Primary photo updated.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the primary photo.");
    }
  }

  function toggleReference(assetId: string) {
    setQuote(null);
    setAdditionalReferences((current) => {
      if (current.includes(assetId)) return current.filter((id) => id !== assetId);
      if (current.length >= 4) {
        setNotice("Choose up to four additional references.");
        return current;
      }
      return [...current, assetId];
    });
  }

  function currentShotRequests(): ShotRequest[] {
    return PRESETS.filter((preset) => selectedPresets.includes(preset.id)).map((preset) => ({
      clientId: preset.id,
      label: preset.label,
      presetKey: preset.id,
      azimuth: preset.azimuth,
      elevation: preset.elevation,
      additionalReferenceAssetIds: additionalReferences,
    }));
  }

  async function requestQuote(requests = currentShotRequests()) {
    if (!primary) {
      setError("Choose a primary photo before creating shots.");
      setTab("photos");
      return;
    }
    if (!requests.length) {
      setError("Choose at least one shot.");
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      const response = await apiRequest<{ quote: GenerationQuote }>(
        `/api/projects/${project.id}/generation-quotes`,
        { method: "POST", body: JSON.stringify({ shots: requests }) },
      );
      setQuotedRequests(requests);
      setQuote(response.quote);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : "Could not create a quote.");
    } finally {
      setQuoting(false);
    }
  }

  async function confirmBatch() {
    if (!quote) return;
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<{ batchId: string }>(
        `/api/projects/${project.id}/generation-batches`,
        {
          method: "POST",
          body: JSON.stringify({ quoteId: quote.id, idempotencyKey: crypto.randomUUID() }),
        },
      );
      const response = await apiRequest<{ batch: GenerationBatchStatus }>(
        `/api/generation-batches/${created.batchId}`,
      );
      setBatch(response.batch);
      setQuote(null);
      setTab("review");
      setNotice("Generation is running. You can close this page and come back later.");
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : "Could not start generation.");
    } finally {
      setSubmitting(false);
    }
  }

  async function prepareRegeneration(shot: ProjectShot) {
    const latest = shot.versions.at(-1);
    const requests: ShotRequest[] = [
      {
        clientId: `${shot.id}-v${(latest?.version ?? 0) + 1}`,
        shotId: shot.id,
        label: shot.label,
        presetKey: shot.presetKey ?? undefined,
        azimuth: shot.azimuth ?? undefined,
        elevation: shot.elevation ?? undefined,
        prompt: "Improve fidelity while preserving the requested shot.",
        additionalReferenceAssetIds: additionalReferences,
      },
    ];
    setTab("create");
    await requestQuote(requests);
  }

  async function reviewOutput(outputId: string, approved: boolean) {
    try {
      await apiRequest(`/api/projects/${project.id}/outputs/${outputId}`, {
        method: "PATCH",
        body: JSON.stringify({ approved, selected: approved }),
      });
      await refreshProject();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not save the review.");
    }
  }

  async function exportApproved() {
    const files: Record<string, Uint8Array> = {};
    for (const shot of project.shots) {
      for (const version of shot.versions.filter((item) => item.approvedAt || item.selectedAt)) {
        const response = await fetch(version.downloadUrl);
        if (!response.ok) continue;
        files[`${slugify(shot.label)}-v${version.version}.png`] = new Uint8Array(
          await response.arrayBuffer(),
        );
      }
    }
    if (!Object.keys(files).length) {
      setNotice("Approve or select at least one result before exporting.");
      return;
    }
    const archive = zipSync(files, { level: 6 });
    const url = URL.createObjectURL(new Blob([new Uint8Array(archive)], { type: "application/zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${slugify(project.title)}-reshoot.zip`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const versionCount = useMemo(
    () => project.shots.reduce((sum, shot) => sum + shot.versions.length, 0),
    [project.shots],
  );

  return (
    <main className="studio-main">
      <header className="studio-project-header">
        <Link href="/projects" className="back-link">
          <ArrowLeft size={18} /> Projects
        </Link>
        <div>
          <div className="page-kicker">Product project</div>
          <h1>{project.title}</h1>
        </div>
        <div className="studio-summary">
          <span>{project.originalCount} originals</span>
          <span>{versionCount} versions</span>
        </div>
      </header>

      <nav className="studio-tabs" aria-label="Project studio">
        {([
          ["photos", "Photos"],
          ["create", "Create"],
          ["review", "Review / History"],
        ] as Array<[StudioTab, string]>).map(([value, label]) => (
          <button
            key={value}
            className={tab === value ? "is-active" : ""}
            onClick={() => setTab(value)}
            aria-current={tab === value ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>

      {notice ? (
        <div className="studio-notice" role="status">
          <CheckCircle size={18} /> {notice}
          <button className="icon-button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="studio-notice error-notice" role="alert">
          <WarningCircle size={18} /> {error}
          <button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {tab === "photos" ? (
        <section className="studio-photos-panel">
          <div className="section-heading-row">
            <div>
              <div className="page-kicker">Identity references</div>
              <h2>Your original photos</h2>
              <p>Set one primary identity anchor, then choose up to four supporting views.</p>
            </div>
            <label className="button secondary-button upload-button">
              <UploadSimple size={18} /> Add photos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={uploadMore}
              />
            </label>
          </div>
          {uploading.length ? (
            <div className="inline-upload-progress">
              {uploading.map((upload) => (
                <div key={upload.name}>
                  <SpinnerGap className="spin" />
                  <span>{upload.name}</span>
                  <div className="progress-track"><span style={{ width: `${upload.progress * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : null}
          {readyOriginals.length ? (
            <div className="photo-contact-sheet">
              {readyOriginals.map((asset, index) => {
                const selected = additionalReferences.includes(asset.id);
                return (
                  <article
                    className={`photo-slide${asset.isPrimary ? " is-primary" : ""}${selected ? " is-reference" : ""}`}
                    key={asset.id}
                  >
                    <div className="photo-slide-image">
                      {asset.previewUrl ? (
                        <Image unoptimized src={asset.previewUrl} fill sizes="(max-width: 720px) 50vw, 25vw" alt="" />
                      ) : (
                        <ImageSquare size={30} />
                      )}
                      <span className="slide-number">{String(index + 1).padStart(2, "0")}</span>
                      {asset.isPrimary ? <span className="primary-badge"><SealCheck size={15} /> Primary</span> : null}
                    </div>
                    <div className="photo-slide-footer">
                      <span>{asset.filename}</span>
                      {!asset.isPrimary ? (
                        <div>
                          <button className="text-button" onClick={() => void choosePrimary(asset.id)}>Make primary</button>
                          <button
                            className={`reference-toggle${selected ? " is-active" : ""}`}
                            onClick={() => toggleReference(asset.id)}
                          >
                            {selected ? <Check size={14} weight="bold" /> : <Plus size={14} />}
                            Reference
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <label className="large-photo-empty">
              <UploadSimple size={36} weight="thin" />
              <h2>Upload a primary product photo</h2>
              <p>Generation unlocks once one verified original is ready.</p>
              <span className="button primary-button">Choose photos</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadMore} />
            </label>
          )}
          <div className="sticky-studio-action">
            <span>
              {primary ? `${referenceCount} reference${referenceCount === 1 ? "" : "s"} selected` : "Primary photo required"}
            </span>
            <button className="button primary-button" disabled={!primary} onClick={() => setTab("create")}>
              Choose shots <ArrowRight size={18} />
            </button>
          </div>
        </section>
      ) : null}

      {tab === "create" ? (
        <section className="create-layout">
          <aside className="darkroom-panel">
            <div className="page-kicker">Studio toolset</div>
            <h2>Create a shot list</h2>
            <p>
              High-quality square output. Your {referenceCount || "—"} selected reference
              {referenceCount === 1 ? "" : "s"} will be frozen into every version.
            </p>
            <div className="reference-mini-strip">
              {[primary, ...readyOriginals.filter((asset) => additionalReferences.includes(asset.id))]
                .filter(Boolean)
                .map((asset) => (
                  <div key={asset!.id}>
                    {asset!.previewUrl ? (
                      <Image unoptimized src={asset!.previewUrl} fill sizes="52px" alt="" />
                    ) : null}
                  </div>
                ))}
            </div>
            <dl className="studio-specs">
              <div><dt>Output</dt><dd>1024 × 1024</dd></div>
              <div><dt>Quality</dt><dd>High</dd></div>
              <div><dt>Versions</dt><dd>Immutable</dd></div>
            </dl>
            <button className="text-button light-text-button" onClick={() => setTab("photos")}>Change references</button>
          </aside>
          <div className="create-canvas">
            <div className="section-heading-row">
              <div>
                <div className="page-kicker">Shot presets</div>
                <h2>Choose up to 10 shots</h2>
              </div>
              <span>{selectedPresets.length} selected</span>
            </div>
            <div className="preset-grid">
              {PRESETS.map((preset) => {
                const selected = selectedPresets.includes(preset.id);
                return (
                  <button
                    className={`preset-card${selected ? " is-selected" : ""}`}
                    key={preset.id}
                    onClick={() => {
                      setQuote(null);
                      setSelectedPresets((current) =>
                        current.includes(preset.id)
                          ? current.filter((id) => id !== preset.id)
                          : [...current, preset.id],
                      );
                    }}
                  >
                    <span className="preset-image"><Image src={preset.image} fill sizes="220px" alt="" /></span>
                    <span>{preset.label}</span>
                    <span className="selection-mark">{selected ? <Check size={15} weight="bold" /> : <Plus size={15} />}</span>
                  </button>
                );
              })}
            </div>
            {!quote ? (
              <div className="quote-placeholder">
                <div>
                  <div className="page-kicker">Exact quote</div>
                  <h3>Review the cost before anything runs</h3>
                  <p>Pricing changes with the number of references used for each shot.</p>
                </div>
                <button className="button primary-button" onClick={() => void requestQuote()} disabled={quoting || !primary}>
                  {quoting ? <SpinnerGap className="spin" /> : null}
                  {quoting ? "Calculating…" : "Review quote"}
                </button>
              </div>
            ) : (
              <div className="generation-quote-card">
                <header>
                  <div>
                    <div className="page-kicker">15-minute quote</div>
                    <h3>{quotedRequests.length} paid version{quotedRequests.length === 1 ? "" : "s"}</h3>
                  </div>
                  <strong>{quote.totalCredits} credits</strong>
                </header>
                <div className="quote-lines">
                  {quote.shots.map((shot) => (
                    <div key={shot.clientId}>
                      <span>{shot.referenceCount} reference{shot.referenceCount === 1 ? "" : "s"}</span>
                      <span>{shot.credits} credits</span>
                    </div>
                  ))}
                </div>
                <footer>
                  <div>
                    <span>Available after hold</span>
                    <strong>{quote.availableCredits - quote.totalCredits} credits</strong>
                  </div>
                  {quote.affordable ? (
                    <button className="button primary-button" onClick={() => void confirmBatch()} disabled={submitting}>
                      {submitting ? <SpinnerGap className="spin" /> : null}
                      Confirm generation
                    </button>
                  ) : (
                    <Link href="/account" className="button primary-button">Add credits</Link>
                  )}
                </footer>
                {!quote.affordable ? (
                  <div className="inline-notice warning-notice">
                    <WarningCircle size={18} /> You need {quote.totalCredits - quote.availableCredits} more credits.
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      ) : null}

      {tab === "review" ? (
        <section className="review-panel">
          <div className="section-heading-row">
            <div>
              <div className="page-kicker">Immutable versions</div>
              <h2>Review & history</h2>
              <p>Regeneration creates a new paid version and never overwrites the old one.</p>
            </div>
            <button className="button secondary-button" onClick={() => void exportApproved()}>
              <DownloadSimple size={18} /> Export approved ZIP
            </button>
          </div>

          {batch ? (
            <div className={`batch-progress batch-${batch.status}`}>
              <div>
                {batchIsTerminal(batch.status) ? <CheckCircle size={24} /> : <SpinnerGap className="spin" size={24} />}
                <div>
                  <strong>Batch {batch.status}</strong>
                  <span>{batch.completedJobs} ready · {batch.failedJobs} failed · {batch.jobs.length} total</span>
                </div>
              </div>
              <div className="progress-track">
                <span style={{ width: `${((batch.completedJobs + batch.failedJobs) / batch.jobs.length) * 100}%` }} />
              </div>
              <p>You can safely navigate away. This batch continues in the background.</p>
            </div>
          ) : null}

          {batch?.jobs.some((job) => job.status !== "succeeded") ? (
            <div className="job-status-list">
              {batch.jobs.map((job) => (
                <div key={job.id}>
                  {job.status === "succeeded" ? <CheckCircle size={18} /> : job.status === "failed" ? <WarningCircle size={18} /> : <SpinnerGap className="spin" size={18} />}
                  <span>Version {job.version}</span>
                  <strong>{job.status}</strong>
                  {job.publicError ? <small>{job.publicError}</small> : null}
                </div>
              ))}
            </div>
          ) : null}

          {project.shots.length ? (
            <div className="history-list">
              {project.shots.map((shot) => (
                <article className="history-shot" key={shot.id}>
                  <header>
                    <div>
                      <h3>{shot.label}</h3>
                      <span>{shot.versions.length} immutable version{shot.versions.length === 1 ? "" : "s"}</span>
                    </div>
                    <button className="button secondary-button compact-button" onClick={() => void prepareRegeneration(shot)}>
                      <ClockCounterClockwise size={17} /> Regenerate
                    </button>
                  </header>
                  <div className="version-strip">
                    {shot.versions.map((version) => (
                      <div className="version-card" key={version.outputId}>
                        <div className="version-image">
                          <Image unoptimized src={version.previewUrl} fill sizes="(max-width: 720px) 75vw, 280px" alt="" />
                          <span>v{version.version}</span>
                          {version.approvedAt ? <span className="approved-badge"><Check size={14} /> Approved</span> : null}
                        </div>
                        <div className="version-actions">
                          <button
                            className={version.approvedAt ? "text-button" : "button primary-button compact-button"}
                            onClick={() => void reviewOutput(version.outputId, !version.approvedAt)}
                          >
                            {version.approvedAt ? "Undo approval" : "Approve & select"}
                          </button>
                          <a href={version.downloadUrl} download className="icon-button" aria-label={`Download ${shot.label} version ${version.version}`}>
                            <DownloadSimple size={18} />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : batch ? null : (
            <div className="review-empty">
              <ImageSquare size={38} weight="thin" />
              <h3>No generated versions yet</h3>
              <p>Choose shot presets and review the exact credit quote to begin.</p>
              <button className="button primary-button" onClick={() => setTab("create")}>Create shots</button>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
