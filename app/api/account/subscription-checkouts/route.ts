import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { createMonthlyCheckout } from "@/lib/subscriptions/stripe";
import { parseSubscriptionRequest, requireSameOrigin, returnPathSchema } from "@/lib/subscriptions/request";
export const runtime = "nodejs";
const schema = z.object({ planSlug: z.enum(["starter", "studio", "pro"]), idempotencyKey: z.uuid(), returnPath: returnPathSchema }).strict();
export async function POST(request: Request) {
  try {
    const origin = requireSameOrigin(request);
    const user = await resolveCurrentUser();
    const input = await parseSubscriptionRequest(request, schema);
    return Response.json(await createMonthlyCheckout({ ...input, userId: user.id, isDemoUser: user.isDemo, origin }), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
