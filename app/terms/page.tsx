import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { termsOfService } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of service | Reshoot",
  description: termsOfService.description,
  alternates: { canonical: "/terms" },
  openGraph: { title: "Terms of service | Reshoot", description: termsOfService.description, url: "/terms" },
};

export default function TermsPage() {
  return <LegalPage document={termsOfService} />;
}
