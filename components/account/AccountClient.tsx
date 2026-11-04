"use client";

import {
  ArrowRight,
  CheckCircle,
  ClockCounterClockwise,
  Coins,
  CreditCard,
  Info,
  LockKey,
  SpinnerGap,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CreditLedgerEntry, CreditSummary } from "@/lib/api/types";
import { apiRequest } from "@/lib/client/api";

type CheckoutStep = "confirm" | "success";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function activitySign(entry: CreditLedgerEntry) {
  if (entry.type === "grant" || entry.type === "release" || entry.type === "adjustment") {
    return "+";
  }
  return "−";
}

export function AccountClient({
  initialCredits,
  initialActivity,
  isDemo,
  onCreditsChange,
}: {
  initialCredits: CreditSummary;
  initialActivity: CreditLedgerEntry[];
  isDemo: boolean;
  onCreditsChange?: (credits: CreditSummary) => void;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [activity, setActivity] = useState(initialActivity);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("confirm");
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [paymentOutcome, setPaymentOutcome] = useState<"succeeded" | "declined">("succeeded");
  const checkoutKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const checkoutRef = useRef<HTMLElement>(null);
  const checkoutTrigger = useRef<HTMLElement | null>(null);
  const selectedPack = useMemo(
    () => credits.packs.find((pack) => pack.slug === selectedSlug) ?? null,
    [credits.packs, selectedSlug],
  );

  useEffect(() => {
    if (selectedSlug) checkoutRef.current?.focus();
  }, [selectedSlug, checkoutStep]);

  function openCheckout(slug: string) {
    checkoutTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    checkoutKey.current = crypto.randomUUID();
    setPaymentOutcome("succeeded");
    setSelectedSlug(slug);
    setCheckoutStep("confirm");
    setError(null);
  }

  function closeCheckout() {
    if (checkingOut) return;
    setSelectedSlug(null);
    setCheckoutStep("confirm");
    setError(null);
    requestAnimationFrame(() => checkoutTrigger.current?.focus());
  }

  async function checkout() {
    if (!selectedPack || !checkoutKey.current || submitting.current || checkoutStep === "success") return;
    submitting.current = true;
    setCheckingOut(true);
    setError(null);
    try {
      const response = await apiRequest<{ credits: CreditSummary }>(
        "/api/account/demo-checkouts",
        {
          method: "POST",
          body: JSON.stringify({
            packSlug: selectedPack.slug,
            idempotencyKey: checkoutKey.current,
            outcome: paymentOutcome,
          }),
        },
      );
      setCredits(response.credits);
      onCreditsChange?.(response.credits);
      setCheckoutStep("success");
      setActivityError(null);
      // Payment stays successful if the separate activity refresh fails.
      try {
        const latestActivity = await apiRequest<{ activity: CreditLedgerEntry[] }>("/api/account/activity");
        setActivity(latestActivity.activity);
      } catch {
        setActivityError("Credits were added. Reload the page to refresh the activity history.");
      }
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Credits could not be added.",
      );
    } finally {
      submitting.current = false;
      setCheckingOut(false);
    }
  }

  return (
    <section className="account-page account-credits-page">
      <header className="page-heading-row account-heading">
        <div>
          <h2>Credits</h2>
          <p className="page-lede">{isDemo ? "Add test credits with a simulated payment. No card is needed and no money is charged." : "Manage purchase credits and review every balance change."}</p>
        </div>
      </header>

      <div hidden={selectedPack !== null}>
      <section className="account-metrics" aria-label="Credit balance">
        <article className="metric-card balance-card">
          <Coins size={24} weight="duotone" />
          <span>Available credits</span>
          <strong>{credits.availableCredits.toLocaleString()}</strong>
          <small>{isDemo ? "Test credits in your account" : `$${credits.purchaseValueUsd.toFixed(2)} purchase value`}</small>
        </article>
        <article className="metric-card">
          <LockKey size={24} weight="duotone" />
          <span>Held credits</span>
          <strong>{credits.heldCredits.toLocaleString()}</strong>
          <small>Reserved while generations run</small>
        </article>
        <article className="metric-card">
          <CreditCard size={24} weight="duotone" />
          <span>Estimated shots</span>
          <strong>
            {credits.estimatedShots.min === credits.estimatedShots.max
              ? credits.estimatedShots.min
              : `${credits.estimatedShots.min}–${credits.estimatedShots.max}`}
          </strong>
          <small>Based on selected references</small>
        </article>
      </section>

      <div className="credit-value-note">
        <Info size={19} />
        <p>
          {isDemo ? "New accounts start with zero credits. Add test credits using a simulated payment below. " : `Credits are non-redeemable purchase value: ${credits.creditsPerUsd} credits = $1. They do not expire. `}
          A shot uses 40–70 credits depending on its references.
        </p>
      </div>

      <section className="account-section">
        <div className="section-heading-row">
          <div>
            <div className="page-kicker">Credit packs</div>
            <h3>Add credits</h3>
            <p>Every pack keeps the same simple exchange rate with no expiring bonus credits.</p>
          </div>
          {credits.demoCheckoutAvailable ? (
            <span className="test-mode-label">Simulated payments · $0 charged</span>
          ) : null}
        </div>
        <div className="pack-grid">
          {credits.packs.map((pack) => (
            <article className={`pack-card${pack.recommended ? " is-recommended" : ""}`} key={pack.slug}>
              {pack.recommended ? <span className="recommended-label">Most useful</span> : null}
              <div>
                <span>{pack.name}</span>
                <strong>{pack.credits.toLocaleString()} credits</strong>
              </div>
              <p>About {Math.floor(pack.credits / 70)}–{Math.floor(pack.credits / 40)} high-quality shots</p>
              <footer>
                <strong>${pack.usd}</strong>
                <button
                  className="button primary-button"
                  disabled={!credits.demoCheckoutAvailable}
                  onClick={() => openCheckout(pack.slug)}
                >
                  Select pack <ArrowRight size={17} />
                </button>
              </footer>
            </article>
          ))}
        </div>
        {!credits.demoCheckoutAvailable ? (
          <div className="inline-notice warning-notice">
            <WarningCircle size={19} /> Credit purchasing is temporarily unavailable. No payment will be taken.
          </div>
        ) : null}
      </section>

      <section className="account-section activity-section">
        {activityError ? <p role="status" className="inline-notice">{activityError}</p> : null}
        <div className="section-heading-row">
          <div>
            <div className="page-kicker">History</div>
            <h3>Credit activity</h3>
          </div>
          <ClockCounterClockwise size={24} />
        </div>
        {activity.length ? (
          <div className="activity-table" role="table" aria-label="Credit activity">
            {activity.map((entry) => (
              <div className="activity-row" role="row" key={entry.id}>
                <div role="cell">
                  <strong>{entry.description}</strong>
                  <span>{formatDate(entry.createdAt)}</span>
                </div>
                <span className={`activity-type activity-${entry.type}`} role="cell">{entry.type}</span>
                <strong role="cell">
                  {activitySign(entry)}{entry.amountCredits.toLocaleString()}
                </strong>
                <span role="cell">{entry.availableAfter.toLocaleString()} available</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="activity-empty">
            <ClockCounterClockwise size={30} weight="thin" />
            <strong>No credit activity yet</strong>
            <span>Purchases, holds, captures, and releases will appear here.</span>
          </div>
        )}
      </section>

      </div>
      {selectedPack ? (
          <section className="checkout-modal" ref={checkoutRef} tabIndex={-1} aria-labelledby="checkout-title" aria-busy={checkingOut || undefined} onKeyDown={(event) => {
            if (event.key === "Escape") { event.stopPropagation(); if (!checkingOut) closeCheckout(); }
          }}>
            <button className="icon-button checkout-close" onClick={closeCheckout} aria-label="Close checkout" disabled={checkingOut}>
              <X size={20} />
            </button>
            {checkoutStep === "confirm" ? (
              <>
                <div className="checkout-icon"><CreditCard size={28} /></div>
                <div className="page-kicker">Simulated checkout</div>
                <h2 id="checkout-title">Buy {selectedPack.name} credits</h2>
                <p>
                  Try the payment flow without entering card details. A successful
                  simulated payment adds test credits to your account.
                </p>
                <div className="checkout-total">
                  <div><span>Credits</span><strong>{selectedPack.credits.toLocaleString()}</strong></div>
                  <div><span>Displayed value</span><strong>${selectedPack.usd}.00</strong></div>
                  <div><span>Amount charged</span><strong>$0.00</strong></div>
                </div>
                <fieldset className="simulated-payment-options" disabled={checkingOut}>
                  <legend>Simulate a payment result</legend>
                  <label><input type="radio" name="payment-outcome" value="succeeded" checked={paymentOutcome === "succeeded"} onChange={() => setPaymentOutcome("succeeded")} /> Payment succeeds</label>
                  <label><input type="radio" name="payment-outcome" value="declined" checked={paymentOutcome === "declined"} onChange={() => setPaymentOutcome("declined")} /> Payment is declined</label>
                </fieldset>
                {error ? <div role="alert" className="inline-notice error-notice"><WarningCircle size={18} /> {error}</div> : null}
                <button className="button primary-button checkout-button" onClick={() => void checkout()} disabled={checkingOut}>
                  {checkingOut ? <SpinnerGap className="spin" /> : null}
                  {checkingOut ? "Simulating payment…" : "Simulate payment · $0.00"}
                </button>
                <button type="button" className="button checkout-cancel" onClick={closeCheckout} disabled={checkingOut}>Cancel</button>
              </>
            ) : (
              <div className="checkout-success">
                <CheckCircle size={50} weight="duotone" />
                <div className="page-kicker">Credits added</div>
                <h2 id="checkout-title">Your balance is ready</h2>
                <p>{selectedPack.credits.toLocaleString()} credits were added without a charge.</p>
                <strong>{credits.availableCredits.toLocaleString()} available credits</strong>
                <button className="button primary-button checkout-button" onClick={closeCheckout}>Done</button>
              </div>
            )}
          </section>
      ) : null}
    </section>
  );
}
