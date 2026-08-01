import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { priceBands, priceVersions } from "@/lib/db/schema";
import {
  protectedCreditsForReferences,
  protectedCreditsFromRealizedCost,
} from "@/lib/pricing/calculator";

type RealizedBand = {
  reference_count: number;
  total_cost_micros: string;
  successful_outputs: number;
};

export async function reconcilePricing() {
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
  const realizedResult = await db.execute(sql<RealizedBand>`
    select
      j.reference_count,
      coalesce(sum(a.usage_cost_micros), 0)::bigint as total_cost_micros,
      count(distinct o.id)::int as successful_outputs
    from generation_attempts a
    join generation_jobs j on j.id = a.job_id
    left join generation_outputs o on o.job_id = j.id
    where a.created_at >= now() - interval '30 days'
      and a.usage_cost_micros is not null
    group by j.reference_count
  `);
  const realized = (realizedResult as unknown as { rows: RealizedBand[] }).rows;
  const realizedByReferences = new Map(
    realized.map((row) => [row.reference_count, row]),
  );
  const currentByReferences = new Map(
    bands.map((band) => [band.referenceCount, band.creditsPerShot]),
  );
  const input = {
    outputCostMicros: version.outputCostMicros,
    textAllowanceMicros: version.textAllowanceMicros,
    referenceAllowanceMicros: version.referenceAllowanceMicros,
    providerFundingBps: version.providerFundingBps,
    failureReserveBps: version.failureReserveBps,
    grossMarginBps: version.grossMarginBps,
    creditsPerUsd: version.creditsPerUsd,
  };
  const nextBands = Array.from({ length: 5 }, (_, index) => {
    const referenceCount = index + 1;
    const current = currentByReferences.get(referenceCount);
    if (!current) throw new Error("An active pricing band is missing.");
    const modelProtected = protectedCreditsForReferences(input, referenceCount);
    const rolling = realizedByReferences.get(referenceCount);
    const realizedProtected =
      rolling && rolling.successful_outputs > 0
        ? protectedCreditsFromRealizedCost(
            Number(rolling.total_cost_micros) / rolling.successful_outputs,
            input,
          )
        : 0;
    return {
      referenceCount,
      creditsPerShot: Math.max(current, modelProtected, realizedProtected),
    };
  });
  if (
    nextBands.every(
      (band) => band.creditsPerShot === currentByReferences.get(band.referenceCount),
    )
  ) {
    return { changed: false, versionId: version.id, bands: nextBands };
  }

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from ${priceVersions} where ${priceVersions.id} = ${version.id}::uuid for update`,
    );
    const [stillActive] = await tx
      .select({ id: priceVersions.id })
      .from(priceVersions)
      .where(and(eq(priceVersions.id, version.id), eq(priceVersions.active, true)))
      .limit(1);
    if (!stillActive) return { changed: false, versionId: version.id, bands: nextBands };
    const now = new Date();
    await tx
      .update(priceVersions)
      .set({ active: false, retiredAt: now, updatedAt: now })
      .where(eq(priceVersions.id, version.id));
    const [created] = await tx
      .insert(priceVersions)
      .values({
        label: `auto-${now.toISOString()}`,
        outputCostMicros: version.outputCostMicros,
        textAllowanceMicros: version.textAllowanceMicros,
        referenceAllowanceMicros: version.referenceAllowanceMicros,
        providerFundingBps: version.providerFundingBps,
        failureReserveBps: version.failureReserveBps,
        grossMarginBps: version.grossMarginBps,
        creditsPerUsd: version.creditsPerUsd,
        active: true,
        activatedAt: now,
      })
      .returning({ id: priceVersions.id });
    await tx.insert(priceBands).values(
      nextBands.map((band) => ({ ...band, priceVersionId: created.id })),
    );
    return { changed: true, versionId: created.id, bands: nextBands };
  });
}
