import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
import { getStripeTestCheckoutStatus } from "@/lib/payments/stripe";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await resolveCurrentUser();
    const { sessionId } = await context.params;
    const checkout = await getStripeTestCheckoutStatus(user.id, sessionId);
    return Response.json({ ...checkout, credits: await getCreditSummary(user.id, user.isDemo) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return apiErrorResponse(error); }
}
