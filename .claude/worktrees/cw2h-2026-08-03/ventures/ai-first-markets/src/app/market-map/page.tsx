const criteria = [
  ["High labor cost, low software leverage", "Work is expensive but still performed manually."],
  ["Messy unstructured inputs", "PDFs, email, calls, and spreadsheets are the raw material."],
  ["Rules plus judgment", "AI drafts, classifies, and reconciles; a person approves exceptions."],
  ["Fragmented buyers", "Many SMB and mid-market buyers share the same recurring pain."],
  ["Legacy software records, but does not work", "Incumbents store data without automating the workflow."],
  ["Clear ROI", "Time, headcount, error, or revenue improvements are easy to quantify."],
  ["A distribution wedge", "Trusted accountants, brokers, agencies, or platforms already reach buyers."],
];

const tiers = [
  {
    label: "Tier 1",
    title: "Best near-term fit",
    markets: [
      "Accounting, bookkeeping, and tax",
      "Insurance brokers, MGAs, and claims",
      "Legal operations",
      "Healthcare administration",
      "Staffing, recruiting, and HR operations",
      "Commercial real estate and property management",
    ],
  },
  {
    label: "Tier 2",
    title: "Strong with a narrow workflow",
    markets: [
      "Traditional digital services",
      "Marketing and sales operations",
      "Customer support and vertical BPO replacement",
    ],
  },
  {
    label: "Tier 3",
    title: "Large upside, harder entry",
    markets: [
      "SMB banking and lending",
      "Government and compliance",
      "Construction and field services",
    ],
  },
];

const winningPatterns = [
  "Sell an AI employee, not a generic assistant.",
  "Go vertical rather than horizontal.",
  "Replace a workflow rather than adding a feature.",
  "Design human review around exceptions.",
  "Price against the outcome or labor displaced.",
];

export default function MarketMapPage() {
  return (
    <div className="space-y-12">
      <header className="max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-widest text-emerald-400">
          2025–2026 Opportunity Map
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Target markets where work is labor, not paperwork
        </h1>
        <p className="mt-4 text-lg leading-8 text-zinc-400">
          The best AI-first opportunities are repetitive, judgment-heavy,
          fragmented workflows still sold as labor. Software should replace the
          workflow—not merely digitize its filing cabinet.
        </p>
      </header>

      <section>
        <h2 className="text-xl font-semibold text-zinc-100">
          Seven signals of a ripe market
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {criteria.map(([title, description], index) => (
            <article
              key={title}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <p className="font-mono text-xs text-emerald-400">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h3 className="mt-2 font-semibold text-zinc-100">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold text-zinc-100">Market tiers</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {tiers.map((tier) => (
            <article
              key={tier.label}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <p className="text-xs font-medium uppercase tracking-widest text-emerald-400">
                {tier.label}
              </p>
              <h3 className="mt-2 font-semibold text-zinc-100">{tier.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                {tier.markets.map((market) => (
                  <li key={market}>• {market}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-xl font-semibold text-zinc-100">
          Patterns most likely to win
        </h2>
        <ul className="mt-5 grid gap-3 text-zinc-300 sm:grid-cols-2">
          {winningPatterns.map((pattern) => (
            <li key={pattern} className="rounded-lg bg-zinc-950/70 px-4 py-3">
              {pattern}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
