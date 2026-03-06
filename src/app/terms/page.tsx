import type { Metadata } from "next";
import { getPublicSiteConfig } from "@/lib/site-config";
import { LegalPage } from "@/components/legal-page";
import { FileText } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  return {
    title: `服务条款 - ${config.siteName}`,
    description: `${config.siteName} 的服务条款`,
  };
}

export default function TermsPage() {
  return (
    <LegalPage
      field="termsOfService"
      title="服务条款"
      icon={<FileText className="h-6 w-6 text-primary" />}
    />
  );
}
