"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  ImageSquare,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { projectPath } from "@/lib/projects/routes";

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
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const importStarted = useRef(false);

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

  return (
    <section className="product-main" id="shoots" aria-label="Your shoots">
      <div className="page-heading-row">
        <div>
          <h2>Your shoots</h2>
        </div>
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
        <div className="project-grid">
          {projects.map((project) => (
            <Link
              href={projectPath(project.id)}
              className="project-card"
              key={project.id}
              aria-label={`Open ${project.title}`}
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
                <span className={`status-label status-${project.status}`}>
                  {project.status}
                </span>
              </div>
              <div className="project-card-body">
                <h2>{project.title}</h2>
              </div>
              <OpeningShootStatus />
            </Link>
          ))}
        </div>
      ) : (
        <p className="library-empty-message">Your product photos will be saved here.</p>
      )}

    </section>
  );
}
