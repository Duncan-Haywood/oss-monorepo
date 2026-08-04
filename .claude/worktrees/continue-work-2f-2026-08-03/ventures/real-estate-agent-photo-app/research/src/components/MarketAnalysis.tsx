import { CITED_STATS, COMPETITORS, MARKET_SEGMENTS } from "@/lib/data";

import { FitBadge, Section } from "./ui";

export function MarketSegments() {
  return (
    <Section
      id="segments"
      eyebrow="Market segments"
      title="Win where speed and cost matter"
      intro="The mid-market is the strongest segment because DIY is common, listings compete visually on portals, and the buyer does not expect luxury-production polish."
    >
      <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <h3 className="text-xl font-semibold text-white">
          Industry proof points
        </h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {CITED_STATS.map((stat) => (
            <div key={stat} className="flex gap-3 text-sm text-slate-300">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
              <span>{stat}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {MARKET_SEGMENTS.map((segment) => (
          <article
            key={segment.segment}
            className="rounded-3xl border border-white/10 bg-slate-900/80 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-2xl font-semibold text-white">
                {segment.segment}
              </h3>
              <FitBadge fit={segment.fit} />
            </div>
            <p className="mt-5 leading-7 text-slate-300">{segment.reason}</p>
          </article>
        ))}
      </div>
    </Section>
  );
}

export function CompetitiveLandscape() {
  return (
    <Section
      id="competition"
      eyebrow="Competition"
      title="Crowded point solutions, open workflow gap"
      intro="The market has strong incumbents, but most products solve one slice: HDR, human edit, 3D capture, or tours. Listing Lens must prove integrated speed and quality."
    >
      <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10 text-left">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.18em] text-slate-400">
              <tr>
                <th className="px-5 py-4 font-semibold">Player</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Pricing</th>
                <th className="px-5 py-4 font-semibold">Strength</th>
                <th className="px-5 py-4 font-semibold">Gap for us</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {COMPETITORS.map((competitor) => (
                <tr
                  key={competitor.player}
                  className={
                    competitor.featured
                      ? "bg-brand-500/10 text-brand-50"
                      : "text-slate-300"
                  }
                >
                  <td className="px-5 py-4 font-semibold text-white">
                    {competitor.player}
                  </td>
                  <td className="px-5 py-4">{competitor.type}</td>
                  <td className="px-5 py-4">{competitor.pricing}</td>
                  <td className="px-5 py-4">{competitor.strength}</td>
                  <td className="px-5 py-4">{competitor.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}
