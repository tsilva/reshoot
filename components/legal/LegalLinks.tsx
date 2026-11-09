import Link from "next/link";

export function LegalLinks({ prefetch }: { prefetch?: boolean }) {
  return <nav className="legal-links" aria-label="Legal">
    <Link href="/privacy" prefetch={prefetch}>Privacy policy</Link>
    <Link href="/terms" prefetch={prefetch}>Terms of service</Link>
  </nav>;
}
