import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

export async function resolveCurrentUser() {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isDemo: users.isDemo,
      legacyImportCompletedAt: users.legacyImportCompletedAt,
    })
    .from(users)
    .where(eq(users.id, DEMO_USER_ID))
    .limit(1);

  if (!user) {
    throw new Error("The demo account has not been seeded.");
  }

  return user;
}
