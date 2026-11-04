"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Aperture, Coins, Plus, SpinnerGap, User, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProjectStudioClient } from "@/components/projects/ProjectStudioClient";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { SampleCarousel } from "@/components/SampleCarousel";
import { AccountMenu } from "@/components/account/AccountMenu";
import type { CreditLedgerEntry, CreditSummary, ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { PROJECT_RETURN_KEY, projectCardId, projectPath } from "@/lib/projects/routes";

const AccountClient = dynamic(() => import("@/components/account/AccountClient").then((module) => module.AccountClient));

export function StudioHome({ initialCredits, initialProjects, currentUser, project: activeProject = null, showLibrary = false, initialWalletOpen = false }: {
  initialCredits: CreditSummary | null;
  initialProjects: ProjectSummary[];
  currentUser: { displayName: string; email: string; isDemo: boolean } | null;
  project?: ProjectDetail | null;
  showLibrary?: boolean;
  initialWalletOpen?: boolean;
}) {
  const router = useRouter();
  const [credits, setCredits] = useState(initialCredits);
  const [walletOpen, setWalletOpen] = useState(initialWalletOpen);
  const [walletActivity, setWalletActivity] = useState<CreditLedgerEntry[] | null>(null);
  const [walletRevision, setWalletRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const studioRef = useRef<HTMLDivElement>(null);
  const walletRef = useRef<HTMLElement>(null);
  const creatingShoot = useRef(false);
  const projectId = activeProject?.id;

  useLayoutEffect(() => {
    if (projectId) {
      try {
        sessionStorage.setItem(PROJECT_RETURN_KEY, projectCardId(projectId));
      } catch { /* Fragment links still work when browser storage is unavailable. */ }
      // Browsers can carry the old fragment across the legacy HTTP redirect.
      if (window.location.hash === "#studio") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      studioRef.current?.querySelector<HTMLElement>(".quiet-back")?.focus({ preventScroll: true });
    } else {
      const fragment = window.location.hash.slice(1);
      let visitedId: string | null = null;
      try {
        visitedId = sessionStorage.getItem(PROJECT_RETURN_KEY);
      } catch { /* Use the explicit return fragment instead. */ }
      const targetId = visitedId ?? (fragment.startsWith("shoot-") ? fragment : null);
      const visitedCard = targetId ? document.getElementById(targetId) : null;
      const target = visitedCard ?? (showLibrary || targetId ? document.getElementById("shoots") : null);
      target?.scrollIntoView({ behavior: "instant", block: "start" });
      // Apply after Next.js and browser history finish restoring their scroll.
      const frame = requestAnimationFrame(() => {
        target?.scrollIntoView({ behavior: "instant", block: "start" });
        try {
          if (sessionStorage.getItem(PROJECT_RETURN_KEY) === visitedId) sessionStorage.removeItem(PROJECT_RETURN_KEY);
        } catch { /* Storage is optional for explicit return links. */ }
      });
      return () => cancelAnimationFrame(frame);
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

  async function startShoot() {
    if (!currentUser) { router.push("/login"); return; }
    if (creatingShoot.current) return;
    creatingShoot.current = true;
    setBusy("shoot");
    setError(null);
    try {
      const { project } = await apiRequest<{ project: ProjectSummary }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({}),
      });
      router.push(projectPath(project.id));
    } catch (cause) {
      creatingShoot.current = false;
      setBusy(null);
      setError(cause instanceof Error ? cause.message : "Your shoot could not open. Please try again.");
    }
  }

  async function openWallet() {
    if (!currentUser) { router.push("/login?returnTo=%2F%3Fwallet%3Dopen"); return; }
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
  const walletPanel = walletOpen && credits && currentUser ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
    <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
    {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName={currentUser.displayName} email={currentUser.email} isDemo={currentUser.isDemo} onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
  </section> : null;

  if (activeProject && credits && currentUser) {
    const walletButton = <div className="home-account-controls"><button type="button" className="home-wallet-button is-quiet" aria-label={`Open wallet, ${credits.availableCredits.toLocaleString()} test credits`} onClick={() => void openWallet()} disabled={busy !== null}>
      {busy === "wallet" ? <SpinnerGap className="spin" size={17} /> : <User size={26} weight="light" />}
    </button><AccountMenu /></div>;
    return (
      <div className="one-page-studio has-studio" ref={studioRef}>
        <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits.demoCheckoutAvailable} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} walletButton={walletButton} pageError={pageError}>
          {walletPanel}
        </ProjectStudioClient>
      </div>
    );
  }

  return (
    <div className="one-page-studio home-page">
      <header className="home-header">
        <div className="home-header-inner">
          <Link href={showLibrary ? "/" : "#"} className="home-brand" aria-label="Reshoot home">
            <Aperture size={24} weight="light" aria-hidden="true" />reshoot.
          </Link>
          {currentUser && credits ? <div className="home-account-controls"><button className="home-wallet-button" onClick={() => void openWallet()} disabled={busy !== null}>
            {busy === "wallet" ? <SpinnerGap className="spin" size={17} /> : <Coins size={17} />}
            <span>{credits.availableCredits.toLocaleString()} test credits</span><Plus size={14} />
          </button><AccountMenu /></div> : <Link className="home-wallet-button" href="/login">Sign in <User size={18} /></Link>}
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
                <button className="home-primary-button" onClick={() => void startShoot()} disabled={busy !== null}>
                  <span>{busy === "shoot" ? "Opening shoot…" : "Add photos"}</span>
                  {busy === "shoot" ? <SpinnerGap className="spin" size={20} /> : <ArrowRight size={20} />}
                </button>
                <p className="home-start-note">{currentUser ? "Private to your account. Payments are simulated." : "Sign in to save your shoots. Explore the samples for free."}</p>
              </div>
            </div>
          </section>

          <SampleCarousel />
        </div>

        {walletPanel}
        <ProjectsClient key={initialProjects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={initialProjects} />
      </main>
      <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span></footer>
    </div>
  );
}
