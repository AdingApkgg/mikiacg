"use client";

import Link from "next/link";
import { useSiteConfig } from "@/contexts/site-config";

export function Footer() {
  const config = useSiteConfig();
  
  const siteName = config?.siteName || "ACGN Site";
  const footerLinks = config?.footerLinks || [];
  const icpBeian = config?.icpBeian;
  const publicSecurityBeian = config?.publicSecurityBeian;
  const githubUrl = config?.githubUrl;

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
          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-end">
            {config?.privacyPolicy && (
              <Link href="/privacy" className="hover:text-foreground transition-colors">
                隐私政策
              </Link>
            )}
            {config?.termsOfService && (
              <Link href="/terms" className="hover:text-foreground transition-colors">
                服务条款
              </Link>
            )}
            {config?.aboutPage && (
              <Link href="/about" className="hover:text-foreground transition-colors">
                关于
              </Link>
            )}
            <Link href="/links" className="hover:text-foreground transition-colors">
              友链
            </Link>
            <Link href="/feed.xml" className="hover:text-foreground transition-colors">
              RSS
            </Link>
            <Link href="/llms.txt" className="hover:text-foreground transition-colors">
              llms.txt
            </Link>
            <Link href="/sitemap.xml" className="hover:text-foreground transition-colors">
              Sitemap
            </Link>
            {githubUrl && (
              <a 
                href={githubUrl}
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-foreground transition-colors"
              >
                GitHub
              </a>
            )}
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
