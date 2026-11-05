import { z } from "zod";
import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { createSubscriptionPortal } from "@/lib/subscriptions/stripe";
import { parseSubscriptionRequest, requireSameOrigin, returnPathSchema } from "@/lib/subscriptions/request";
export const runtime = "nodejs";
const schema = z.object({ returnPath: returnPathSchema }).strict();
export async function POST(request: Request) {
  try {
    const origin = requireSameOrigin(request);
    const user = await resolveCurrentUser();
    const { returnPath } = await parseSubscriptionRequest(request, schema);
    return Response.json(await createSubscriptionPortal(user.id, user.isDemo, origin, returnPath), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
