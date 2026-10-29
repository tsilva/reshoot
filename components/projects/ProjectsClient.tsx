"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Camera,
  CheckCircle,
  CloudSlash,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  SpinnerGap,
  Trash,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import type { ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { uploadProjectFile, validateUploadFile } from "@/lib/client/uploads";
import { Dialog } from "@/components/Dialog";

function subscribeToCameraSupport(onChange: () => void) {
  const pointer = window.matchMedia("(pointer: coarse)");
  pointer.addEventListener("change", onChange);
  return () => pointer.removeEventListener("change", onChange);
}

function supportsCameraCapture() {
  return "capture" in HTMLInputElement.prototype &&
    (navigator.maxTouchPoints > 0 || window.matchMedia("(pointer: coarse)").matches);
}

function noCameraOnServer() { return false; }

type PendingUpload = {
  file: File;
  progress: number;
  status: "queued" | "uploading" | "ready" | "failed";
  error?: string;
};

type LegacyShoot = {
  version?: number;
  original?: string;
  originalName?: string;
  shots?: Array<{
    angle?: { label?: string; azimuth?: number; elevation?: number };
    imageUrl?: string;
    status?: string;
  }>;
};

async function readLegacyShoot(): Promise<LegacyShoot | null> {
  if (!("indexedDB" in window)) return null;
  if ("databases" in indexedDB) {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === "reshoot-studio")) return null;
  }
  return new Promise((resolve) => {
    const request = indexedDB.open("reshoot-studio", 1);
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("shoots")) {
        database.close();
        resolve(null);
        return;
      }
      const transaction = database.transaction("shoots", "readonly");
      const getRequest = transaction.objectStore("shoots").get("active");
      getRequest.onsuccess = () => resolve((getRequest.result as LegacyShoot | undefined) ?? null);
      getRequest.onerror = () => resolve(null);
      transaction.oncomplete = () => database.close();
    };
  });
}

