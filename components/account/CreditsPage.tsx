"use client";

import { SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { AccountClient } from "./AccountClient";
import { apiRequest } from "@/lib/client/api";
import type { CreditLedgerEntry, CreditSummary } from "@/lib/api/types";

export function CreditsPage({ isDemo, onCreditsChange }: {
  isDemo: boolean;
  onCreditsChange?: (credits: CreditSummary) => void;
}) {
  const [wallet, setWallet] = useState<{ credits: CreditSummary; activity: CreditLedgerEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      apiRequest<{ credits: CreditSummary }>("/api/account/credits"),
      apiRequest<{ activity: CreditLedgerEntry[] }>("/api/account/activity"),
    ]).then(([{ credits }, { activity }]) => {
      if (!cancelled) setWallet({ credits, activity });
    }).catch(() => {
      if (!cancelled) setError("Your plan could not load. Please try again.");
    });
    return () => { cancelled = true; };
  }, [attempt]);

  if (error) return <div className="account-credits-status" role="alert">
    <p>{error}</p>
    <button className="button" onClick={() => { setError(null); setAttempt((value) => value + 1); }}>Try again</button>
  </div>;
  if (!wallet) return <p className="account-credits-status" role="status"><SpinnerGap className="spin" /> Loading your plan…</p>;

  return <AccountClient initialCredits={wallet.credits} initialActivity={wallet.activity} isDemo={isDemo} onCreditsChange={onCreditsChange} />;
}
