"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";

export function Footer() {
  const { data: config } = trpc.site.getConfig.useQuery();
  
  const siteName = config?.siteName || "Mikiacg";
  const footerLinks = config?.footerLinks || [];
  const icpBeian = config?.icpBeian;
  const publicSecurityBeian = config?.publicSecurityBeian;

  return (
    <footer className="border-t bg-background">
      <div className="container py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <p>© {new Date().getFullYear()} {siteName}</p>
            {icpBeian && (
              <a 
                href="https://beian.miit.gov.cn/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {icpBeian}
              </a>
            )}
            {publicSecurityBeian && (
              <a 
                href="https://www.beian.gov.cn/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {publicSecurityBeian}
              </a>
            )}
          </div>
          <div className="flex items-center gap-4">
            <Link href="/feed.xml" className="hover:text-foreground transition-colors">
              RSS
            </Link>
            <Link href="/llms.txt" className="hover:text-foreground transition-colors">
              llms.txt
            </Link>
            <Link href="/sitemap.xml" className="hover:text-foreground transition-colors">
              Sitemap
            </Link>
            <a 
              href="https://github.com/AdingApkgg/mikiacg" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:text-foreground transition-colors"
            >
              GitHub
            </a>
            {/* 自定义页脚链接 */}
            {footerLinks.map((link, index) => (
              <a 
                key={index}
                href={link.url}
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
        {/* 自定义页脚文本 */}
        {config?.footerText && (
          <div 
            className="mt-2 text-xs text-muted-foreground text-center"
            dangerouslySetInnerHTML={{ __html: config.footerText }}
          />
        )}
      </div>
    </footer>
  );
}
