import Link from "next/link";
import styles from "./legal.module.css";

export function LegalLinks() {
  return <nav className={styles.links} aria-label="Legal">
    <Link href="/privacy">Privacy policy</Link>
    <Link href="/terms">Terms of service</Link>
  </nav>;
}
