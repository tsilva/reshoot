"use client";

import { ArrowRight, Camera, Check, CheckCircle, ClockCounterClockwise, Info, SpinnerGap, Stack, WarningCircle, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CreditLedgerEntry, CreditSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";
import { MONTHLY_PLANS, TERMINAL_SUBSCRIPTION_STATUSES } from "@/lib/subscriptions/catalog";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function CheckoutReturn({ sessionId, legacy, onComplete, onClose }: {
  sessionId: string; legacy: boolean; onComplete: (credits: CreditSummary) => void; onClose: () => void;
}) {
  const [state, setState] = useState("pending");
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    async function check() {
      try {
        const endpoint = legacy ? "stripe-checkouts" : "subscription-checkouts";
        const result = await apiRequest<{ status: string; credits: CreditSummary }>(`/api/account/${endpoint}/${encodeURIComponent(sessionId)}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (result.status === "complete") { onComplete(result.credits); setState("complete"); }
        else if (result.status !== "pending") setState(result.status);
        else if (++polls >= 10) setState("waiting");
        else timer = setTimeout(() => void check(), 2000);
      } catch (error) {
        if (!controller.signal.aborted) { setState("error"); setMessage(error instanceof Error ? error.message : "Confirmation could not be checked."); }
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, legacy, attempt, onComplete]);
  const complete = state === "complete";
  const pending = state === "pending" || state === "waiting";
  return <section className="subscription-return" aria-labelledby="subscription-return-title" aria-live="polite">
    {complete ? <CheckCircle size={40} /> : pending ? <SpinnerGap size={36} className={state === "pending" ? "spin" : undefined} /> : <WarningCircle size={36} />}
    <h3 id="subscription-return-title">{complete ? legacy ? "Your balance is ready" : "Your monthly allowance is ready" : pending ? "Waiting for payment confirmation" : state === "expired" ? "Checkout expired" : "Confirmation unavailable"}</h3>
    <p>{complete ? "Your account has been updated. No real money was charged in test mode." : pending ? "Your allowance appears after Stripe confirms payment. You can close this panel and return later." : message ?? "No allowance has been added. Return to your plan to try again."}</p>
    {state === "waiting" || state === "error" ? <button className="button" onClick={() => { setState("pending"); setAttempt(value => value + 1); }}>Check again</button> : null}
    <button className="button" onClick={onClose}>{complete ? "Done" : "Back to plans"}</button>
  </section>;
}

export function AccountClient({ initialCredits, initialActivity, isDemo, onCreditsChange }: {
  initialCredits: CreditSummary; initialActivity: CreditLedgerEntry[]; isDemo: boolean;
  onCreditsChange?: (credits: CreditSummary) => void;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [activity, setActivity] = useState(initialActivity);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [returnState, setReturnState] = useState(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("subscription_checkout") ?? params.get("stripe_checkout");
    return sessionId ? { sessionId, legacy: !params.has("subscription_checkout") } : null;
  });
  const submitting = useRef(false);
  const checkoutKeys = useRef(new Map<string, string>());
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = credits.subscription;
  const plans = summary?.plans ?? MONTHLY_PLANS;
  const current = summary?.current;
  const currentPlan = plans.find(plan => plan.slug === current?.planSlug);
  const hasSubscription = !!current && !TERMINAL_SUBSCRIPTION_STATUSES.includes(current.status);
  const monthly = credits.monthlyAvailableCredits ?? 0;
  const legacyCredits = credits.availableCredits - monthly;
  const paidThrough = credits.monthlyPeriodEnd;
  const hasPaidPeriod = !!paidThrough && new Date(paidThrough) > new Date();
  const testMode = summary?.testMode ?? isDemo;

  const checkoutComplete = useCallback((updated: CreditSummary) => {
    setCredits(updated);
    onCreditsChange?.(updated);
    void apiRequest<{ activity: CreditLedgerEntry[] }>("/api/account/activity")
      .then(result => setActivity(result.activity)).catch(() => {});
  }, [onCreditsChange]);

  // Refresh the allowance at its actual boundary even if the panel stays open.
  useEffect(() => {
    if (!paidThrough) return;
    const delay = new Date(paidThrough).getTime() - Date.now();
    if (delay <= 0 || delay > 2_147_000_000) return;
    const timer = setTimeout(() => {
      void apiRequest<{ credits: CreditSummary }>("/api/account/credits")
        .then(result => checkoutComplete(result.credits)).catch(() => setError("Reopen Plan & usage to refresh your allowance."));
    }, delay + 100);
    return () => clearTimeout(timer);
  }, [paidThrough, checkoutComplete]);

  function closeReturn() {
    const url = new URL(window.location.href);
    url.searchParams.delete("stripe_checkout");
    url.searchParams.delete("subscription_checkout");
    window.history.replaceState(window.history.state, "", url);
    setReturnState(null);
    requestAnimationFrame(() => heading.current?.focus());
  }

  async function openStripe(planSlug?: string) {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(planSlug ?? "portal");
    setError(null);
    try {
      const key = planSlug ? checkoutKeys.current.get(planSlug) ?? crypto.randomUUID() : null;
      if (planSlug && key) checkoutKeys.current.set(planSlug, key);
      const result = await apiRequest<{ url: string }>(`/api/account/${planSlug ? "subscription-checkouts" : "subscription-portal"}`, {
        method: "POST", body: JSON.stringify({ returnPath: window.location.pathname, ...(planSlug ? { planSlug, idempotencyKey: key } : {}) }),
      });
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== (planSlug ? "checkout.stripe.com" : "billing.stripe.com") || url.username || url.password) throw new Error("Stripe returned an invalid destination.");
      window.location.assign(url.href);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Subscription settings could not open.");
      setBusy(null);
      submitting.current = false;
    }
  }

  return <section className="account-page account-credits-page subscription-page">
    <header className="subscription-heading">
      <h2 ref={heading} tabIndex={-1}>Plan &amp; usage</h2>
      <p>A monthly plan for your next product shoot.</p>
    </header>
    {error ? <div className="inline-notice error-notice" role="alert"><WarningCircle size={18} />{error}</div> : null}
    {returnState?.sessionId === "cancelled" ? <div className="inline-notice" role="status">Checkout was cancelled. Your plan has not changed.<button className="icon-button" aria-label="Dismiss checkout notice" onClick={closeReturn}><X size={18} /></button></div> : null}
    {returnState && returnState.sessionId !== "cancelled" ? <CheckoutReturn {...returnState} onComplete={checkoutComplete} onClose={closeReturn} /> : <>
      <div className="subscription-status">
        <strong>{hasSubscription ? `${currentPlan?.name ?? "Monthly"} plan` : "No active plan"}</strong>
        <span>{current?.cancelAtPeriodEnd ? current.periodEnd ? `Ends ${formatDate(current.periodEnd)}` : "Cancellation scheduled"
          : current?.status === "past_due" || current?.status === "unpaid" ? "Payment needs attention"
          : hasSubscription && !hasPaidPeriod ? "Awaiting payment confirmation"
          : hasSubscription && current?.periodEnd ? `Renews ${formatDate(current.periodEnd)}` : "Choose a plan to start creating."}</span>
        {hasSubscription || summary?.portalAvailable ? <button className="subscription-manage" disabled={!summary?.portalAvailable || busy !== null} onClick={() => void openStripe()}>{busy === "portal" ? "Opening Stripe…" : "Manage subscription"}<ArrowRight size={16} /></button> : null}
      </div>
      {hasPaidPeriod || credits.availableCredits > 0 || credits.heldCredits > 0 ? <section className="subscription-usage" aria-label="Your allowance">
        <div><span>Monthly credits remaining</span><strong>{monthly.toLocaleString()}{hasPaidPeriod && currentPlan ? <small> / {currentPlan.credits.toLocaleString()}</small> : null}</strong></div>
        {hasPaidPeriod && currentPlan ? <progress aria-label="Monthly credits remaining" max={currentPlan.credits} value={monthly} /> : null}
        {paidThrough && hasPaidPeriod ? <p>{current?.cancelAtPeriodEnd || !hasSubscription ? "Available until" : "Allowance resets"} {formatDate(paidThrough)} · Unused monthly credits expire</p> : null}
        {legacyCredits > 0 ? <p>{legacyCredits.toLocaleString()} existing one-time credits · Do not expire</p> : null}
        {credits.heldCredits > 0 ? <p>{credits.heldCredits.toLocaleString()} credits reserved for running generations</p> : null}
      </section> : null}
      <section className="subscription-options" aria-labelledby="monthly-plans-title">
        <h3 id="monthly-plans-title">Find your monthly plan</h3>
        <p>All plans include the same image quality. Choose how much you create.</p>
        <div className="subscription-grid">
          {plans.map(plan => {
            const recommended = plan.slug === "studio";
            const selected = hasSubscription && current?.planSlug === plan.slug;
            return <article key={plan.slug} className={`subscription-card${recommended ? " is-best-value" : ""}`} aria-labelledby={`plan-${plan.slug}`}>
              {plan.badge ? <span className={`subscription-badge${recommended ? " is-best-value" : ""}`}>{plan.badge}</span> : null}
              <h4 id={`plan-${plan.slug}`}>{plan.name}</h4><p className="subscription-description">{plan.description}</p>
              <p className="subscription-price"><strong>${plan.usd}</strong><span>/ month</span></p>
              <div className="subscription-allowance"><Stack size={20} /><span><strong>{plan.credits.toLocaleString()} credits</strong> / month</span></div>
              <div className="subscription-shots"><Camera size={20} /><span>About {Math.floor(plan.credits / 70)}–{Math.floor(plan.credits / 40)} shots</span></div>
              <p className="subscription-value">{recommended ? "4× Starter’s credits for under 2× the price" : ""}</p>
              <button className={`button subscription-choose${recommended ? " is-best-value" : ""}`} disabled={hasSubscription || !summary?.checkoutAvailable || busy !== null} onClick={() => void openStripe(plan.slug)}>
                {selected ? "Current plan" : busy === plan.slug ? <>Opening Stripe… <SpinnerGap className="spin" /></> : <>Choose {plan.name}{recommended ? <ArrowRight size={18} /> : null}</>}
              </button>
            </article>;
          })}
        </div>
      </section>
      <ul className="subscription-features"><li><Check size={20} />High-quality images</li><li><Check size={20} />Private projects</li><li><Check size={20} />Full-resolution downloads</li></ul>
      <div className="subscription-expiry"><Info size={21} /><p>Credits reset each billing month. Unused monthly credits do not roll over.</p></div>
      <div className="subscription-terms"><p>Each shot uses 40–70 credits, depending on its references.</p><p>Renews monthly. Cancel anytime; access continues until the end of your paid period.</p></div>
      {testMode ? <p className="subscription-test-note">Test mode · No real money is charged.</p> : null}
      {!summary?.checkoutAvailable ? <p className="subscription-availability" role="status">Monthly subscriptions are not available yet.</p> : null}
      {hasSubscription && !summary?.portalAvailable ? <p className="subscription-availability" role="status">Subscription management is temporarily unavailable. Please contact support.</p> : null}
      {activity.length ? <details className="subscription-history"><summary><ClockCounterClockwise size={18} /> Credit activity</summary><div className="activity-table" role="table" aria-label="Credit activity">{activity.map(entry => <div className="activity-row" role="row" key={entry.id}><div role="cell"><strong>{entry.description}</strong><span>{formatDate(entry.createdAt)}</span></div><strong role="cell">{entry.availableDelta !== undefined ? `${entry.availableDelta > 0 ? "+" : ""}${entry.availableDelta.toLocaleString()}` : `${entry.type === "grant" || entry.type === "release" ? "+" : "−"}${entry.amountCredits.toLocaleString()}`}</strong></div>)}</div></details> : null}
    </>}
  </section>;
}
