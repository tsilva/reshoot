import type { Metadata } from "next";
import { StudioPage } from "@/components/StudioPage";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ wallet?: string | string[] }>;
}) {
  const [{ projectId }, { wallet }] = await Promise.all([params, searchParams]);
  return <StudioPage projectId={projectId} walletOpen={wallet === "open"} />;
}
