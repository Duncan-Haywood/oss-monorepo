import type { ReactNode } from "react";
import Link from "next/link";
import { BookOpen, Lock } from "lucide-react";

import type { DocPage } from "@/lib/docs";

type DocsShellProps = {
  pages: DocPage[];
  activeSlug?: string;
  children: ReactNode;
};

export function DocsShell({ pages, activeSlug, children }: DocsShellProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/20 text-brand-300">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-white">Listing Lens</p>
              <p className="text-xs text-slate-400">Private documentation</p>
            </div>
          </Link>
          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5 text-brand-400" />
            Cloudflare Access
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Documentation
          </p>
          <nav className="space-y-1">
            {pages.map((page) => {
              const isActive = page.slug === activeSlug;
              return (
                <Link
                  key={page.slug}
                  href={`/docs/${page.slug}/`}
                  className={[
                    "block rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-brand-600/15 text-brand-200"
                      : "text-slate-400 hover:bg-slate-900 hover:text-slate-200",
                  ].join(" ")}
                >
                  {page.title}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main>{children}</main>
      </div>
    </div>
  );
}
