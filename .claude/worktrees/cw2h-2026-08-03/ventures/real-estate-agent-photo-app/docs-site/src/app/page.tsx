import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { DocsShell } from "@/components/DocsShell";
import { getDocPages } from "@/lib/docs";

export default function HomePage() {
  const pages = getDocPages();

  return (
    <DocsShell pages={pages}>
      <div className="space-y-8">
        <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs text-brand-200">
            <Lock className="h-3.5 w-3.5" />
            Private — Cloudflare Access
          </div>
          <h1 className="font-display text-4xl font-semibold text-white">Listing Lens Docs</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-300">
            Internal documentation for the Listing Lens real estate photography product. This site
            deploys to Cloudflare Pages and is gated by Cloudflare Access with a single-email
            allowlist.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {pages.map((page) => (
            <Link
              key={page.slug}
              href={`/docs/${page.slug}/`}
              className="group rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition-colors hover:border-brand-500/40 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-white group-hover:text-brand-200">
                    {page.title}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">{page.description}</p>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-400" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </DocsShell>
  );
}
