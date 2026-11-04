import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { LegalLinks } from "@/components/legal/LegalLinks";
import { clerkConfigured, safeReturnPath } from "@/lib/auth/config";

export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = await searchParams;
  const destination = safeReturnPath(returnTo);
  return <main className="auth-page">
    <Link href="/" className="home-brand">reshoot.</Link>
    <p>Create an account for your private shoots and test wallet.</p>
    {clerkConfigured() ? <SignUp path="/sign-up" routing="path" signInUrl={`/login?returnTo=${encodeURIComponent(destination)}`} fallbackRedirectUrl={destination} /> : <section role="status"><h1>Sign-up is temporarily unavailable</h1><p>Please try again later.</p></section>}
    <p className="auth-payment-note">Payments are simulated. No card or real payment is needed.</p>
    <LegalLinks />
  </main>;
}
