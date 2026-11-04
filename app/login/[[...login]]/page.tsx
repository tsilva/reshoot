import { SignIn } from "@clerk/nextjs";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { clerkConfigured, safeReturnPath } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  const destination = safeReturnPath(returnTo);
  return <main className="auth-page">
    <Link href="/" className="home-brand">reshoot.</Link>
    <p>Your shoots and credits, in your own account.</p>
    {clerkConfigured() ? <SignIn path="/login" routing="path" signUpUrl={`/sign-up?returnTo=${encodeURIComponent(destination)}`} fallbackRedirectUrl={destination} /> : <section role="status"><h1>Sign-in is temporarily unavailable</h1><p>Please try again later. You can still explore the sample shoots.</p></section>}
    <p className="auth-payment-note">Payments are simulated. No card or real payment is needed.</p>
    <LegalLinks />
  </main>;
}
