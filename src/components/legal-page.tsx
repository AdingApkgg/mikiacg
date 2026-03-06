import { getPublicSiteConfig } from "@/lib/site-config";
import { MdxContent } from "@/components/mdx/mdx-remote";
import { FileText } from "lucide-react";
import { notFound } from "next/navigation";

interface LegalPageProps {
  field: "privacyPolicy" | "termsOfService" | "aboutPage";
  title: string;
  icon?: React.ReactNode;
}

export async function LegalPage({ field, title, icon }: LegalPageProps) {
  const config = await getPublicSiteConfig();
  const content = config[field];

  if (!content) notFound();

  return (
    <div className="container max-w-3xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        {icon || <FileText className="h-6 w-6 text-primary" />}
        <h1 className="text-2xl font-bold">{title}</h1>
      </div>
      <div className="rounded-xl border bg-card p-6 md:p-8">
        <MdxContent source={content} />
      </div>
    </div>
  );
}
