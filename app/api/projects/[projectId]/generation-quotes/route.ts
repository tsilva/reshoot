import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import type { GenerationQuote } from "@/lib/api/types";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import {
  assets,
  creditAccounts,
  generationQuotes,
  priceBands,
  priceVersions,
  shots,
  type QuoteShotInput,
} from "@/lib/db/schema";
import { MAX_BATCH_SHOTS } from "@/lib/projects/limits";
import { requireOwnedProject } from "@/lib/projects/service";

type RouteContext = { params: Promise<{ projectId: string }> };

const quoteSchema = z.object({
  shots: z
    .array(
      z.object({
        clientId: z.string().trim().min(1).max(120),
        shotId: z.string().uuid().optional(),
        label: z.string().trim().min(1).max(120),
        presetKey: z.string().trim().max(80).optional(),
        prompt: z.string().trim().max(1200).optional(),
        azimuth: z.number().int().min(0).max(359).optional(),
        elevation: z.number().int().min(-90).max(90).optional(),
        additionalReferenceAssetIds: z.array(z.string().uuid()).max(4).default([]),
      }),
    )
    .min(1)
    .max(MAX_BATCH_SHOTS),
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await resolveCurrentUser();
    const { projectId } = await context.params;
    const project = await requireOwnedProject(user.id, projectId);
    if (!project.primaryAssetId) {
      throw new ApiError(
        409,
        "primary_photo_required",
        "Choose a primary product photo before generating.",
      );
    }

    const parsed = quoteSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_generation_request",
        "Choose between 1 and 10 valid shots.",
      );
    }

    const additionalIds = [
      ...new Set(
        parsed.data.shots.flatMap((shot) => shot.additionalReferenceAssetIds),
      ),
    ];
    if (additionalIds.includes(project.primaryAssetId)) {
      throw new ApiError(
        400,
        "duplicate_primary_reference",
        "The primary photo is included automatically.",
      );
    }
    const assetRows = additionalIds.length
      ? await db
          .select({ id: assets.id })
          .from(assets)
          .where(
            and(
              inArray(assets.id, additionalIds),
              eq(assets.projectId, projectId),
              eq(assets.ownerId, user.id),
              eq(assets.kind, "original"),
              eq(assets.status, "ready"),
            ),
          )
      : [];
    if (assetRows.length !== additionalIds.length) {
      throw new ApiError(
        400,
        "invalid_reference",
        "Every reference must be a ready original from this project.",
      );
    }

    const regenerationIds = parsed.data.shots
      .map((shot) => shot.shotId)
      .filter((id): id is string => Boolean(id));
    if (regenerationIds.length) {
      const ownedShots = await db
        .select({ id: shots.id })
        .from(shots)
        .where(
          and(
            inArray(shots.id, regenerationIds),
            eq(shots.projectId, projectId),
            eq(shots.ownerId, user.id),
          ),
        );
      if (ownedShots.length !== new Set(regenerationIds).size) {
        throw new ApiError(
          400,
          "invalid_shot_version",
          "The requested shot version does not belong to this project.",
        );
      }
    }

    const [version] = await db
      .select()
      .from(priceVersions)
      .where(eq(priceVersions.active, true))
      .limit(1);
    if (!version) throw new Error("Active pricing is not configured.");
    const bands = await db
      .select()
      .from(priceBands)
      .where(eq(priceBands.priceVersionId, version.id));
    const creditsByReferenceCount = new Map(
      bands.map((band) => [band.referenceCount, band.creditsPerShot]),
    );

    const frozenShots: QuoteShotInput[] = parsed.data.shots.map((shot) => ({
      clientId: shot.clientId,
      ...(shot.shotId ? { shotId: shot.shotId } : {}),
      label: shot.label,
      ...(shot.presetKey ? { presetKey: shot.presetKey } : {}),
      ...(shot.prompt ? { prompt: shot.prompt } : {}),
      ...(shot.azimuth !== undefined ? { azimuth: shot.azimuth } : {}),
      ...(shot.elevation !== undefined ? { elevation: shot.elevation } : {}),
      referenceAssetIds: [
        project.primaryAssetId!,
        ...[...new Set(shot.additionalReferenceAssetIds)],
      ],
    }));
    const publicShots = frozenShots.map((shot) => {
      const credits = creditsByReferenceCount.get(shot.referenceAssetIds.length);
      if (!credits) throw new Error("A pricing band is missing.");
      return {
        clientId: shot.clientId,
        referenceCount: shot.referenceAssetIds.length,
        credits,
      };
    });
    const totalCredits = publicShots.reduce((total, shot) => total + shot.credits, 0);
    const [account] = await db
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, user.id))
      .limit(1);
    if (!account) throw new Error("Credit account is not seeded.");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const [quote] = await db
      .insert(generationQuotes)
      .values({
        ownerId: user.id,
        projectId,
        priceVersionId: version.id,
        shots: frozenShots,
        totalCredits,
        expiresAt,
      })
      .returning();

    const response: GenerationQuote = {
      id: quote.id,
      expiresAt: expiresAt.toISOString(),
      totalCredits,
      availableCredits: account.availableCredits,
      affordable: account.availableCredits >= totalCredits,
      shots: publicShots,
    };
    return Response.json({ quote: response }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
