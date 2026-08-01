import { AppShell } from "@/components/AppShell";

export default function ProjectsLoading() {
  return (
    <AppShell>
      <main className="product-main" aria-busy="true">
        <div className="page-kicker">Product library</div>
        <div className="skeleton-heading" />
        <div className="project-grid loading-grid">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="project-card skeleton-card" key={index} />
          ))}
        </div>
      </main>
    </AppShell>
  );
}
