// Pure accounting rules, shared by generation reservations and settlement.
export function spendableBalance(account: { availableCredits: number; monthlyAvailableCredits?: number; monthlyPeriodEnd?: Date | null }, now = new Date()) {
  return account.availableCredits - (account.monthlyPeriodEnd && account.monthlyPeriodEnd <= now ? account.monthlyAvailableCredits ?? 0 : 0);
}

export function refundableCredits(job: { quotedCredits: number; monthlyCredits?: number; monthlyPeriodEnd?: Date | null }, currentPeriodEnd: Date | null | undefined, now = new Date()) {
  const monthly = job.monthlyCredits ?? 0;
  const restoreMonthly = monthly > 0 && !!job.monthlyPeriodEnd && job.monthlyPeriodEnd > now
    && job.monthlyPeriodEnd.getTime() === currentPeriodEnd?.getTime();
  return { total: job.quotedCredits - monthly + (restoreMonthly ? monthly : 0), monthly: restoreMonthly ? monthly : 0 };
}
