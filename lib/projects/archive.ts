import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { zipSync } from "fflate";
import { db } from "@/lib/db";
import { generationOutputs } from "@/lib/db/schema";
import { renderPhoneTurntable } from "@/lib/generation/phone-turntable";
import { projectArchiveKey, shotDownloadFilename } from "@/lib/projects/downloads";
import { getPhoneTurntable } from "@/lib/projects/phone-turntable";
import { getProjectDetail } from "@/lib/projects/service";
import { getObjectBuffer, headObject, putObject } from "@/lib/storage/r2";

export function isMissingArchive(error: unknown) {
  return error instanceof Error && ["NotFound", "NoSuchKey"].includes(error.name);
}

export async function prepareProjectArchive(ownerId: string, projectId: string) {
  const project = await getProjectDetail(ownerId, projectId);
  if (project.activeBatchId) return null;
  const views = project.shots.flatMap((shot) => {
    const version = shot.versions.at(-1);
    return version ? [{ outputId: version.outputId, filename: shotDownloadFilename({ label: shot.label, ...version }) }] : [];
  });
  if (!views.length) return null;

  const turntable = Boolean(project.registeredPhoneTurntable);
  const key = projectArchiveKey(projectId, turntable);
  // A shoot has one generation batch. Its final view set is immutable.
  try {
    await headObject(key);
    return { turntable };
  } catch (error) {
    if (!isMissingArchive(error)) throw error;
  }

  const files: Record<string, Uint8Array> = {};
  if (turntable) {
    const sources = await getPhoneTurntable(ownerId, projectId);
    if (!sources) throw new Error("The registered turntable is unavailable.");
    const angles = new Map([...sources.values()].map((source) => [source.outputId, source.azimuth]));
    const faces = new Map<number, Promise<Buffer>>();
    const loadFace = (face: number) => {
      const cached = faces.get(face);
      if (cached) return cached;
      const source = sources.get(face);
      if (!source) throw new Error("A registered turntable source is unavailable.");
      const buffer = getObjectBuffer(source.key);
      faces.set(face, buffer);
      return buffer;
    };
    for (const { outputId, filename } of views) {
      const angle = angles.get(outputId);
      if (angle === undefined) throw new Error("A registered turntable view is unavailable.");
      files[filename] = await renderPhoneTurntable(angle, loadFace);
    }
  } else {
    const outputs = await db.select({ id: generationOutputs.id, key: generationOutputs.r2Key })
      .from(generationOutputs)
      .where(and(eq(generationOutputs.ownerId, ownerId), eq(generationOutputs.projectId, projectId),
        inArray(generationOutputs.id, views.map((view) => view.outputId))));
    const keys = new Map(outputs.map((output) => [output.id, output.key]));
    for (const { outputId, filename } of views) {
      const outputKey = keys.get(outputId);
      if (!outputKey) throw new Error("A generated view is unavailable.");
      files[filename] = await getObjectBuffer(outputKey);
    }
  }

  // The image formats are already compressed. Store them directly in the ZIP.
  await putObject({ key, body: zipSync(files, { level: 0 }), mimeType: "application/zip" });
  return { turntable };
}
