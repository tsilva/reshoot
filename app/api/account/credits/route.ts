import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditSummary } from "@/lib/credits/service";

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    return Response.json({ credits: await getCreditSummary(user.id, user.isDemo) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
