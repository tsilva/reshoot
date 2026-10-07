import { cookies } from "next/headers";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { findCurrentUser } from "@/lib/auth/current-user";
import {
  createDemoSessionToken,
  demoSessionEmail,
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_MAX_AGE,
  DEMO_STARTING_CREDITS,
} from "@/lib/auth/demo-session";
import { db } from "@/lib/db";
import { creditAccounts, creditLedger, users } from "@/lib/db/schema";

export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    if (request.headers.get("origin") !== url.origin) {
      throw new ApiError(403, "invalid_origin", "Open the testing workspace from Reshoot.");
    }
    if (!(await findCurrentUser())) {
      const token = createDemoSessionToken();
      const userId = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: userId,
          email: demoSessionEmail(token)!,
          displayName: "Reshoot Demo",
          isDemo: true,
        });
        const [account] = await tx.insert(creditAccounts).values({
          userId,
          availableCredits: DEMO_STARTING_CREDITS,
          lifetimeGrantedCredits: DEMO_STARTING_CREDITS,
        }).returning();
        await tx.insert(creditLedger).values({
          accountId: account.id,
          userId,
          type: "grant",
          sourceType: "demo_workspace",
          sourceId: userId,
          amountCredits: DEMO_STARTING_CREDITS,
          availableDelta: DEMO_STARTING_CREDITS,
          heldDelta: 0,
          availableAfter: DEMO_STARTING_CREDITS,
          heldAfter: 0,
          description: "1,000 fake credits — initial testing balance, no payment",
        });
      });
      (await cookies()).set(DEMO_SESSION_COOKIE, token, {
        httpOnly: true,
        secure: url.protocol === "https:",
        sameSite: "lax",
        path: "/",
        maxAge: DEMO_SESSION_MAX_AGE,
      });
    }
    return Response.redirect(new URL("/projects", url), 303);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
