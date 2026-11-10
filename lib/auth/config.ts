import { validateClerkSession } from "./vault-session.mjs";

export function clerkConfigured() {
  if (process.env.RESHOOT_CLERK_TRANSPORT !== undefined) return validateClerkSession();
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function requireProductionClerkConfiguration(environment: Record<string, string | undefined>) {
  if (environment.VERCEL_ENV === "production" &&
      !(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && environment.CLERK_SECRET_KEY)) {
    throw new Error("Production requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY. Connect the native Clerk/Vercel integration before deploying.");
  }
}

export function safeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/";
  return value;
}
