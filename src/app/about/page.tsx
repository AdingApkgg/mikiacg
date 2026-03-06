import type { Metadata } from "next";
import { getPublicSiteConfig } from "@/lib/site-config";
import { LegalPage } from "@/components/legal-page";
import { Users } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicSiteConfig();
  return {
    title: `关于我们 - ${config.siteName}`,
    description: `关于 ${config.siteName}`,
  };
}

export default function AboutPage() {
  return (
    <LegalPage
      field="aboutPage"
      title="关于我们"
      icon={<Users className="h-6 w-6 text-primary" />}
    />
  );
}
