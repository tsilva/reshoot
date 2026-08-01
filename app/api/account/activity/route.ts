import { apiErrorResponse } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditActivity } from "@/lib/credits/service";

export async function GET() {
  try {
    const user = await resolveCurrentUser();
    return Response.json({ activity: await getCreditActivity(user.id) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
