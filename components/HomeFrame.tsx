import Link from "next/link";
import { Aperture } from "@phosphor-icons/react/ssr";
import type { ReactNode } from "react";
import { LegalLinks } from "@/components/legal/LegalLinks";

export function HomeFrame({ brandHref, accountControls, startAction, startNote, sample, pageError, children, prefetchLinks }: {
  brandHref: string;
  accountControls: ReactNode;
  startAction: ReactNode;
  startNote: string;
  sample: ReactNode;
  pageError?: ReactNode;
  children?: ReactNode;
  prefetchLinks?: boolean;
}) {
  return (
    <div className="one-page-studio home-page">
      <header className="home-header">
        <div className="home-header-inner">
          <Link href={brandHref} prefetch={prefetchLinks} className="home-brand" aria-label="Reshoot home">
            <Aperture size={24} weight="light" aria-hidden="true" />reshoot.
          </Link>
          {accountControls}
        </div>
      </header>

      <main className="home-content">
        {pageError}
        <div className="home-hero">
          <section className="home-intro" aria-labelledby="home-title">
            <h1 id="home-title">Your photos.<br />{" "}<em>Professional 360° views.</em></h1>
            <div className="home-intro-copy">
              <p>Add your product photos. Get clean studio views, automatically.</p>
              <div className="home-start-row">
                {startAction}
                <p className="home-start-note">{startNote}</p>
              </div>
            </div>
          </section>
          {sample}
        </div>
        {children}
      </main>
      <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span><LegalLinks prefetch={prefetchLinks} /></footer>
    </div>
  );
}
