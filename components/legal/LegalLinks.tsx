import Link from "next/link";
import styles from "./legal.module.css";

export function LegalLinks({ prefetch }: { prefetch?: boolean }) {
  return <nav className={styles.links} aria-label="Legal">
    <Link href="/privacy" prefetch={prefetch}>Privacy policy</Link>
    <Link href="/terms" prefetch={prefetch}>Terms of service</Link>
  </nav>;
}
