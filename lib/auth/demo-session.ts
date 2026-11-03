import { createHash } from "node:crypto";

export const DEMO_SESSION_COOKIE = "reshoot_demo_session";
export const DEMO_STARTING_CREDITS = 1_000;

export function demoSessionEmail(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  // Store a one-way token lookup, never a bearer credential or a public user ID.
  const hash = createHash("sha256").update(token).digest("hex");
  return `demo+${hash}@reshoot.local`;
}
