import Link from "next/link";

import { DocsShell } from "@/components/DocsShell";
import { getDocPages } from "@/lib/docs";
import { ProcessDashboard } from "../../../../process/prompt_process";

export const metadata = {
  title: "Process — Listing Lens Docs",
  description: "Live agent roadmap, decisions log, and progress log.",
  robots: { index: false, follow: false },
};

export default function ProcessPage() {
  const pages = getDocPages();

  return (
    <DocsShell pages={pages} activeSlug="process">
      <div className="space-y-6">
        <Link href="/" className="text-sm text-slate-500 transition-colors hover:text-slate-300">
          ← Back to docs home
        </Link>
        <div>
          <h1 className="font-display text-4xl font-semibold text-white">Process</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            The live source of truth for how agents progress the Listing Lens business. Backed by{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5 text-sm text-slate-300">process/prompt_process.tsx</code>{" "}
            in the repo root.
          </p>
        </div>
        <ProcessDashboard />
      </div>
    </DocsShell>
  );
}
