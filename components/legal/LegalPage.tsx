import Link from "next/link";
import { LEGAL_CONTACT, LEGAL_UPDATED, type LegalDocument } from "@/lib/legal";
import { LegalLinks } from "./LegalLinks";
import styles from "./legal.module.css";

export function LegalPage({ document }: { document: LegalDocument }) {
  return <div className={styles.page}>
    <header className={styles.header}>
      <Link href="/" className="home-brand" aria-label="Reshoot home">reshoot.</Link>
      <Link href="/">Back to Reshoot</Link>
    </header>
    <main className={styles.article} id="main-content">
      <p className={styles.eyebrow}>RESHOOT</p>
      <h1>{document.title}</h1>
      <p className={styles.updated}>Last updated <time dateTime="2026-11-04">{LEGAL_UPDATED}</time></p>
      <p className={styles.description}>{document.description}</p>
      <nav className={styles.contents} aria-label="On this page">
        {document.sections.map((section) => <a key={section.id} href={`#${section.id}`}>{section.title}</a>)}
      </nav>
      {document.sections.map((section) => <section key={section.id} id={section.id}>
        <h2>{section.title}</h2>
        {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.links ? <ul>{section.links.map((link) => <li key={link.href}><a href={link.href}>{link.label}</a></li>)}</ul> : null}
      </section>)}
      <p className={styles.contact}>Contact: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a></p>
    </main>
    <footer className={styles.footer}><span>© {new Date().getFullYear()} Reshoot</span><LegalLinks /></footer>
  </div>;
}
