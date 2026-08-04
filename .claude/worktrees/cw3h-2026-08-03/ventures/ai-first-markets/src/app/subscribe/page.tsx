import { NewsletterSubscription } from "@/components/NewsletterSubscription";

export default function SubscribePage() {
  return (
    <div className="space-y-12 max-w-4xl mx-auto py-6">
      <header className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          Market Intelligence & Research
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Actionable AI Market Reports for Solo Founders
        </h1>
        {/*
          No subscriber count, testimonial or "join N founders" claim belongs
          here until there is a list to count. This describes the reports.
        */}
        <p className="mt-4 text-lg text-zinc-400 max-w-2xl mx-auto">
          Software-first opportunities, quantitative labor-to-code leverage scores, and
          zero-employee business plans, for founders and researchers evaluating where AI actually
          moves a market.
        </p>
      </header>

      <NewsletterSubscription initialTier="premium_29" />

      <section className="grid gap-6 sm:grid-cols-3 pt-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="font-semibold text-zinc-100">7 Signal Framework</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Identify exact verticals where AI turns expensive human labor into high-margin software services.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="font-semibold text-zinc-100">Path to $100k & $1M</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Detailed timelines, pricing models, customer counts, and tech stacks tailored for solo operators.
          </p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
          <h3 className="font-semibold text-zinc-100">Weekly Sector Deep Dives</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Fresh data and market analysis on developer tools, ecommerce QA, trades automation, and content engines.
          </p>
        </div>
      </section>
    </div>
  );
}
