import type { Metadata } from "next";
import { getPublicSiteConfig } from "@/lib/site-config";
import { LegalPage } from "@/components/legal-page";
import { Shield } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  return {
    title: `隐私政策 - ${config.siteName}`,
    description: `${config.siteName} 的隐私政策`,
  };
}

export default function PrivacyPage() {
  return (
    <LegalPage
      field="privacyPolicy"
      title="隐私政策"
      icon={<Shield className="h-6 w-6 text-primary" />}
    />
  );
}