export function ProjectsClient({
  initialProjects,
  onOpenProject,
  createOpen,
  onCreateClose,
}: {
  initialProjects: ProjectSummary[];
  onOpenProject?: (projectId: string) => Promise<void>;
  createOpen?: boolean;
  onCreateClose?: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const [search, setSearch] = useState("");
  const [internalModalOpen, setInternalModalOpen] = useState(false);
  const modalOpen = createOpen || internalModalOpen;
  function setModalOpen(open: boolean) {
    setInternalModalOpen(open);
    if (!open) onCreateClose?.();
  }
  async function openProject(projectId: string) {
    if (onOpenProject) await onOpenProject(projectId);
    else router.push(`/projects/${projectId}`);
  }
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdProject, setCreatedProject] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const importStarted = useRef(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const cameraAvailable = useSyncExternalStore(subscribeToCameraSupport, supportsCameraCapture, noCameraOnServer);

  useEffect(() => {
    if (importStarted.current) return;
    importStarted.current = true;
    void (async () => {
      try {
        const status = await apiRequest<{ completed: boolean }>("/api/projects/import-legacy");
        if (status.completed) return;
        const legacy = await readLegacyShoot();
        const usableShots = (legacy?.shots ?? []).filter(
          (shot) => typeof shot.imageUrl === "string" && shot.imageUrl.startsWith("data:image/"),
        );
        const response = await apiRequest<{ projectId: string | null }>("/api/projects/import-legacy", {
          method: "POST",
          body: JSON.stringify({
            title: "Imported shoot",
            original:
              legacy?.original && legacy.original.startsWith("data:image/")
                ? { filename: legacy.originalName || "original-product-photo", dataUrl: legacy.original }
                : null,
            shots: usableShots.map((shot, index) => ({
              label: shot.angle?.label || `Imported shot ${index + 1}`,
              azimuth: shot.angle?.azimuth,
              elevation: shot.angle?.elevation,
              dataUrl: shot.imageUrl,
              approved: shot.status === "approved",
            })),
          }),
        });
        indexedDB.deleteDatabase("reshoot-studio");
        if (response.projectId) {
          setImportNotice("Your previous saved shoot was imported as a project.");
          const latest = await apiRequest<{ projects: ProjectSummary[] }>("/api/projects");
          setProjects(latest.projects);
          router.refresh();
        }
      } catch (legacyError) {
        setImportNotice(
          legacyError instanceof Error
            ? `Your previous local shoot is still safe, but could not be imported yet: ${legacyError.message}`
            : "Your previous local shoot could not be imported yet.",
        );
      }
    })();
  }, [router]);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? projects.filter((project) => project.title.toLowerCase().includes(query))
      : projects;
  }, [projects, search]);

  function resetModal() {
    if (submitting) return;
    setModalOpen(false);
    setUploads([]);
    setError(null);
    setCreatedProject(null);
    setOffline(false);
  }

  function selectFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setError(null);
    if (uploads.length + files.length > 25) {
      setError("A project can contain up to 25 original photos.");
      return;
    }
    const invalid = files.find(validateUploadFile);
    if (invalid) {
      setError(validateUploadFile(invalid));
      return;
    }
    const total = [...uploads.map((item) => item.file), ...files].reduce(
      (sum, file) => sum + file.size,
      0,
    );
    if (total > 500 * 1024 * 1024) {
      setError("Keep the project under 500 MB total.");
      return;
    }
    setUploads((current) => [
      ...current,
      ...files.map((file) => ({ file, progress: 0, status: "queued" as const })),
    ]);
    event.target.value = "";
  }

  function updateUpload(index: number, patch: Partial<PendingUpload>) {
    setUploads((current) =>
      current.map((upload, currentIndex) =>
        currentIndex === index ? { ...upload, ...patch } : upload,
      ),
    );
  }

  async function createProject() {
    if (!uploads.length) {
      setError("Add a product photo to start your shoot.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setOffline(false);
    try {
      const created = createdProject ?? (await apiRequest<{ project: ProjectSummary }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({}),
      })).project;
      if (!createdProject) {
        setCreatedProject(created);
        setProjects((current) => [created, ...current]);
      }
      let failures = 0;
      for (let index = 0; index < uploads.length; index += 1) {
        const upload = uploads[index];
        if (upload.status === "ready") continue;
        updateUpload(index, { status: "uploading", error: undefined });
        try {
          await uploadProjectFile({
            projectId: created.id,
            file: upload.file,
            onProgress: (progress) => updateUpload(index, { progress }),
          });
          updateUpload(index, { status: "ready", progress: 1 });
        } catch (uploadError) {
          failures += 1;
          updateUpload(index, {
            status: "failed",
            error:
              uploadError instanceof Error ? uploadError.message : "Upload failed.",
          });
        }
      }
      // Refresh both the automatic title and saved-photo counts, also on retry.
      try {
        const latest = await apiRequest<{ projects: ProjectSummary[] }>("/api/projects");
        setProjects(latest.projects);
      } catch {
        // An offline library refresh must not hide upload recovery controls.
      }
      if (failures) {
        setError(`${failures} photo${failures === 1 ? "" : "s"} could not be uploaded. Your project and successful uploads are saved. Retry the failed photos or continue to the project.`);
        setOffline(!navigator.onLine);
        return;
      }
      await openProject(created.id);
      setModalOpen(false);
      setUploads([]);
      setCreatedProject(null);
      router.refresh();
    } catch (requestError) {
      if (!navigator.onLine) setOffline(true);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The project could not be created.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProject(project: ProjectSummary) {
    if (!window.confirm(`Move “${project.title}” to deleted projects?`)) return;
    try {
      await apiRequest(`/api/projects/${project.id}`, { method: "DELETE" });
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete project.");
    }
  }

  return (
    <section className="product-main" id="shoots" aria-label="Your shoots">
      <div className="page-heading-row">
        <div>
          <h2>Your shoots</h2>
        </div>
        {projects.length ? <button className="button primary-button" onClick={() => setModalOpen(true)}>
          <Plus size={18} weight="bold" /> New project
        </button> : null}
      </div>

      {importNotice ? (
        <div className="inline-notice legacy-import-notice" role="status">
          <CheckCircle size={20} /> {importNotice}
          <button className="icon-button" onClick={() => setImportNotice(null)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ) : null}

      {projects.length ? (
        <>
          <div className="library-toolbar">
            <label className="search-field">
              <MagnifyingGlass size={18} />
              <span className="sr-only">Search projects</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search projects"
              />
            </label>
            <span>{projects.length} product project{projects.length === 1 ? "" : "s"}</span>
          </div>
          {visibleProjects.length ? (
            <div className="project-grid">
              {visibleProjects.map((project) => (
                <article className="project-card" key={project.id}>
                  <Link href={`/projects/${project.id}`} className="project-image-link" onClick={onOpenProject ? (event) => { event.preventDefault(); void openProject(project.id).catch(() => {}); } : undefined}>
                    <div className="project-image-frame">
                      {project.primaryPreviewUrl ? (
                        <Image
                          unoptimized
                          src={project.primaryPreviewUrl}
                          fill
                          sizes="(max-width: 720px) 100vw, 33vw"
                          alt=""
                        />
                      ) : (
                        <ImageSquare size={36} weight="thin" />
                      )}
                      <span className={`status-label status-${project.status}`}>
                        {project.status}
                      </span>
                    </div>
                  </Link>
                  <div className="project-card-body">
                    <div>
                      <h2>{project.title}</h2>
                      <p>
                        {project.originalCount} original{project.originalCount === 1 ? "" : "s"}
                        <span aria-hidden="true"> · </span>
                        {project.generatedCount} generated
                      </p>
                    </div>
                    <div className="project-card-actions">
                      <Link href={`/projects/${project.id}`} aria-label={`Open ${project.title}`} onClick={onOpenProject ? (event) => { event.preventDefault(); void openProject(project.id).catch(() => {}); } : undefined}>
                        <ArrowRight size={20} />
                      </Link>
                      <button
                        className="icon-button"
                        onClick={() => void deleteProject(project)}
                        aria-label={`Delete ${project.title}`}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="compact-empty">No projects match “{search}”.</div>
          )}
        </>
      ) : (
        <p className="library-empty-message">Your product photos will be saved here.</p>
      )}

      {error && !modalOpen ? (
        <div className="inline-notice error-notice" role="alert">
          <WarningCircle size={20} /> {error}
        </div>
      ) : null}

      {modalOpen ? (
        <Dialog labelledBy="new-project-title" busy={submitting} onClose={resetModal}>
          <section className="project-modal">
            <header className="modal-header">
              <div>
                <div className="page-kicker">New product project</div>
                <h2 id="new-project-title">Start with every photo you have</h2>
              </div>
              <button className="icon-button" onClick={resetModal} aria-label="Close" disabled={submitting}>
                <X size={20} />
              </button>
            </header>
            <div className="modal-content">
              <p className="upload-name-hint">We’ll name your shoot from your first product photo.</p>
              <label className="upload-dropzone">
                <UploadSimple size={28} weight="thin" />
                <strong>Add product photos</strong>
                <span>JPG, PNG or WebP · up to 25 files · 20 MB each</span>
                <input
                  type="file"
                  data-autofocus
                  aria-label="Choose product photos"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={selectFiles}
                  disabled={submitting}
                />
              </label>
              {cameraAvailable ? (
                <div className="camera-upload-option">
                  <button type="button" className="button secondary-button" disabled={submitting} onClick={() => cameraInput.current?.click()}>
                    <Camera size={20} aria-hidden="true" /> Take a photo
                  </button>
                  <input ref={cameraInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={selectFiles} disabled={submitting} />
                </div>
              ) : null}
              {uploads.length ? (
                <div className="upload-list">
                  {uploads.map((upload, index) => (
                    <div className={`upload-row upload-${upload.status}`} key={`${upload.file.name}-${index}`}>
                      <ImageSquare size={20} />
                      <div>
                        <strong>{upload.file.name}</strong>
                        <span>{(upload.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        <div className="progress-track">
                          <span style={{ width: `${upload.progress * 100}%` }} />
                        </div>
                        {upload.error ? <small>{upload.error}</small> : null}
                      </div>
                      {upload.status === "uploading" ? <SpinnerGap className="spin" /> : null}
                      {!submitting ? (
                        <button
                          className="icon-button"
                          onClick={() => setUploads((current) => current.filter((_, i) => i !== index))}
                          aria-label={`Remove ${upload.file.name}`}
                        >
                          <X size={16} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {offline ? (
                <div className="inline-notice warning-notice" role="alert">
                  <CloudSlash size={20} /> You’re offline. Reconnect and retry; your selected files are still here.
                </div>
              ) : null}
              {error ? (
                <div className="inline-notice error-notice" role="alert">
                  <WarningCircle size={20} /> {error}
                </div>
              ) : null}
            </div>
            <footer className="modal-footer">
              <span>{uploads.length}/25 photos · max 500 MB</span>
              {createdProject ? (
                <button className="button secondary-button" disabled={submitting} onClick={() => {
                  void openProject(createdProject.id).catch(() => {});
                  router.refresh();
                  resetModal();
                }}>
                  Continue to project
                </button>
              ) : null}
              <button className="button primary-button" onClick={() => void createProject()} disabled={submitting || !uploads.length}>
                {submitting ? <SpinnerGap className="spin" size={18} /> : null}
                {submitting ? "Saving photos…" : createdProject ? "Retry failed uploads" : "Create project"}
              </button>
            </footer>
          </section>
        </Dialog>
      ) : null}
    </section>
  );
}
