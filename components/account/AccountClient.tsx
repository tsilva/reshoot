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
import { useMemo, useState } from "react";
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
  displayName,
  email,
}: {
  initialCredits: CreditSummary;
  initialActivity: CreditLedgerEntry[];
  displayName: string;
  email: string;
}) {
  const [credits, setCredits] = useState(initialCredits);
  const [activity, setActivity] = useState(initialActivity);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("confirm");
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedPack = useMemo(
    () => credits.packs.find((pack) => pack.slug === selectedSlug) ?? null,
    [credits.packs, selectedSlug],
  );

  function openCheckout(slug: string) {
    setSelectedSlug(slug);
    setCheckoutStep("confirm");
    setError(null);
  }

  function closeCheckout() {
    if (checkingOut) return;
    setSelectedSlug(null);
    setCheckoutStep("confirm");
    setError(null);
  }

  async function checkout() {
    if (!selectedPack) return;
    setCheckingOut(true);
    setError(null);
    try {
      const response = await apiRequest<{ credits: CreditSummary }>(
        "/api/account/demo-checkouts",
        {
          method: "POST",
          body: JSON.stringify({
            packSlug: selectedPack.slug,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const latestActivity = await apiRequest<{ activity: CreditLedgerEntry[] }>(
        "/api/account/activity",
      );
      setCredits(response.credits);
      setActivity(latestActivity.activity);
      setCheckoutStep("success");
    } catch (checkoutError) {
      setError(
        checkoutError instanceof Error
          ? checkoutError.message
          : "Credits could not be added.",
      );
    } finally {
      setCheckingOut(false);
    }
  }

  return (
    <main className="product-main account-page">
      <header className="page-heading-row account-heading">
        <div>
          <div className="page-kicker">Account & credits</div>
          <h1>Your account</h1>
          <p className="page-lede">Manage purchase credits and review every balance change.</p>
        </div>
        <div className="account-identity">
          <strong>{displayName}</strong>
          <span>{email}</span>
        </div>
      </header>

      <section className="account-metrics" aria-label="Credit balance">
        <article className="metric-card balance-card">
          <Coins size={24} weight="duotone" />
          <span>Available credits</span>
          <strong>{credits.availableCredits.toLocaleString()}</strong>
          <small>${credits.purchaseValueUsd.toFixed(2)} purchase value</small>
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
          Credits are non-redeemable purchase value: {credits.creditsPerUsd} credits = $1.
          They do not expire. A shot uses 40–70 credits depending on its references.
        </p>
      </div>

      <section className="account-section">
        <div className="section-heading-row">
          <div>
            <div className="page-kicker">Credit packs</div>
            <h2>Choose the right runway</h2>
            <p>Every pack keeps the same simple exchange rate with no expiring bonus credits.</p>
          </div>
          {credits.demoCheckoutAvailable ? (
            <span className="test-mode-label">No-charge test checkout</span>
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
            <WarningCircle size={19} /> Production credit purchasing is not available yet.
          </div>
        ) : null}
      </section>

      <section className="account-section activity-section">
        <div className="section-heading-row">
          <div>
            <div className="page-kicker">Immutable ledger</div>
            <h2>Credit activity</h2>
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

      {selectedPack ? (
        <div className="modal-backdrop" role="presentation">
          <section className="checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
            <button className="icon-button checkout-close" onClick={closeCheckout} aria-label="Close checkout">
              <X size={20} />
            </button>
            {checkoutStep === "confirm" ? (
              <>
                <div className="checkout-icon"><CreditCard size={28} /></div>
                <div className="page-kicker">No-charge test checkout</div>
                <h2 id="checkout-title">Confirm {selectedPack.name}</h2>
                <p>
                  This test flow does not charge a card. It immediately adds credits to the
                  seeded demo account.
                </p>
                <div className="checkout-total">
                  <div><span>Credits</span><strong>{selectedPack.credits.toLocaleString()}</strong></div>
                  <div><span>Displayed value</span><strong>${selectedPack.usd}.00</strong></div>
                  <div><span>Amount charged</span><strong>$0.00</strong></div>
                </div>
                {error ? <div className="inline-notice error-notice"><WarningCircle size={18} /> {error}</div> : null}
                <button className="button primary-button checkout-button" onClick={() => void checkout()} disabled={checkingOut}>
                  {checkingOut ? <SpinnerGap className="spin" /> : null}
                  {checkingOut ? "Adding credits…" : "Add credits to account"}
                </button>
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
        </div>
      ) : null}
    </main>
  );
}
