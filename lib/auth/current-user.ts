import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ApiError } from "@/lib/api/errors";
import { DEMO_SESSION_COOKIE, demoSessionEmail } from "@/lib/auth/demo-session";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const findCurrentUser = cache(async () => {
  const token = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  const email = demoSessionEmail(token);
  if (!email) return null;
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      isDemo: users.isDemo,
      legacyImportCompletedAt: users.legacyImportCompletedAt,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user?.isDemo) return null;
  return { ...user, email: "demo@reshoot.local" };
});

export async function resolveCurrentUser() {
  const user = await findCurrentUser();
  if (!user) throw new ApiError(401, "session_required", "Open your testing workspace to continue.");
  return user;
}

export async function requirePageUser() {
  const user = await findCurrentUser();
  if (!user) redirect("/login");
  return user;
}
