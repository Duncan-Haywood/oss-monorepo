import { AUDIENCE_DATA } from "@/lib/data";

import { AudienceIcon, Section } from "./ui";

export function AudienceComparison() {
  return (
    <Section
      id="audiences"
      eyebrow="Audience fit"
      title="Agents first, brokerage next, hosts as packs"
      intro="The primary audience has recurring inventory, a clear opportunity-cost story, and a direct connection between better photos and listing performance."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        {AUDIENCE_DATA.map((audience) => (
          <article
            key={audience.audience}
            className="rounded-[2rem] border border-white/10 bg-slate-900/80 p-6"
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <AudienceIcon icon={audience.icon} />
              <div className="text-right">
                <p className="font-display text-5xl font-semibold text-white">
                  {audience.fit}
                </p>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  fit score
                </p>
              </div>
            </div>
            <h3 className="text-2xl font-semibold text-white">
              {audience.audience}
            </h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                {audience.recurring}
              </span>
              <span className="rounded-full bg-brand-500/15 px-3 py-1 text-xs font-semibold text-brand-100">
                {audience.verdict}
              </span>
            </div>
            <ul className="mt-6 space-y-3 text-sm leading-6 text-slate-300">
              {audience.why.map((reason) => (
                <li key={reason} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 rounded-2xl bg-white/[0.04] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Buyer persona
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                {audience.persona}
              </p>
            </div>
          </article>
        ))}
      </div>
    </Section>
  );
}
