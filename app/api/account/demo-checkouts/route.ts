import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { createDemoPurchase, getCreditSummary } from "@/lib/credits/service";

const checkoutSchema = z.object({
  packSlug: z.enum(["starter", "studio", "pro"]),
  idempotencyKey: z.string().trim().min(8).max(120),
  outcome: z.enum(["succeeded", "declined"]).default("succeeded"),
}).strict();

export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) {
      throw new ApiError(403, "invalid_origin", "Open checkout from Reshoot.");
    }
    const user = await resolveCurrentUser();
    const parsed = checkoutSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_checkout",
        "Choose a valid credit pack and try again.",
      );
    }
    if (parsed.data.outcome === "declined") throw new ApiError(402, "simulated_payment_declined", "The simulated payment was declined. No credits were added. Choose a successful payment to retry.");
    const purchase = await createDemoPurchase({
      userId: user.id,
      isDemoUser: user.isDemo,
      ...parsed.data,
    });
    return Response.json({
      purchase: {
        id: purchase.id,
        credits: purchase.credits,
        createdAt: purchase.createdAt.toISOString(),
      },
      credits: await getCreditSummary(user.id, user.isDemo),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
