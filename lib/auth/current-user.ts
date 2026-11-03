import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { cache } from "react";
import {
  DEMO_SESSION_COOKIE,
  DEMO_STARTING_CREDITS,
  demoSessionEmail,
} from "@/lib/auth/demo-session";
import { db } from "@/lib/db";
import { creditAccounts, creditLedger, users } from "@/lib/db/schema";

const SHARED_DEMO_EMAIL = "shared-demo@reshoot.local";

async function findUser(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.isDemo) throw new Error("Unexpected workspace account.");
  return user;
}

export const findLegacyDemoUser = cache(async () => {
  const email = demoSessionEmail((await cookies()).get(DEMO_SESSION_COOKIE)?.value);
  return email ? findUser(email) : undefined;
});

export const resolveCurrentUser = cache(async () => {
  await connection();
  const existing = await findUser(SHARED_DEMO_EMAIL);
  if (existing) return existing;

  await db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({
      id: crypto.randomUUID(),
      email: SHARED_DEMO_EMAIL,
      displayName: "Reshoot Demo",
      isDemo: true,
      // Automatic browser-local imports belonged to the private workspace.
      legacyImportCompletedAt: new Date(),
    }).onConflictDoNothing({ target: users.email }).returning({ id: users.id });
    if (!user) return;

    const [account] = await tx.insert(creditAccounts).values({
      userId: user.id,
      availableCredits: DEMO_STARTING_CREDITS,
      lifetimeGrantedCredits: DEMO_STARTING_CREDITS,
    }).returning({ id: creditAccounts.id });
    await tx.insert(creditLedger).values({
      accountId: account.id,
      userId: user.id,
      type: "grant",
      sourceType: "demo_workspace",
      sourceId: user.id,
      amountCredits: DEMO_STARTING_CREDITS,
      availableDelta: DEMO_STARTING_CREDITS,
      heldDelta: 0,
      availableAfter: DEMO_STARTING_CREDITS,
      heldAfter: 0,
      description: "1,000 test credits for the shared workspace",
    });
  });

  const user = await findUser(SHARED_DEMO_EMAIL);
  if (!user) throw new Error("Shared workspace initialization failed.");
  return user;
});
