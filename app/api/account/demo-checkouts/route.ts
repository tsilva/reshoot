import { z } from "zod";
import { apiErrorResponse, ApiError, readJson } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { createDemoPurchase, getCreditSummary } from "@/lib/credits/service";

const checkoutSchema = z.object({
  packSlug: z.enum(["starter", "studio", "pro"]),
  idempotencyKey: z.string().trim().min(8).max(120),
});

export async function POST(request: Request) {
  try {
    const user = await resolveCurrentUser();
    const parsed = checkoutSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      throw new ApiError(
        400,
        "invalid_checkout",
        "Choose a valid credit pack and try again.",
      );
    }
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
