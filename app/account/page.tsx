import { AppShell } from "@/components/AppShell";
import { AccountClient } from "@/components/account/AccountClient";
import { resolveCurrentUser } from "@/lib/auth/current-user";
import { getCreditActivity, getCreditSummary } from "@/lib/credits/service";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await resolveCurrentUser();
  const [credits, activity] = await Promise.all([
    getCreditSummary(user.id, user.isDemo),
    getCreditActivity(user.id),
  ]);

  return (
    <AppShell
      currentUser={{
        displayName: user.displayName,
        email: user.email,
        isDemo: user.isDemo,
        availableCredits: credits.availableCredits,
      }}
    >
      <AccountClient
        initialCredits={credits}
        initialActivity={activity}
        displayName={user.displayName}
        email={user.email}
      />
    </AppShell>
  );
}
