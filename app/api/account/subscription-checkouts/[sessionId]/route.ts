import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";
import { monthlyCheckoutStatus } from "@/lib/subscriptions/stripe";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await resolveCurrentUser();
    const { sessionId } = await context.params;
    const status = await monthlyCheckoutStatus(user.id, sessionId);
    const credits = await getCreditSummary(user.id, user.isDemo);
    return Response.json({ ...status, credits }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
