import {
  PRICING_MODELS,
  RECOMMENDED_TIERS,
  RISKS,
  SUCCESS_CRITERIA,
  UNIT_ECONOMICS,
  VALIDATION_STEPS,
} from "@/lib/data";

import { Section, SeverityBar } from "./ui";

export function PricingSection() {
  return (
    <Section
      id="pricing"
      eyebrow="Pricing"
      title="Subscription for agents, packs for hosts"
      intro="The pricing architecture should match customer recurrence. Agents and teams can justify subscriptions; episodic hosts should buy per-listing packs."
    >
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {PRICING_MODELS.map((model) => (
          <article
            key={model.model}
            className="rounded-3xl border border-white/10 bg-slate-900/80 p-6"
          >
            <h3 className="text-xl font-semibold text-white">{model.model}</h3>
            <p className="mt-4 font-display text-3xl font-semibold text-brand-100">
              {model.price}
            </p>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Best for: {model.bestFor}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-brand-300/20 bg-brand-500/10 p-6">
          <h3 className="text-xl font-semibold text-white">
            Recommended tiers
          </h3>
          <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-200">
            {RECOMMENDED_TIERS.map((tier) => (
              <li key={tier} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                <span>{tier}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
          <h3 className="text-xl font-semibold text-white">Unit economics</h3>
          <p className="mt-4 text-lg leading-8 text-slate-200">
            {UNIT_ECONOMICS}
          </p>
        </div>
      </div>
    </Section>
  );
}

export function RiskSection() {
  return (
    <Section
      id="risks"
      eyebrow="Risks"
      title="Key risks and mitigations"
      intro="The thesis depends on proving that integrated speed creates enough value despite a crowded market and a real quality ceiling versus professional crews."
    >
      <div className="grid gap-5 md:grid-cols-2">
        {RISKS.map((risk) => (
          <article
            key={risk.risk}
            className="rounded-3xl border border-white/10 bg-slate-900/80 p-6"
          >
            <div className="mb-5">
              <h3 className="text-xl font-semibold text-white">{risk.risk}</h3>
              <p className="mt-3 leading-7 text-slate-300">
                {risk.mitigation}
              </p>
            </div>
            <SeverityBar severity={risk.severity} />
          </article>
        ))}
      </div>
    </Section>
  );
}

export function ValidationPlan() {
  return (
    <Section
      id="validation"
      eyebrow="90-day validation"
      title="Prove willingness to pay before building the iOS app"
      intro="The validation plan intentionally starts with interviews and a concierge workflow so the team can test quality, timing, and pricing before committing to native development."
    >
      <div className="grid gap-5 lg:grid-cols-4">
        {VALIDATION_STEPS.map((step, index) => (
          <article
            key={step.period}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
          >
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-300">
              {step.period}
            </p>
            <h3 className="mt-3 text-xl font-semibold text-white">
              {step.title}
            </h3>
            <div className="my-5 h-px bg-gradient-to-r from-brand-300/60 to-transparent" />
            <ul className="space-y-3 text-sm leading-6 text-slate-300">
              {step.tasks.map((task) => (
                <li key={task} className="flex gap-3">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
                  <span>{task}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 font-display text-5xl text-white/10">
              0{index + 1}
            </p>
          </article>
        ))}
      </div>

      <div className="mt-8 rounded-[2rem] border border-brand-300/20 bg-brand-500/10 p-6">
        <h3 className="text-xl font-semibold text-white">
          Success criteria by day 90
        </h3>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {SUCCESS_CRITERIA.map((criterion) => (
            <div key={criterion} className="flex gap-3 text-slate-200">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-300" />
              <span>{criterion}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
