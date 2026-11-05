import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { handleStripeTestEvent, verifyStripeTestEvent } from "@/lib/payments/stripe";
import { handleMonthlySubscriptionEvent } from "@/lib/subscriptions/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = await request.text();
    if (payload.length > 1_000_000) throw new ApiError(413, "event_too_large", "Webhook payload is too large.");
    const event = verifyStripeTestEvent(payload, request.headers.get("stripe-signature"));
    await handleStripeTestEvent(event);
    await handleMonthlySubscriptionEvent(event);
    return Response.json({ received: true });
  } catch (error) { return apiErrorResponse(error); }
}
