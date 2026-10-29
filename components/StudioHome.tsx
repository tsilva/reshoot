"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight, Aperture, Coins, Plus, SpinnerGap, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { SampleCarousel } from "@/components/SampleCarousel";
import type { CreditLedgerEntry, CreditSummary, ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";

const AccountClient = dynamic(() => import("@/components/account/AccountClient").then((module) => module.AccountClient));
const ProjectStudioClient = dynamic(() => import("@/components/projects/ProjectStudioClient").then((module) => module.ProjectStudioClient));

export function StudioHome({ initialCredits, initialProjects, initialProject = null, initialWalletOpen = false }: {
  initialCredits: CreditSummary | null;
  initialProjects: ProjectSummary[];
  initialProject?: ProjectDetail | null;
  initialWalletOpen?: boolean;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [projects, setProjects] = useState(initialProjects);
  const [activeProject, setActiveProject] = useState(initialProject);
  const [createOpen, setCreateOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(initialWalletOpen);
  const [walletActivity, setWalletActivity] = useState<CreditLedgerEntry[] | null>(null);
  const [walletRevision, setWalletRevision] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sessionRequest = useRef<Promise<CreditSummary> | null>(null);
  const studioRef = useRef<HTMLElement>(null);
  const walletRef = useRef<HTMLElement>(null);

  const refreshBalance = useCallback(() => {
    void Promise.all([
      apiRequest<{ credits: CreditSummary }>("/api/account/credits"),
      apiRequest<{ projects: ProjectSummary[] }>("/api/projects"),
    ]).then(([balance, library]) => {
      setCredits(balance.credits);
      setProjects(library.projects);
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

  async function openProject(projectId: string) {
    setBusy("project");
    setError(null);
    try {
      const [response, library] = await Promise.all([
        apiRequest<{ project: ProjectDetail }>(`/api/projects/${projectId}`),
        apiRequest<{ projects: ProjectSummary[] }>("/api/projects"),
      ]);
      setActiveProject(response.project);
      setProjects(library.projects);
      const url = new URL(window.location.href);
      url.searchParams.set("project", projectId);
      url.hash = "studio";
      window.history.replaceState(null, "", url);
      requestAnimationFrame(() => studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This shoot could not open. Please try again.";
      setError(message);
      throw cause;
    } finally { setBusy(null); }
  }

  function closeWallet() {
    setWalletOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("wallet");
    if (url.hash === "#wallet") url.hash = "";
    window.history.replaceState(null, "", url);
  }

  function closeProject() {
    setActiveProject(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    url.hash = "shoots";
    window.history.replaceState(null, "", url);
    document.getElementById("shoots")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="one-page-studio">
      <header className="home-header">
        <div className="home-header-inner">
          <a href="#" className="home-brand" aria-label="Reshoot home"><Aperture size={24} weight="light" aria-hidden="true" />reshoot.</a>
          <button className="home-wallet-button" onClick={() => void openWallet()} disabled={busy !== null}>
            {busy === "wallet" ? <SpinnerGap className="spin" size={17} /> : <Coins size={17} />}
            <span>{credits ? `${credits.availableCredits.toLocaleString()} test credits` : "Your wallet"}</span>
            <Plus size={14} />
          </button>
        </div>
      </header>

      <main className="home-content">
        {error ? <div className="home-error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={18} /></button></div> : null}

        <div className={`home-hero${activeProject ? " has-project" : ""}`}>
          <section className="home-intro" aria-labelledby="home-title">
            <p className="home-eyebrow home-product-category">AI PRODUCT PHOTOGRAPHY</p>
            <h1 id="home-title">One product photo.<br />{" "}<em>Every angle.</em></h1>
            <div className="home-intro-copy">
              <p>Upload a photo of your product. AI creates new views from the front, side, and back, ready for your shop or catalog.</p>
              <div className="home-start-row">
                <button className="home-primary-button" onClick={() => void startShoot()} disabled={busy !== null}>
                  <span>{busy === "shoot" ? "Opening upload…" : "Upload your product photo"}</span>
                  {busy === "shoot" ? <SpinnerGap className="spin" size={20} /> : <ArrowRight size={20} />}
                </button>
                <p className="home-start-note">1,000 test credits included. No payment required.</p>
              </div>
            </div>
          </section>

          {!activeProject ? <SampleCarousel /> : null}
        </div>

        {activeProject ? <section className="home-active-studio" ref={studioRef} id="studio">
          <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits?.demoCheckoutAvailable ?? false} onBack={closeProject} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} />
        </section> : null}

        {walletOpen && credits ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
          <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
          {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName="Your private workspace" email="Saved in this browser" isDemo onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
        </section> : null}

        {busy === "project" ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Opening your shoot…</p> : null}

        {credits ? <ProjectsClient key={projects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={projects} onOpenProject={openProject} createOpen={createOpen} onCreateClose={() => setCreateOpen(false)} /> : <section className="home-saved-empty" id="shoots"><h2>Your shoots</h2><p>Your product photos will be saved here.</p></section>}
      </main>
      <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span></footer>
    </div>
  );
}
