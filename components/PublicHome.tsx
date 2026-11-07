import { StudioHome } from "@/components/StudioHome";

export function PublicHome() {
  return <StudioHome key="signed-out" initialCredits={null} initialProjects={[]} currentUser={null} />;
}
