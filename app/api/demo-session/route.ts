import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { resolveCurrentUser } from "@/lib/auth/current-user";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    if (request.headers.get("origin") !== url.origin) {
      throw new ApiError(403, "invalid_origin", "Open the testing workspace from Reshoot.");
    }
    await resolveCurrentUser();
    if (request.headers.get("accept")?.includes("application/json")) {
      return Response.json({ ready: true });
    }
    return Response.redirect(new URL("/", url), 303);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
