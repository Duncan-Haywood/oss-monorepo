import Link from "next/link";

import { DocsShell } from "@/components/DocsShell";
import { getDocPages } from "@/lib/docs";

export default function NotFound() {
  const pages = getDocPages();

  return (
    <DocsShell pages={pages}>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8">
        <h1 className="font-display text-2xl text-white">Page not found</h1>
        <p className="mt-2 text-slate-400">This documentation page does not exist.</p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm text-brand-300 transition-colors hover:text-brand-200"
        >
          Return to docs home
        </Link>
      </div>
    </DocsShell>
  );
}
