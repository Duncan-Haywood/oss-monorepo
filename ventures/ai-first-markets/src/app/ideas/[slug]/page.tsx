import Link from "next/link";
import { notFound } from "next/navigation";
import { ScoreBar } from "@/components/ScoreBar";
import { Callout, Section } from "@/components/ReportLayout";
import { businessIdeas } from "@/data/ideas";
import { getIdeaBySlug } from "@/lib/evaluation";
import {
  averageScore,
  categoryLabel,
  formatArr,
  monthsLabel,
  riskColor,
  riskLabel,
  verdictColor,
  verdictLabel,
} from "@/lib/utils";

interface IdeaPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return businessIdeas.map((idea) => ({ slug: idea.slug }));
}

export default async function IdeaDetailPage({ params }: IdeaPageProps) {
  const { slug } = await params;
  const idea = getIdeaBySlug(slug);

  if (!idea) {
    notFound();
  }

  const score = averageScore(idea.dimensions);
  const plan100k = idea.plans.find((p) => p.milestone === "100k")!;
  const plan1m = idea.plans.find((p) => p.milestone === "1m")!;

  return (
    <article>
      <header className="mb-10 border-b border-zinc-800 pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-400">
            {categoryLabel(idea.category)}
          </span>
          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs text-emerald-400">
            Score: {score}/100
          </span>
        </div>
        <h1 className="mt-4 text-3xl font-semibold text-zinc-50 sm:text-4xl">
          {idea.name}
        </h1>
        <p className="mt-2 text-lg text-zinc-400">{idea.tagline}</p>
        <p className="mt-4 max-w-3xl text-zinc-300">{idea.summary}</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          <Section title="Problem">
            <p className="text-zinc-400">{idea.problem}</p>
          </Section>

          <Section title="Solution">
            <p className="text-zinc-400">{idea.solution}</p>
          </Section>

          <Section title="Target customer">
            <p className="text-zinc-400">{idea.targetCustomer}</p>
          </Section>

          <Section title="AI leverage">
            <ul className="list-inside list-disc space-y-2 text-zinc-400">
              {idea.aiLeverage.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title="Zero-employee operations">
            <ul className="list-inside list-disc space-y-2 text-zinc-400">
              {idea.zeroEmployeeOps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </Section>

          <Section title="Scoring dimensions">
            <div className="space-y-4">
              {idea.dimensions.map((dim) => (
                <ScoreBar
                  key={dim.key}
                  label={dim.label}
                  score={dim.score}
                  maxScore={dim.maxScore}
                  rationale={dim.rationale}
                />
              ))}
            </div>
          </Section>

          <Section title="Competitors">
            <div className="flex flex-wrap gap-2">
              {idea.competitors.map((c) => (
                <span
                  key={c}
                  className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-400"
                >
                  {c}
                </span>
              ))}
            </div>
          </Section>

          <Section title="Moat">
            <p className="text-zinc-400">{idea.moat}</p>
          </Section>

          {idea.liability ? (
            <Section title="Legal and liability profile">
              <p className="text-sm text-zinc-500">
                Exposure carried by the business model itself, separate from
                execution risk:{" "}
                <span className={`font-medium ${riskColor(idea.liability.level)}`}>
                  {riskLabel(idea.liability.level)}
                </span>
              </p>
              <ul className="mt-4 list-inside list-disc space-y-2 text-zinc-400">
                {idea.liability.guardrails.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Section>
          ) : null}

          {idea.sources && idea.sources.length > 0 ? (
            <Section title="Sources">
              <ul className="space-y-2 text-sm">
                {idea.sources.map((source) => (
                  <li key={source.url}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      {source.label}
                    </a>
                  </li>
                ))}
              </ul>
              {idea.researched ? (
                <p className="mt-4 text-xs text-zinc-500">
                  Market claims checked {idea.researched}. Regulatory dates move
                  — re-verify against the primary text before repeating any of
                  them to a customer.
                </p>
              ) : null}
            </Section>
          ) : null}
        </div>

        <aside className="space-y-6">
          <Callout variant="success">
            <strong>First experiment:</strong> {idea.firstExperiment}
          </Callout>

          {[plan100k, plan1m].map((plan) => (
            <div
              key={plan.milestone}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-zinc-100">
                  {formatArr(plan.targetArr)}
                </h3>
                <span className={`text-sm ${verdictColor(plan.verdict)}`}>
                  {verdictLabel(plan.verdict)}
                </span>
              </div>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-zinc-500">Timeline (realistic)</p>
                  <p className="text-zinc-300">
                    {monthsLabel(plan.timelineMonths.realistic)}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Customers needed</p>
                  <p className="text-zinc-300">
                    {plan.customerCount.count} {plan.customerCount.unit}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Pricing</p>
                  <p className="text-zinc-300">{plan.pricing.model}</p>
                </div>
              </div>

              <div className="mt-4 border-t border-zinc-800 pt-4">
                <p className="text-xs font-medium uppercase text-zinc-500">
                  Key milestones
                </p>
                <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-zinc-400">
                  {plan.keyMilestones.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ol>
              </div>

              <div className="mt-4 border-t border-zinc-800 pt-4">
                <p className="text-xs font-medium uppercase text-zinc-500">
                  Risks
                </p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-zinc-500">
                  {plan.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}

          <Link
            href="/ideas"
            className="block text-center text-sm text-emerald-400 hover:text-emerald-300"
          >
            ← All ideas
          </Link>
        </aside>
      </div>
    </article>
  );
}
