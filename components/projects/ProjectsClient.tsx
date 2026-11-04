"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { ImageSquare, SpinnerGap } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { projectCardId, projectPath } from "@/lib/projects/routes";
import { ProjectGenerationStatus } from "./ProjectGenerationStatus";

function ProjectCardStatus({ project, onFinished }: {
  project: ProjectSummary;
  onFinished(projectId: string): Promise<void>;
}) {
  const refresh = useCallback(() => onFinished(project.id), [onFinished, project.id]);
  return project.status === "generating"
    ? <ProjectGenerationStatus key={project.activeBatchId ?? project.id} id={`generation-${project.id}`} title={project.title} batchId={project.activeBatchId ?? null} onFinished={refresh} />
    : <span className={`status-label status-${project.status}`}>{project.status}</span>;
}

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

function OpeningShootStatus() {
  const { pending } = useLinkStatus();
  return pending ? <span className="home-opening-shoot" role="status"><SpinnerGap className="spin" /> Opening your shoot…</span> : null;
}

export function ProjectsClient({ initialProjects }: { initialProjects: ProjectSummary[] }) {
  const router = useRouter();
  const [projects, setProjects] = useState(initialProjects);
  const importStarted = useRef(false);

  const refreshFinishedProject = useCallback(async (projectId: string) => {
    const { project } = await apiRequest<{ project: ProjectDetail }>(`/api/projects/${projectId}`, { cache: "no-store" });
    setProjects((current) => current.map((item) => item.id === projectId ? project : item));
  }, []);

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
          const latest = await apiRequest<{ projects: ProjectSummary[] }>("/api/projects");
          setProjects(latest.projects);
          router.refresh();
        }
      } catch {
        // Keep the local shoot available for a later import without showing a banner.
      }
    })();
  }, [router]);

  if (!projects.length) return null;

  return (
    <section className="product-main" id="shoots" aria-label="Your shoots">
      <div className="page-heading-row">
        <div>
          <h2>Your shoots</h2>
        </div>
      </div>

      <div className="project-grid">
        {projects.map((project) => (
          <Link
            id={projectCardId(project.id)}
            href={projectPath(project.id)}
            className="project-card"
            key={project.id}
            aria-label={`Open ${project.title}`}
            aria-describedby={project.status === "generating" ? `generation-${project.id}` : undefined}
          >
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
              <ProjectCardStatus project={project} onFinished={refreshFinishedProject} />
            </div>
            <div className="project-card-body">
              <h2>{project.title}</h2>
            </div>
            <OpeningShootStatus />
          </Link>
        ))}
      </div>
    </section>
  );
}
