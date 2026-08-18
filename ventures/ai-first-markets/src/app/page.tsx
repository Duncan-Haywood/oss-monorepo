import Link from "next/link";
import { IdeaCard } from "@/components/IdeaCard";
import { ReportCard } from "@/components/ReportCard";
import { StatCard } from "@/components/StatCard";
import { reports } from "@/data/reports";
import { buildPortfolioSummary } from "@/lib/evaluation";

export default function DashboardPage() {
  const summary = buildPortfolioSummary();

  return (
    <div className="space-y-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          AI-First Markets · Solo Founder Intelligence
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Find the right markets, then choose the right business
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          A market-selection framework combined with concrete business ideas,
          scored for AI leverage, zero-employee operations, and realistic paths
          to $100k and $1M ARR.
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ideas Evaluated"
          value={summary.totalIdeas}
          subtext="Across 6 categories"
          accent="emerald"
        />
        <StatCard
          label="Strong $100k Fits"
          value={summary.strong100k}
          subtext="Verdict: strong"
          accent="sky"
        />
        <StatCard
          label="Strong $1M Fits"
          value={summary.strong1m}
          subtext="Verdict: strong"
          accent="amber"
        />
        <StatCard
          label="Operating Model"
          value="0"
          subtext="Employees — AI + software only"
          accent="zinc"
        />
      </div>

      <section className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-6">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          Start with the market
        </p>
        <h2 className="mt-2 text-xl font-semibold text-zinc-100">
          Seven signals identify work that AI can turn from labor into software
        </h2>
        <p className="mt-3 max-w-3xl text-zinc-400">
          Look for high labor cost, messy inputs, rules plus judgment,
          fragmented buyers, weak workflow software, measurable ROI, and an
          existing distribution channel. Then use the idea reports below to
          evaluate a specific wedge.
        </p>
        <Link
          href="/market-map"
          className="mt-4 inline-flex text-sm font-medium text-emerald-400 hover:text-emerald-300"
        >
          Explore the AI-first market map →
        </Link>
      </section>

      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">
            Top picks for $100k ARR
          </h2>
          <Link
            href="/reports/path-to-100k"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Full report →
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.top100k.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} milestone="100k" />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-100">
            Top picks for $1M ARR
          </h2>
          <Link
            href="/reports/path-to-1m"
            className="text-sm text-emerald-400 hover:text-emerald-300"
          >
            Full report →
          </Link>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {summary.top1m.map((idea) => (
            <IdeaCard key={idea.id} idea={idea} milestone="1m" />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-6 text-xl font-semibold text-zinc-100">Reports</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {reports.map((report) => (
            <ReportCard key={report.slug} report={report} />
          ))}
        </div>
      </section>
    </div>
  );
}
