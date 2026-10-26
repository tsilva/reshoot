"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import {
  ArrowDown, ArrowRight, Aperture, ArrowsClockwise, Check, Coins,
  Plus, ShieldCheck, Sparkle, SpinnerGap, X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProjectsClient } from "@/components/projects/ProjectsClient";
import type { CreditLedgerEntry, CreditSummary, ProjectDetail, ProjectSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import sampleFront from "@/public/assets/angle-guides/front.jpg";
import sampleThreeQuarter from "@/public/assets/angle-guides/front-three-quarter.jpg";
import sampleSide from "@/public/assets/angle-guides/right-profile.jpg";
import sampleBack from "@/public/assets/angle-guides/back.jpg";

const AccountClient = dynamic(() => import("@/components/account/AccountClient").then((module) => module.AccountClient));
const ProjectStudioClient = dynamic(() => import("@/components/projects/ProjectStudioClient").then((module) => module.ProjectStudioClient));

const sampleAngles = [
  { id: "front", label: "Front", rotation: "0°", image: sampleFront },
  { id: "front-three-quarter", label: "Three-quarter", rotation: "45°", image: sampleThreeQuarter },
  { id: "right-profile", label: "Side", rotation: "90°", image: sampleSide },
  { id: "back", label: "Back", rotation: "180°", image: sampleBack },
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
          <nav className="home-navigation" aria-label="Main navigation">
            <a href={activeProject ? "#studio" : "#sample"}>{activeProject ? "Your studio" : "See an example"} <ArrowDown size={12} /></a>
            <a href="#shoots">Your shoots</a>
          </nav>
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
                {!activeProject ? <a href="#sample" className="home-example-link">Explore the example <ArrowDown size={14} /></a> : null}
              </div>
            </div>
            {!activeProject ? <div className="home-original-note">
              <div className="home-original-image"><Image src={sampleFront} sizes="92px" alt="The original sample photo: a handmade linen doll facing forward" loading="eager" /></div>
              <div><span className="home-eyebrow">THE INPUT</span><p>One original photo.</p><span className="home-handwritten">See the new angles →</span></div>
            </div> : <a href="#studio" className="home-text-link">Back to your shoot <ArrowDown size={16} /></a>}
          </section>

          {!activeProject ? <section className="sample-workspace" id="sample" aria-labelledby="sample-heading">
            <header className="sample-toolbar"><h2 id="sample-heading">One photo. Four views.</h2><span><Sparkle size={14} /> Free example</span></header>
            <div className="sample-layout">
              <div className="sample-viewer">
                <Image key={angle.id} src={angle.image} sizes="(max-width: 600px) 100vw, (max-width: 1050px) 65vw, 50vw" alt={`Sample result: linen doll, ${angle.label.toLowerCase()} view`} loading="eager" fetchPriority="high" />
                <span className="sample-view-label">{angle.label} view</span>
                <span className="sample-angle"><ArrowsClockwise size={14} /> {angle.rotation}</span>
              </div>
              <div className="sample-angle-rail">
                <p className="sample-rail-heading">Choose<br />{" "}<em>an angle.</em></p>
                <div className="sample-angle-options" role="group" aria-label="Explore sample angles">
                  {sampleAngles.map((item) => <button key={item.id} className={angle.id === item.id ? "is-selected" : ""} aria-pressed={angle.id === item.id} onClick={() => setAngle(item)}>
                    <Image src={item.image} sizes="110px" alt="" />
                    <span>{item.label}</span>{angle.id === item.id ? <Check size={13} weight="bold" /> : <span className="angle-option-degree">{item.rotation}</span>}
                  </button>)}
                </div>
                <span className="home-handwritten sample-try-note">Try each view.</span>
              </div>
            </div>
            <div className="sample-bottom-bar"><span>YOUR PHOTO IN. NEW ANGLES OUT.</span><span>01 — 04</span></div>
            <p className="sample-disclosure">Pre-made sample images. Switching views uses no credits. Unseen product details are estimates.</p>
          </section> : null}
        </div>

        {activeProject ? <section className="home-active-studio" ref={studioRef} id="studio">
          <ProjectStudioClient key={activeProject.id} initialProject={activeProject} checkoutAvailable={credits?.demoCheckoutAvailable ?? false} onBack={closeProject} onOpenWallet={() => void openWallet()} onBalanceChange={refreshBalance} walletRevision={walletRevision} />
        </section> : null}

        <section className="home-next-step" aria-labelledby="next-step-title">
          <div className="home-next-heading"><p className="home-eyebrow">READY TO TRY YOUR OWN PRODUCT?</p><h2 id="next-step-title">Your next shoot<br /><em>starts with a photo.</em></h2></div>
          <div className="home-next-copy"><p>Upload your photo, choose your angles, and review the credit cost before generating. Download the results when you’re happy.</p><span><ShieldCheck size={14} /> Your originals stay private.</span></div>
          <button className="home-primary-button home-next-upload" onClick={() => void startShoot()} disabled={busy !== null}><span>{busy === "shoot" ? "Opening upload…" : "Upload a photo"}</span>{busy === "shoot" ? <SpinnerGap className="spin" size={18} /> : <ArrowRight size={18} />}</button>
        </section>
        <div className="home-build-note"><span>THE TEST STUDIO</span><p>Begin with 1,000 fake credits. No payment required. Real billing is coming later.</p></div>

        {walletOpen && credits ? <section className="home-wallet" id="wallet" ref={walletRef} aria-label="Inline wallet">
          <button className="home-panel-close" onClick={closeWallet}><X size={17} /> Close wallet</button>
          {walletActivity === null ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Loading your wallet…</p> : <AccountClient initialCredits={credits} initialActivity={walletActivity} displayName="Your private workspace" email="Saved in this browser" isDemo onCreditsChange={(updated) => { setCredits(updated); setWalletRevision((value) => value + 1); }} />}
        </section> : null}

        {busy === "project" ? <p className="home-loading" role="status"><SpinnerGap className="spin" /> Opening your shoot…</p> : null}

        {credits ? <ProjectsClient key={projects.map((project) => `${project.id}:${project.updatedAt}:${project.originalCount}:${project.generatedCount}`).join(",")} initialProjects={projects} onOpenProject={openProject} createOpen={createOpen} onCreateClose={() => setCreateOpen(false)} /> : <section className="home-saved-empty" id="shoots"><div><p className="home-eyebrow">YOUR PRODUCT LIBRARY</p><h2>Keep every angle together.</h2><p>Your original photos and generated images, saved in one private workspace.</p></div><button className="button secondary-button" onClick={() => void startShoot()} disabled={busy !== null}>Upload a product photo <ArrowRight size={17} /></button></section>}
      </main>
      <footer className="home-footer"><span>© {new Date().getFullYear()} Reshoot</span><span>A little less setup. A little more possibility.</span><a href={activeProject ? "#studio" : "#sample"}>Back to the studio ↑</a></footer>
    </div>
  );
}
