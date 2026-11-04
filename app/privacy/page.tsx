import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/LegalPage";
import { privacyPolicy } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy | Reshoot",
  description: privacyPolicy.description,
  alternates: { canonical: "/privacy" },
  openGraph: { title: "Privacy policy | Reshoot", description: privacyPolicy.description, url: "/privacy" },
};

export default function PrivacyPage() {
  return <LegalPage document={privacyPolicy} />;
}
