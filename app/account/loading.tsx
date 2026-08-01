import { AppShell } from "@/components/AppShell";

export default function AccountLoading() {
  return (
    <AppShell>
      <main className="product-main account-page" aria-busy="true">
        <div className="page-kicker">Account & credits</div>
        <div className="skeleton-heading" />
        <div className="account-metrics loading-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="metric-card skeleton-card" key={index} />
          ))}
        </div>
      </main>
    </AppShell>
  );
}
