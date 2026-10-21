"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import {
  ArrowDown, ArrowRight, ArrowsClockwise, Check, Coins, ImageSquare,
  Plus, ShieldCheck, Sparkle, SpinnerGap, UploadSimple, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import type { CreditLedgerEntry, CreditSummary, ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";

const AccountClient = dynamic(() => import("@/components/account/AccountClient").then((module) => module.AccountClient));
const ProjectStudioClient = dynamic(() => import("@/components/projects/ProjectStudioClient").then((module) => module.ProjectStudioClient));

const sampleAngles = [
  { id: "front", label: "Front", rotation: "0°" },
  { id: "front-three-quarter", label: "Three-quarter", rotation: "45°" },
  { id: "right-profile", label: "Side", rotation: "90°" },
  { id: "back", label: "Back", rotation: "180°" },
];

export function StudioHome({ initialCredits, initialProjects, initialProject = null, initialWalletOpen = false }: {
  initialCredits: CreditSummary | null;
  initialProjects: ProjectSummary[];
  initialProject?: ProjectDetail | null;
  initialWalletOpen?: boolean;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [projects, setProjects] = useState(initialProjects);
  const [activeProject, setActiveProject] = useState(initialProject);
  const [angle, setAngle] = useState(sampleAngles[1]);
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
          <a href="#" className="home-brand" aria-label="Reshoot home">
            <Image src="/brand/logo/wordmark.png" width={136} height={32} alt="Reshoot" priority />
          </a>
          <span className="home-header-caption">Your always-open photo studio.</span>
          <div className="home-header-actions">
            <a href="#shoots" className="home-shoots-link">Your shoots</a>
            <button className="home-wallet-button" onClick={() => void openWallet()} disabled={busy !== null}>
              {busy === "wallet" ? <SpinnerGap className="spin" size={18} /> : <Coins size={19} />}
              <span>{credits ? `${credits.availableCredits.toLocaleString()} test credits` : "Wallet"}</span>
              <Plus size={15} weight="bold" />
            </button>
          </div>
        </div>
      </header>

      <main className="home-content">
        <section className="home-intro" aria-labelledby="home-title">
          <div>
            <p className="home-eyebrow"><span /> THE PRODUCT PHOTOGRAPHY STUDIO, REIMAGINED</p>
            <h1 id="home-title">One product photo.<br />A whole new <span>perspective.</span></h1>
          </div>
          <div className="home-intro-copy">
            <p>Turn the photo you have into the angles you need.<br className="desktop-break" /> Upload, create, and keep your best shots. Right here.</p>
            <a href={activeProject ? "#studio" : "#sample"} className="home-text-link">{activeProject ? "Back to your shoot" : "Take the studio for a spin"} <ArrowDown size={16} /></a>
          </div>
        </section>

        {error ? <div className="home-error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={18} /></button></div> : null}

        {activeProject ? <section className="home-active-studio" ref={studioRef} id="studio">
          <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits?.demoCheckoutAvailable ?? false} onBack={closeProject} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} />
        </section> : (
        <section className="sample-workspace" id="sample" aria-labelledby="sample-heading">
          <header className="sample-toolbar">
            <div><span className="sample-live-dot" /><h2 id="sample-heading">Meet your next product shoot.</h2><span className="sample-badge">INTERACTIVE SAMPLE</span></div>
            <span className="sample-no-charge"><Sparkle size={15} /> Free to explore</span>
          </header>
          <div className="sample-layout">
            <aside className="sample-source">
              <div className="sample-step"><span>01</span><h3>Start with one photo</h3></div>
              <div className="sample-original">
                <Image src="/assets/angle-guides/front.jpg" width={512} height={512} alt="Sample original: a knitted doll facing forward on a cream background" priority />
                <span><ImageSquare size={14} /> Original photo</span>
              </div>
              <div className="sample-source-caption"><strong>The everyday photo.</strong><p>The starting point for a whole new set.</p></div>
              <button className="sample-upload" onClick={() => void startShoot()} disabled={busy !== null}>
                {busy === "shoot" ? <SpinnerGap className="spin" size={23} /> : <UploadSimple size={25} weight="light" />}
                <strong>{busy === "shoot" ? "Opening your studio…" : "Upload your product"}</strong>
                <span>JPG, PNG or WebP · up to 20 MB each</span>
                <span className="sample-upload-cta">Make it yours <ArrowRight size={16} /></span>
              </button>
              <p className="sample-private"><ShieldCheck size={14} /> Your originals stay private.</p>
            </aside>
            <div className="sample-results">
              <div className="sample-result-heading"><div className="sample-step"><span>02</span><h3>Find its good side. Every side.</h3></div><span className="sample-result-count">4 example angles</span></div>
              <div className="sample-viewer">
                <Image key={angle.id} src={`/assets/angle-guides/${angle.id}.jpg`} width={512} height={512} alt={`Sample result: knitted doll, ${angle.label.toLowerCase()} view`} priority />
                <span className="sample-view-label"><Sparkle size={14} /> {angle.label} view</span>
                <span className="sample-angle"><ArrowsClockwise size={15} /> {angle.rotation}</span>
              </div>
              <div className="sample-angle-options" role="group" aria-label="Explore sample angles">
                {sampleAngles.map((item) => <button key={item.id} className={angle.id === item.id ? "is-selected" : ""} aria-pressed={angle.id === item.id} onClick={() => setAngle(item)}>
                  <Image src={`/assets/angle-guides/${item.id}.jpg`} width={64} height={64} alt="" />
                  <span>{item.label}</span>{angle.id === item.id ? <Check size={15} weight="bold" /> : <span className="angle-option-degree">{item.rotation}</span>}
                </button>)}
              </div>
              <p className="sample-disclosure">Pre-made sample images. Switching views uses no credits. Unseen product details are estimates.</p>
            </div>
          </div>
          <footer className="sample-bottom-bar"><span><Check size={17} /> Same product. More possibilities.</span><span>Explore the sample, then try your own.</span></footer>
        </section>
        )}

        <section className="home-next-step" aria-labelledby="next-step-title">
          <div className="home-next-icon"><Sparkle size={26} weight="duotone" /></div>
          <div><p className="home-eyebrow">YOUR PRODUCT IS NEXT</p><h2 id="next-step-title">A full photo studio. A little credit goes a long way.</h2><p>Choose your angles, see the exact quote, then create. Top up your wallet whenever you need.</p></div>
          <button className="button primary-button" onClick={() => void openWallet()} disabled={busy !== null}>Explore your wallet <ArrowRight size={18} /></button>
        </section>
        <div className="home-build-note"><ShieldCheck size={17} /><p>This is a test studio. Start with 1,000 fake credits; no payment is required. Real billing is coming later.</p></div>

        {walletOpen && credits ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
          <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
          {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName="Your private workspace" email="Saved in this browser" isDemo onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
        </section> : null}

        {busy === "project" ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Opening your shoot…</p> : null}

        {credits ? <ProjectsClient key={projects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={projects} onOpenProject={openProject} createOpen={createOpen} onCreateClose={() => setCreateOpen(false)} /> : <section className="home-saved-empty" id="shoots"><div><p className="home-eyebrow">A PLACE FOR EVERY PRODUCT</p><h2>Your next shoot starts here.</h2><p>Every original, angle, and approved version, together in your private workspace.</p></div><button className="button secondary-button" onClick={() => void startShoot()} disabled={busy !== null}>Start your first shoot <ArrowRight size={17} /></button></section>}
      </main>
      <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span><span>Less setup. More good shots.</span><a href={activeProject ? "#studio" : "#sample"}>Back to the studio ↑</a></footer>
    </div>
  );
}
