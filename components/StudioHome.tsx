"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import {
  ArrowRight, Aperture, Coins, Plus, SpinnerGap, User, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProjectStudioClient } from "@/components/projects/ProjectStudioClient";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { SampleCarousel } from "@/components/SampleCarousel";
import type { CreditLedgerEntry, CreditSummary, ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";

const AccountClient = dynamic(() => import("@/components/account/AccountClient").then((module) => module.AccountClient));

export function StudioHome({ initialCredits, initialProjects, project: activeProject = null, showLibrary = false, initialWalletOpen = false }: {
  initialCredits: CreditSummary;
  initialProjects: ProjectSummary[];
  project?: ProjectDetail | null;
  showLibrary?: boolean;
  initialWalletOpen?: boolean;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [createOpen, setCreateOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(initialWalletOpen);
  const [walletActivity, setWalletActivity] = useState<CreditLedgerEntry[] | null>(null);
  const [walletRevision, setWalletRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLElement>(null);
  const projectId = activeProject?.id;

  useLayoutEffect(() => {
    if (projectId) {
      // Browsers can carry the old fragment across the legacy HTTP redirect.
      if (window.location.hash === "#studio") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      studioRef.current?.querySelector<HTMLElement>(".quiet-back")?.focus({ preventScroll: true });
    } else if (showLibrary) {
      document.getElementById("shoots")?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, [projectId, showLibrary]);

  const refreshBalance = useCallback(() => {
    void apiRequest<{ credits: CreditSummary }>("/api/account/credits")
      .then(({ credits: updated }) => {
        setCredits(updated);
        setWalletActivity(null);
      })
      .catch(() => setError("Your wallet could not refresh. Open it to try again."));
  }, []);

  async function openWallet() {
    setBusy("wallet");
    setError(null);
    try {
      const response = await apiRequest<{ activity: CreditLedgerEntry[] }>("/api/account/activity");
      setWalletActivity(response.activity);
      setWalletOpen(true);
      if (walletOpen) walletRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your wallet could not open. Please try again.");
    } finally { setBusy(null); }
  }

  useEffect(() => {
    if (!walletOpen) return;
    walletRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [walletOpen]);

  // Old account links open this same inline wallet, including its transaction history.
  useEffect(() => {
    if (!walletOpen || walletActivity !== null) return;
    let cancelled = false;
    void apiRequest<{ activity: CreditLedgerEntry[] }>("/api/account/activity")
      .then((response) => { if (!cancelled) setWalletActivity(response.activity); })
      .catch(() => { if (!cancelled) setError("Wallet activity could not load. Open the wallet to retry."); });
    return () => { cancelled = true; };
  }, [walletOpen, walletActivity]);

  function closeWallet() {
    setWalletOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("wallet");
    if (url.hash === "#wallet") url.hash = "";
    window.history.replaceState(null, "", url);
  }

  const pageError = error ? <div className="home-error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={18} /></button></div> : null;
  const walletPanel = walletOpen ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
    <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
    {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName="Reshoot Demo" email="Shared testing workspace" isDemo onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
  </section> : null;

  if (activeProject) {
    const walletButton = <button type="button" className="home-wallet-button is-quiet" aria-label={`Open wallet, ${credits.availableCredits.toLocaleString()} test credits`} onClick={() => void openWallet()} disabled={busy !== null}>
      {busy === "wallet" ? <SpinnerGap className="spin" size={17} /> : <User size={26} weight="light" />}
    </button>;
    return (
      <div className="one-page-studio has-studio" ref={studioRef}>
        <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits.demoCheckoutAvailable} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} walletButton={walletButton} pageError={pageError}>
          {walletPanel}
        </ProjectStudioClient>
      </div>
    );
  }

  return (
    <div className="one-page-studio">
      <header className="home-header">
        <div className="home-header-inner">
          <Link href={showLibrary ? "/" : "#"} className="home-brand" aria-label="Reshoot home">
            <Aperture size={24} weight="light" aria-hidden="true" />reshoot.
          </Link>
          <button className="home-wallet-button" onClick={() => void openWallet()} disabled={busy !== null}>
            {busy === "wallet" ? <SpinnerGap className="spin" size={17} /> : <Coins size={17} />}
            <span>{credits.availableCredits.toLocaleString()} test credits</span><Plus size={14} />
          </button>
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
                <button className="home-primary-button" onClick={() => setCreateOpen(true)} disabled={busy !== null}>
                  <span>Add photos</span>
                  {busy === "shoot" ? <SpinnerGap className="spin" size={20} /> : <ArrowRight size={20} />}
                </button>
                <p className="home-start-note">Shared testing workspace. Shoots are visible to everyone.</p>
              </div>
            </div>
          </section>

          <SampleCarousel />
        </div>

        {walletPanel}
        <ProjectsClient key={initialProjects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={initialProjects} createOpen={createOpen} onCreateClose={() => setCreateOpen(false)} />
      </main>
      <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span></footer>
    </div>
  );
}
