export const CLERK_PLACEHOLDER: string;
export function validateClerkSession(env?: Record<string, string | undefined>): true;
export function clerkRequestAllowed(url: URL, method: string, headers: Headers): boolean;
