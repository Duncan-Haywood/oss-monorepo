import WatchTool from "@/components/WatchTool";
import Disclaimers from "@/components/Disclaimers";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-4 py-12">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Vendor Watch</p>
        <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
          Know when a vendor quietly changes its terms
        </h1>
        <p className="text-base text-slate-600">
          For security, procurement, and privacy practitioners who need to know when a
          vendor&rsquo;s terms of service, privacy policy, or subprocessor list changes — and
          who don&rsquo;t have time to re-read every vendor&rsquo;s page on a schedule. Paste a
          public URL below, check it now, and check it again later. Vendor Watch stores a
          snapshot and shows you a timestamped, source-linked diff of exactly what moved.
        </p>
      </header>

      <section aria-labelledby="tool-heading" className="space-y-3">
        <h2 id="tool-heading" className="text-lg font-semibold text-slate-800">
          Check a page now
        </h2>
        <WatchTool />
      </section>

      <section aria-labelledby="how-heading" className="space-y-2 text-sm text-slate-600">
        <h2 id="how-heading" className="text-lg font-semibold text-slate-800">
          How it works
        </h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Paste the public URL of a vendor&rsquo;s terms, privacy, or subprocessor page.</li>
          <li>
            The first check captures a snapshot: the page text, a fetch timestamp, and the HTTP
            status.
          </li>
          <li>
            Check the same URL again later (a day, a week, whenever you want) and Vendor Watch
            fetches it fresh, compares it against the stored snapshot, and shows a word-level
            diff — or tells you plainly that nothing changed, or that the fetch failed and the
            result is inconclusive.
          </li>
        </ol>
        <p>
          Vendor Watch does not run on a schedule — every check is triggered by a visitor. There
          is no email alert and no background monitoring in this version; see the README for why.
        </p>
      </section>

      <section aria-labelledby="disclaimers-heading">
        <h2 id="disclaimers-heading" className="sr-only">
          Disclaimers
        </h2>
        <Disclaimers />
      </section>

      <footer className="border-t border-slate-200 pt-6">
        <Disclaimers compact />
        <p className="mt-4 text-xs text-slate-400">
          Vendor Watch is a free, no-account demo tool. Usage is tracked anonymously (page
          views and check outcomes only — no personal data, no cookies) to help decide what to
          build next.
        </p>
      </footer>
    </main>
  );
}
