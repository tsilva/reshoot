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
  initialCredits: CreditSummary | null;
  initialProjects: ProjectSummary[];
  project?: ProjectDetail | null;
  showLibrary?: boolean;
  initialWalletOpen?: boolean;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [projects, setProjects] = useState(initialProjects);
  const [createOpen, setCreateOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(initialWalletOpen);
  const [walletActivity, setWalletActivity] = useState<CreditLedgerEntry[] | null>(null);
  const [walletRevision, setWalletRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRequest = useRef<Promise<CreditSummary> | null>(null);
  const studioRef = useRef<HTMLElement>(null);
  const walletRef = useRef<HTMLElement>(null);
  const hasWorkspace = credits !== null;
  const projectId = activeProject?.id;

  useLayoutEffect(() => {
    if (projectId) {
      // Browsers can carry the old fragment across the legacy HTTP redirect.
      if (window.location.hash === "#studio") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      studioRef.current?.querySelector<HTMLElement>(".quiet-back")?.focus({ preventScroll: true });
    } else if (showLibrary && hasWorkspace) {
      document.getElementById("shoots")?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, [projectId, hasWorkspace, showLibrary]);

  const refreshBalance = useCallback(() => {
    void apiRequest<{ credits: CreditSummary }>("/api/account/credits")
      .then(({ credits: updated }) => {
        setCredits(updated);
        setWalletActivity(null);
      })
      .catch(() => setError("Your wallet could not refresh. Open it to try again."));
  }, []);

  async function ensureWorkspace() {
    if (credits) return credits;
    if (!sessionRequest.current) {
      sessionRequest.current = (async () => {
        await apiRequest("/api/demo-session", { method: "POST", headers: { Accept: "application/json" } });
        const [balance, library] = await Promise.all([
          apiRequest<{ credits: CreditSummary }>("/api/account/credits"),
          apiRequest<{ projects: ProjectSummary[] }>("/api/projects"),
        ]);
        setCredits(balance.credits);
        setProjects(library.projects);
        return balance.credits;
      })().finally(() => { sessionRequest.current = null; });
    }
    return sessionRequest.current;
  }

  async function startShoot() {
    setBusy("shoot");
    setError(null);
    try {
      await ensureWorkspace();
      setCreateOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your workspace could not open. Please try again.");
    } finally { setBusy(null); }
  }

  async function openWallet() {
    setBusy("wallet");
    setError(null);
    try {
      await ensureWorkspace();
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
    if (!walletOpen || walletActivity !== null || !credits) return;
    let cancelled = false;
    void apiRequest<{ activity: CreditLedgerEntry[] }>("/api/account/activity")
      .then((response) => { if (!cancelled) setWalletActivity(response.activity); })
      .catch(() => { if (!cancelled) setError("Wallet activity could not load. Open the wallet to retry."); });
    return () => { cancelled = true; };
  }, [walletOpen, walletActivity, credits]);

  function closeWallet() {
    setWalletOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("wallet");
    if (url.hash === "#wallet") url.hash = "";
    window.history.replaceState(null, "", url);
  }

  return (
    <div className={`one-page-studio${activeProject ? " has-studio" : ""}`}>
      <header className="home-header">
        <div className="home-header-inner">
          <Link href={activeProject || showLibrary ? "/" : "#"} className="home-brand" aria-label="Reshoot home">
            {!activeProject ? <Aperture size={24} weight="light" aria-hidden="true" /> : null}reshoot.
          </Link>
          <button className={`home-wallet-button${activeProject ? " is-quiet" : ""}`} aria-label={activeProject ? `Open wallet, ${credits?.availableCredits.toLocaleString() ?? 0} test credits` : undefined} onClick={() => void openWallet()} disabled={busy !== null}>
            {busy === "wallet" ? <SpinnerGap className="spin" size={17} /> : activeProject ? <User size={26} weight="light" /> : <Coins size={17} />}
            {!activeProject ? <><span>{credits ? `${credits.availableCredits.toLocaleString()} test credits` : "Your wallet"}</span><Plus size={14} /></> : null}
          </button>
        </div>
      </header>

      <main className="home-content">
        {error ? <div className="home-error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={18} /></button></div> : null}

        {!activeProject ? <div className="home-hero">
          <section className="home-intro" aria-labelledby="home-title">
            <h1 id="home-title">Your photos.<br />{" "}<em>Professional 360° views.</em></h1>
            <div className="home-intro-copy">
              <p>Add your product photos. Get clean studio views, automatically.</p>
              <div className="home-start-row">
                <button className="home-primary-button" onClick={() => void startShoot()} disabled={busy !== null}>
                  <span>{busy === "shoot" ? "Opening upload…" : "Add photos"}</span>
                  {busy === "shoot" ? <SpinnerGap className="spin" size={20} /> : <ArrowRight size={20} />}
                </button>
                <p className="home-start-note">1,000 test credits included. No payment required.</p>
              </div>
            </div>
          </section>

          <SampleCarousel />
        </div> : null}

        {activeProject ? <section className="home-active-studio" ref={studioRef} id="studio">
          <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits?.demoCheckoutAvailable ?? false} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} />
        </section> : null}

        {walletOpen && credits ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
          <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
          {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName="Your private workspace" email="Saved in this browser" isDemo onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
        </section> : null}

        {!activeProject && credits ? <ProjectsClient key={projects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={projects} createOpen={createOpen} onCreateClose={() => setCreateOpen(false)} /> : null}
      </main>
      {!activeProject ? <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span></footer> : null}
    </div>
  );
}
