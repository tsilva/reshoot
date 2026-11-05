import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { projectProviderCosts, reconcileProviderCosts } from "@/lib/generation/provider-calls";

export const maxDuration = 180;

function authorized(request: Request) {
  // Financial telemetry is operator-only, including on local previews.
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function handle(request: Request, reconcile: boolean) {
  if (!authorized(request)) return Response.json({ error: { code: "not_found", message: "Not found." } }, { status: 404 });
  try {
    const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("projectId"));
    if (!parsed.success) throw new ApiError(400, "invalid_project", "A project ID is required.");
    const reconciliation = reconcile ? await reconcileProviderCosts(parsed.data) : undefined;
    const report = await projectProviderCosts(parsed.data);
    return Response.json({ projectId: parsed.data, ...report, reconciliation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}

// GET only reads the ledger. POST retries bounded usage-metadata reads; neither
// method generates images, changes pricing, touches credits or runs cleanup.
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
