import { apiErrorResponse } from "@/lib/api/errors";
import { reconcileGenerationOutbox } from "@/lib/generation/batches";
import { reconcilePricing } from "@/lib/pricing/reconcile";
import { cleanupExpiredProjectObjects } from "@/lib/projects/cleanup";

export const maxDuration = 300;

function authorized(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json(
      { error: { code: "not_found", message: "Not found." } },
      { status: 404 },
    );
  }
  try {
    const [outbox, pricing, cleanup] = await Promise.all([
      reconcileGenerationOutbox(),
      reconcilePricing(),
      cleanupExpiredProjectObjects(),
    ]);
    return Response.json({ ok: true, outbox, pricing, cleanup });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
