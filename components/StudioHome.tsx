"use client";

import dynamic from "next/dynamic";
import {
  ArrowRight, Aperture, Coins, Plus, SpinnerGap, User, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ProjectStudioClient } from "@/components/projects/ProjectStudioClient";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import { SampleCarousel } from "@/components/SampleCarousel";
import type { CreditLedgerEntry, CreditSummary, ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { shootReferences } from "@/lib/client/shoot-plan";

const AccountClient = dynamic(() => import("@/components/account/AccountClient").then((module) => module.AccountClient));

async function prepareProjectPreview(project: ProjectDetail) {
  const firstView = project.shots.find((shot) => shot.versions.length)?.versions.at(-1);
  const src = firstView?.previewUrl ?? shootReferences(project.assets)[0]?.previewUrl;
  if (!src) return;

  const image = new Image();
  image.src = src;
  let timeout: number | undefined;
  // Keep the library visible while the first photo decodes, with a short
  // deadline so a slow or unavailable photo cannot block opening the shoot.
  await Promise.race([
    image.decode().catch(() => {}),
    new Promise<void>((resolve) => { timeout = window.setTimeout(resolve, 500); }),
  ]);
  window.clearTimeout(timeout);
}

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
  const openingProject = useRef(false);
  const libraryScroll = useRef<number | null>(null);
  const returningProject = useRef<string | null>(null);
  const studioRef = useRef<HTMLElement>(null);
  const walletRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    if (activeProject && libraryScroll.current !== null) {
      window.scrollTo({ top: 0, behavior: "instant" });
      studioRef.current?.querySelector<HTMLElement>(".quiet-back")?.focus({ preventScroll: true });
    } else if (returningProject.current) {
      const library = document.getElementById("shoots");
      if (libraryScroll.current === null) {
        library?.scrollIntoView({ behavior: "instant", block: "start" });
      } else {
        window.scrollTo({ top: libraryScroll.current, behavior: "instant" });
      }
      library?.querySelector<HTMLElement>(`a[href="/projects/${CSS.escape(returningProject.current)}"]`)?.focus({ preventScroll: true });
      libraryScroll.current = null;
      returningProject.current = null;
    }
  }, [activeProject]);

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
    if (openingProject.current) return;
    openingProject.current = true;
    setBusy("project");
    setError(null);
    try {
      const [response, library] = await Promise.all([
        apiRequest<{ project: ProjectDetail }>(`/api/projects/${projectId}`).then(async (detail) => {
          await prepareProjectPreview(detail.project);
          return detail;
        }),
        apiRequest<{ projects: ProjectSummary[] }>("/api/projects"),
      ]);
      libraryScroll.current = window.scrollY;
      setActiveProject(response.project);
      setProjects(library.projects);
      const url = new URL(window.location.href);
      url.searchParams.set("project", projectId);
      url.hash = "studio";
      window.history.replaceState(null, "", url);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This shoot could not open. Please try again.";
      setError(message);
      throw cause;
    } finally {
      openingProject.current = false;
      setBusy(null);
    }
  }

  function closeWallet() {
    setWalletOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("wallet");
    if (url.hash === "#wallet") url.hash = "";
    window.history.replaceState(null, "", url);
  }

  function closeProject() {
    returningProject.current = activeProject?.id ?? null;
    setActiveProject(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    url.hash = "shoots";
    window.history.replaceState(null, "", url);
  }

  return (
    <div className={`one-page-studio${activeProject ? " has-studio" : ""}`}>
      <header className="home-header">
        <div className="home-header-inner">
          <a href="#" className="home-brand" aria-label="Reshoot home" onClick={activeProject ? (event) => { event.preventDefault(); closeProject(); } : undefined}>{!activeProject ? <Aperture size={24} weight="light" aria-hidden="true" /> : null}reshoot.</a>
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
          <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits?.demoCheckoutAvailable ?? false} onBack={closeProject} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} />
        </section> : null}

        {walletOpen && credits ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
          <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
          {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName="Your private workspace" email="Saved in this browser" isDemo onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
        </section> : null}

        {busy === "project" ? <p className="home-opening-shoot" role="status"><SpinnerGap className="spin" /> Opening your shoot…</p> : null}

        {!activeProject && credits ? <ProjectsClient key={projects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={projects} onOpenProject={openProject} createOpen={createOpen} onCreateClose={() => setCreateOpen(false)} /> : null}
      </main>
      {!activeProject ? <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span></footer> : null}
    </div>
  );
}
