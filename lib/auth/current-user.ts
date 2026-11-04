import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError } from "@/lib/api/errors";
import { clerkConfigured, safeReturnPath } from "@/lib/auth/config";
import { DEMO_SESSION_COOKIE, demoSessionEmail } from "@/lib/auth/demo-session";
import { creditAccounts, users } from "@/lib/db/schema";

export const findLegacyDemoUser = cache(async () => {
  const email = demoSessionEmail((await cookies()).get(DEMO_SESSION_COOKIE)?.value);
  if (!email) return undefined;
  const { db } = await import("@/lib/db");
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user?.isDemo && !user.clerkUserId ? user : undefined;
});

export const findCurrentUser = cache(async () => {
  if (!clerkConfigured()) return null;
  const { userId } = await auth();
  if (!userId) return null;
  const { db } = await import("@/lib/db");
  const [existing] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  if (existing) return existing;

  const profile = await currentUser();
  if (!profile || profile.id !== userId) throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  const email = profile.emailAddresses.find((address) => address.id === profile.primaryEmailAddressId)?.emailAddress
    ?? `clerk+${userId}@reshoot.local`;
  const displayName = profile.fullName || profile.username || email.split("@")[0];

  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      id: crypto.randomUUID(), clerkUserId: userId, email, displayName,
      // Authentication is real; this phase only grants simulated purchase credits.
      isDemo: true, legacyImportCompletedAt: new Date(),
    }).onConflictDoNothing({ target: users.clerkUserId }).returning({ id: users.id });
    if (!user) return;
    // Start empty so the first simulated purchase exercises the full wallet flow.
    await tx.insert(creditAccounts).values({ userId: user.id });
  });
  const [user] = await db.select().from(users).where(eq(users.clerkUserId, userId)).limit(1);
  if (!user) throw new Error("Account initialization failed.");
  return user;
});

export const resolveCurrentUser = cache(async () => {
  const user = await findCurrentUser();
  if (!user) throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  return user;
});

export async function requirePageUser(returnTo = "/") {
  const user = await findCurrentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(safeReturnPath(returnTo))}`);
  return user;
}
