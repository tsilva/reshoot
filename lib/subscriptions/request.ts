import { z } from "zod";
import { ApiError, readJson } from "@/lib/api/errors";
export const returnPathSchema = z.string().regex(/^\/(?:projects(?:\/[0-9a-f-]{36})?)?$/).default("/");
export function requireSameOrigin(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin || url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new ApiError(403, "invalid_origin", "Open subscription settings from Reshoot.");
  return url.origin;
}
export async function parseSubscriptionRequest<T>(request: Request, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiError(400, "invalid_subscription_request", "Choose a valid plan and try again.");
  return parsed.data;
}
