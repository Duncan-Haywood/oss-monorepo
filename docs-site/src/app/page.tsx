import Link from "next/link";
import { listHtmlReports } from "@/lib/html-manifest";
import { guideNav } from "@/lib/navigation";

export default function HomePage() {
  const reports = listHtmlReports();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6 sm:px-6">
          <h1 className="text-2xl font-semibold tracking-tight">ShootFlow Docs</h1>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">
            Private
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-10 sm:px-6">
        <section className="space-y-4">
          <p className="text-lg text-slate-300">
            Internal documentation for product strategy, engineering contracts, and
            commercial viability reports. Guide pages are authored in TSX; standalone HTML
            reports in <code className="text-sky-300">docs/*.html</code> are ingested at build time.
          </p>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
            Guides (TSX)
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {guideNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:border-slate-600"
                >
                  <span className="font-medium text-white">{item.label}</span>
                  {item.description ? (
                    <p className="mt-1 text-sm text-slate-400">{item.description}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
            HTML reports ({reports.length})
          </h2>
          <ul className="space-y-2">
            {reports.map((report) => (
              <li key={report.slug}>
                <Link
                  href={`/docs/reports/${report.slug}`}
                  className="text-sky-400 hover:text-sky-300"
                >
                  {report.title}
                </Link>
                <span className="ml-2 text-xs text-slate-500">{report.sourceFile}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
