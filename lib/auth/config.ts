import { validateClerkSession } from "./vault-session.mjs";

export function clerkConfigured() {
  if (process.env.RESHOOT_CLERK_TRANSPORT !== undefined) return validateClerkSession();
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export function requireProductionClerkConfiguration(environment: Record<string, string | undefined>) {
  // The prebuilt runner verifies the native binding by metadata. Requests still
  // require the real Clerk runtime credentials on Vercel.
  const runtimeBindingVerified = environment.GITHUB_ACTIONS === "true" &&
    environment.GITHUB_REPOSITORY === "tsilva/reshoot" &&
    environment.VERCEL_PREBUILT_CLERK_RUNTIME_VERIFIED === "1";
  if (environment.VERCEL_ENV === "production" &&
      !(environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
        (environment.CLERK_SECRET_KEY || runtimeBindingVerified))) {
    throw new Error("Production requires NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY. Connect the native Clerk/Vercel integration before deploying.");
  }
}

export function safeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/";
  return value;
}
