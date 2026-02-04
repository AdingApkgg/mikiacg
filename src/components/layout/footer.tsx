import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container py-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Mikiacg</p>
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
          </div>
        </div>
      </div>
    </footer>
  );
}
