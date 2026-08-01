import Link from "next/link";
import { ArrowLeft, FolderDashed } from "@phosphor-icons/react/dist/ssr";
import { AppShell } from "@/components/AppShell";

export default function ProjectNotFound() {
  return (
    <AppShell>
      <main className="product-main deleted-project-state">
        <FolderDashed size={42} weight="thin" />
        <div className="page-kicker">Project unavailable</div>
        <h1>This project was deleted or you don’t have access.</h1>
        <p>Deleted project files are retained for 30 days before cleanup.</p>
        <Link href="/projects" className="button secondary-button">
          <ArrowLeft size={18} /> Back to projects
        </Link>
      </main>
    </AppShell>
  );
}
