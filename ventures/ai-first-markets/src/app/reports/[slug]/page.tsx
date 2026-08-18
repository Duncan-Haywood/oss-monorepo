import Link from "next/link";
import { notFound } from "next/navigation";
import type { IdeaCategory } from "@/lib/types";
import { IdeaCard } from "@/components/IdeaCard";
import { ScoreBar } from "@/components/ScoreBar";
import {
  Callout,
  DataTable,
  ReportLayout,
  Section,
} from "@/components/ReportLayout";
import { businessIdeas } from "@/data/ideas";
import { reports, getReportBySlug } from "@/data/reports";
import { screenedIdeas } from "@/data/screened";
import { getAllIdeas, getTopIdeasForMilestone } from "@/lib/evaluation";
import {
  averageScore,
  categoryLabel,
  formatArr,
  monthsLabel,
  riskLabel,
  verdictColor,
  verdictLabel,
} from "@/lib/utils";

interface ReportPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return reports.map((report) => ({ slug: report.slug }));
}

export default async function ReportPage({ params }: ReportPageProps) {
  const { slug } = await params;
  const report = getReportBySlug(slug);

  if (!report) {
    notFound();
  }

  switch (slug) {
    case "executive-summary":
      return <ExecutiveSummaryReport />;
    case "path-to-100k":
      return <PathTo100kReport />;
    case "path-to-1m":
      return <PathTo1mReport />;
    case "ai-automation-playbook":
      return <AutomationPlaybookReport />;
    case "scoring-methodology":
      return <ScoringMethodologyReport />;
    case "liability-screen":
      return <LiabilityScreenReport />;
    case "category-analysis":
      return <CategoryAnalysisReport />;
    default:
      notFound();
  }
}

function ExecutiveSummaryReport() {
  const ideas = getAllIdeas();
  const strong100k = ideas.filter(
    (i) => i.plans.find((p) => p.milestone === "100k")?.verdict === "strong",
  );
  const strong1m = ideas.filter(
    (i) => i.plans.find((p) => p.milestone === "1m")?.verdict === "strong",
  );

  return (
    <ReportLayout
      title="Executive Summary"
      description={`Portfolio overview of ${ideas.length} software-first, AI-first business ideas evaluated for solo-founder viability with zero employees.`}
      badge="Overview"
    >
      <Callout variant="success">
        <strong>Bottom line:</strong> The fastest credible routes to $100k ARR
        are AI PR Review Agent, Accessibility Regression Gate, and AI
        Receptionist for Trades — though the receptionist carries the heaviest
        legal exposure in the portfolio and should not be started without its
        consent and emergency-handling controls built in from day one. For $1M
        ARR, AI QA for E-commerce and AI PR Review Agent lead, with Public Bid
        Radar the strongest of the newer entries on the strength of a
        compounding award-history dataset.
      </Callout>

      <Section title="Evaluation criteria">
        <p className="text-zinc-400">
          Each idea is scored across seven dimensions (0–10 each): AI leverage,
          zero-employee operations, time to revenue, gross margin,
          defensibility, distribution, and liability containment. Milestone
          plans include optimistic, realistic, and pessimistic timelines with
          specific customer counts and automation stacks. Liability containment
          is scored so that a high score means low residual exposure — see the{" "}
          <Link
            href="/reports/liability-screen"
            className="text-emerald-400 hover:text-emerald-300"
          >
            liability and ethics screen
          </Link>{" "}
          for why it carries weight rather than sitting in a footnote.
        </p>
      </Section>

      <Section title="Portfolio at a glance">
        <DataTable
          headers={["Metric", "Value"]}
          rows={[
            ["Total ideas evaluated", String(ideas.length)],
            ["Strong $100k ARR fits", String(strong100k.length)],
            ["Strong $1M ARR fits", String(strong1m.length)],
            ["Operating model", "0 employees — software + AI agents"],
            ["Primary distribution", "Self-serve, marketplaces, API-first"],
          ]}
        />
      </Section>

      <Section title="Recommended starting points">
        <div className="grid gap-4 lg:grid-cols-3">
          {getTopIdeasForMilestone("100k", 3).map((idea) => (
            <IdeaCard key={idea.id} idea={idea} milestone="100k" />
          ))}
        </div>
      </Section>

      <Section title="Key insight">
        <p className="text-zinc-400">
          The fastest paths to $100k ARR cluster around{" "}
          <strong className="text-zinc-200">developer tools</strong> and{" "}
          <strong className="text-zinc-200">content automation</strong> —
          categories where AI is the product, distribution is self-serve, and
          customers pay $49–$199/month without sales calls. Vertical SaaS (trades
          receptionist) offers strong unit economics but requires more
          industry-specific tuning.
        </p>
        <p className="mt-4 text-zinc-400">
          Paths to $1M ARR favor ideas with{" "}
          <strong className="text-zinc-200">platform distribution</strong>{" "}
          (Shopify App Store, GitHub Marketplace) and{" "}
          <strong className="text-zinc-200">expanding ACV</strong> through
          enterprise tiers rather than pure volume plays.
        </p>
      </Section>
    </ReportLayout>
  );
}

function PathTo100kReport() {
  const ideas = getAllIdeas();

  return (
    <ReportLayout
      title="Path to $100k ARR"
      description="Ranked business ideas with the fastest, most realistic routes to $100k annual recurring revenue — operated by one founder with AI and software."
      badge="$100k ARR"
    >
      <Callout variant="info">
        $100k ARR ≈ $8,333 MRR. For solo founders, this is the first
        meaningful milestone — enough to cover living costs and reinvest in
        growth without raising capital or hiring.
      </Callout>

      <Section title="Ranked ideas">
        <div className="space-y-4">
          {ideas.map((idea) => {
            const plan = idea.plans.find((p) => p.milestone === "100k")!;
            return (
              <div
                key={idea.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-zinc-500">
                        #{idea.rank100k}
                      </span>
                      <Link
                        href={`/ideas/${idea.slug}`}
                        className="text-lg font-semibold text-zinc-50 hover:text-emerald-400"
                      >
                        {idea.name}
                      </Link>
                    </div>
                    <p className="mt-1 text-sm text-zinc-400">{idea.tagline}</p>
                  </div>
                  <span
                    className={`text-sm font-medium ${verdictColor(plan.verdict)}`}
                  >
                    {verdictLabel(plan.verdict)}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-zinc-500">Target customers</p>
                    <p className="text-sm text-zinc-300">
                      {plan.customerCount.count} {plan.customerCount.unit}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Realistic timeline</p>
                    <p className="text-sm text-zinc-300">
                      {monthsLabel(plan.timelineMonths.realistic)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Pricing</p>
                    <p className="text-sm text-zinc-300">{plan.pricing.model}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="What separates the top 3">
        <DataTable
          headers={["Idea", "Why it wins at $100k", "First experiment"]}
          rows={[
            [
              "AI PR Review Agent",
              "GitHub Marketplace distribution, devs pay fast, AI is the product",
              "CLI reviewing open-source PRs → Twitter thread",
            ],
            [
              "AI Receptionist for Trades",
              "Clear ROI (missed calls = lost revenue), high willingness to pay",
              "Free missed-call audit in one metro",
            ],
            [
              "LinkedIn Content Engine",
              "Impulse purchase for founders, 92% margin, fastest time-to-revenue",
              "Free LinkedIn post audit tool",
            ],
          ]}
        />
      </Section>
    </ReportLayout>
  );
}

function PathTo1mReport() {
  const ideas = [...getAllIdeas()].sort((a, b) => a.rank1m - b.rank1m);

  return (
    <ReportLayout
      title="Path to $1M ARR"
      description="Ideas with credible scaling paths to $1M ARR through platform distribution, expanding ACV, and compounding data moats."
      badge="$1M ARR"
    >
      <Callout variant="warning">
        $1M ARR as a solo founder is achievable but requires either high ACV
        ($200+/mo average), platform-scale distribution, or both. Most ideas
        rated &quot;viable&quot; — not &quot;strong&quot; — at this milestone.
      </Callout>

      <Section title="Ranked by $1M potential">
        <div className="space-y-4">
          {ideas.map((idea) => {
            const plan = idea.plans.find((p) => p.milestone === "1m")!;
            return (
              <div
                key={idea.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className="font-mono text-sm text-zinc-500">
                      #{idea.rank1m}
                    </span>
                    <Link
                      href={`/ideas/${idea.slug}`}
                      className="ml-2 text-lg font-semibold text-zinc-50 hover:text-emerald-400"
                    >
                      {idea.name}
                    </Link>
                    <p className="mt-1 text-sm text-zinc-400">
                      {plan.customerCount.count} customers @{" "}
                      {formatArr(plan.pricing.averageRevenue)}/mo avg
                    </p>
                  </div>
                  <span
                    className={`text-sm font-medium ${verdictColor(plan.verdict)}`}
                  >
                    {verdictLabel(plan.verdict)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-zinc-500">
                  Realistic: {monthsLabel(plan.timelineMonths.realistic)} ·
                  Key unlock: {plan.keyMilestones[plan.keyMilestones.length - 1]}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Scaling patterns that work">
        <ul className="list-inside list-disc space-y-2 text-zinc-400">
          <li>
            <strong className="text-zinc-200">Platform distribution:</strong>{" "}
            Shopify App Store, GitHub Marketplace — built-in discovery at scale
          </li>
          <li>
            <strong className="text-zinc-200">ACV expansion:</strong> Start at
            $99/mo, add enterprise tier at $499+/mo with SSO and audit logs
          </li>
          <li>
            <strong className="text-zinc-200">Partner channels:</strong> Agency
            rev-share programs turn customers into distribution
          </li>
          <li>
            <strong className="text-zinc-200">Data moats:</strong> Per-customer
            learning loops (review style, store baselines) increase switching
            costs over time
          </li>
        </ul>
      </Section>
    </ReportLayout>
  );
}

function AutomationPlaybookReport() {
  return (
    <ReportLayout
      title="AI + Zero-Employee Playbook"
      description="Operational blueprint for running a software business with AI agents instead of employees."
      badge="Playbook"
    >
      <Section title="Core principle">
        <p className="text-zinc-400">
          Every function a startup traditionally hires for should have a
          software-first alternative. The goal is not to eliminate human
          judgment entirely — it is to reduce human labor to decisions only you
          can make (strategy, partnerships, pricing changes).
        </p>
      </Section>

      <Section title="Function mapping">
        <DataTable
          headers={["Function", "Traditional hire", "AI + software replacement"]}
          rows={[
            [
              "Customer support",
              "Support rep ($45k/yr)",
              "Intercom Fin / custom RAG bot on docs",
            ],
            [
              "Sales",
              "SDR ($55k/yr)",
              "AI outbound (Instantly, Clay) + self-serve signup",
            ],
            [
              "Marketing",
              "Content marketer ($60k/yr)",
              "AI content engine + scheduled distribution",
            ],
            [
              "DevOps",
              "SRE ($120k/yr)",
              "Cloudflare Workers + managed services + PagerDuty",
            ],
            [
              "Accounting",
              "Bookkeeper ($40k/yr)",
              "Stripe + Puzzle/QuickBooks + AI categorization",
            ],
            [
              "Legal",
              "Lawyer (retainer)",
              "Termly templates + AI contract review for standard docs",
            ],
            [
              "QA",
              "QA engineer ($80k/yr)",
              "AI test agents + Playwright in CI",
            ],
            [
              "Data analysis",
              "Analyst ($70k/yr)",
              "Metabase/PostHog + AI SQL agent",
            ],
          ]}
        />
      </Section>

      <Section title="Recommended stack for solo AI-first SaaS">
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              layer: "Infrastructure",
              tools: "Cloudflare Workers, R2, D1, Vectorize",
            },
            {
              layer: "Payments",
              tools: "Stripe (billing, tax, invoicing)",
            },
            {
              layer: "Auth",
              tools: "Cloudflare Access + Google OAuth whitelist",
            },
            {
              layer: "Support",
              tools: "AI chatbot trained on docs + Linear for bugs",
            },
            {
              layer: "Analytics",
              tools: "PostHog or Plausible + Stripe revenue dashboard",
            },
            {
              layer: "Email",
              tools: "Resend or Loops for lifecycle automation",
            },
            {
              layer: "Monitoring",
              tools: "Better Stack or Checkly + PagerDuty",
            },
            {
              layer: "AI inference",
              tools: "OpenAI/Anthropic APIs with cost caps per tenant",
            },
          ].map((item) => (
            <div
              key={item.layer}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <p className="text-sm font-medium text-zinc-200">{item.layer}</p>
              <p className="mt-1 text-sm text-zinc-500">{item.tools}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Weekly founder rhythm (4 hours/day)">
        <DataTable
          headers={["Day", "Focus", "Time"]}
          rows={[
            ["Mon", "Product: ship one feature or fix", "3h"],
            ["Tue", "Distribution: content, outbound, partnerships", "3h"],
            ["Wed", "Product: ship one feature or fix", "3h"],
            ["Thu", "Customers: review AI-handled tickets, call 1-2 power users", "2h"],
            ["Fri", "Metrics: revenue, churn, funnel — adjust one lever", "2h"],
          ]}
        />
      </Section>
    </ReportLayout>
  );
}

function ScoringMethodologyReport() {
  return (
    <ReportLayout
      title="Scoring Methodology"
      description="How business ideas are evaluated across seven weighted dimensions, each scored 0–10."
      badge="Deep Dive"
    >
      <Section title="Dimensions">
        {[
          {
            name: "AI Leverage",
            weight: "18%",
            desc: "How central is AI to the product value? Higher scores for AI-native products vs AI as a feature.",
          },
          {
            name: "Zero-Employee Ops",
            weight: "18%",
            desc: "Can the business run without hiring? Self-serve onboarding, automated support, API-driven ops.",
          },
          {
            name: "Time to Revenue",
            weight: "13%",
            desc: "How quickly can you charge the first customer? Self-serve and marketplace distribution score highest.",
          },
          {
            name: "Gross Margin",
            weight: "13%",
            desc: "Revenue minus direct costs (inference, telephony, hosting). Target 70%+ for software.",
          },
          {
            name: "Defensibility",
            weight: "13%",
            desc: "Moat from data, integrations, vertical expertise — not raw model access.",
          },
          {
            name: "Distribution",
            weight: "13%",
            desc: "How will customers find you? Marketplaces, SEO, communities, and API ecosystems score well.",
          },
          {
            name: "Liability Containment",
            weight: "12%",
            desc: "Residual legal and financial exposure once realistic controls are in place. Scored so a HIGH score means LOW exposure — otherwise the composite would reward the ideas most likely to end in a lawsuit.",
          },
        ].map((dim) => (
          <div
            key={dim.name}
            className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-zinc-200">{dim.name}</h3>
              <span className="text-xs text-zinc-500">{dim.weight}</span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{dim.desc}</p>
          </div>
        ))}
      </Section>

      <Section title="Milestone verdicts">
        <DataTable
          headers={["Verdict", "Meaning"]}
          rows={[
            ["Strong", "High confidence in hitting milestone within realistic timeline"],
            ["Viable", "Achievable with strong execution; some risks"],
            ["Stretch", "Possible but requires favorable conditions or pivots"],
            ["Unlikely", "Significant structural barriers at this milestone"],
          ]}
        />
      </Section>

      <Section title="Example scores">
        <div className="space-y-4">
          {getTopIdeasForMilestone("100k", 2).map((idea) => (
            <div key={idea.id} className="rounded-xl border border-zinc-800 p-5">
              <h3 className="font-medium text-zinc-200">{idea.name}</h3>
              <div className="mt-4 space-y-3">
                {idea.dimensions.map((dim) => (
                  <ScoreBar
                    key={dim.key}
                    label={dim.label}
                    score={dim.score}
                    maxScore={dim.maxScore}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </ReportLayout>
  );
}

function LiabilityScreenReport() {
  const byRisk = (level: "low" | "medium" | "high") =>
    getAllIdeas().filter((idea) => idea.liability.level === level);

  const rows = getAllIdeas()
    .slice()
    .sort(
      (a, b) =>
        (b.dimensions.find((d) => d.key === "liability")?.score ?? 0) -
        (a.dimensions.find((d) => d.key === "liability")?.score ?? 0),
    )
    .map((idea) => [
      idea.name,
      riskLabel(idea.liability.level).replace(" residual risk", ""),
      `${idea.dimensions.find((d) => d.key === "liability")?.score ?? 0}/10`,
      idea.liability.exposures[0],
    ]);

  return (
    <ReportLayout
      title="Liability & Ethics Screen"
      description="Residual legal exposure per idea, the controls that contain it, and the ideas that were researched and deliberately declined."
      badge="Deep Dive"
    >
      <Callout variant="warning">
        <strong>Why this is a scored dimension and not a disclaimer:</strong> a
        business with no employees has no one to absorb a legal problem. There
        is no compliance team to staff, no in-house counsel to escalate to, and
        no headcount to throw at a regulator&apos;s deadline. That makes
        liability a design constraint on which businesses are worth starting at
        all — so it carries 12% of the composite score, and every idea here
        publishes the controls it depends on and the things it will not do.
      </Callout>

      <Section title="Residual exposure by idea">
        <p className="mb-4 text-sm text-zinc-500">
          Levels describe exposure <em>after</em> the listed controls are in
          place. A high-risk idea is not disqualified — it is one where the
          controls have to exist before the first customer, not after the first
          complaint.
        </p>
        <DataTable
          headers={["Idea", "Residual risk", "Score", "Primary exposure"]}
          rows={rows}
        />
      </Section>

      <Section title="What the levels mean in practice">
        <div className="space-y-3">
          <Callout variant="success">
            <strong>Low ({byRisk("low").length} ideas).</strong> Public data,
            observation of surfaces the customer already controls, or work that
            produces no filed or relied-upon figure. Standard SaaS terms and
            ordinary crawl discipline are sufficient. These are the ideas an
            agent-operated business can start without a lawyer on retainer.
          </Callout>
          <Callout variant="info">
            <strong>Medium ({byRisk("medium").length} ideas).</strong> Custody
            of customer material, presence in an auth path, or operation inside
            another platform&apos;s rules. Containable with scoping, retention
            limits, and honest marketing — but the marketing restraint is load
            bearing, and the temptation to claim more than the product delivers
            is the actual risk.
          </Callout>
          <Callout variant="warning">
            <strong>High ({byRisk("high").length} ideas).</strong> Statutory
            damages, licensed-profession boundaries, safety-relevant decisions,
            or custody of regulated data. Each remains in the portfolio because
            the controls are known and specific, not because the risk is small.
            None of them should be the first venture a solo operator starts.
          </Callout>
        </div>
      </Section>

      <Section title="Standing rules across every idea">
        <DataTable
          headers={["Rule", "Reason"]}
          rows={[
            [
              "No product claims that a purchase confers legal compliance",
              "It converts the customer's regulatory risk into your misrepresentation risk.",
            ],
            [
              "No collection from sources whose terms forbid automated access",
              "Data products are restricted to public records, official open-data endpoints, and permitted feeds.",
            ],
            [
              "No advice in a licensed domain sold direct to consumers",
              "The same capability is sold safely one layer back, to professionals who supply their own judgement.",
            ],
            [
              "Published coverage limits wherever detection is incomplete",
              "Saying what the product does not catch is what makes what it does catch trustworthy.",
            ],
            [
              "Contractors engaged project-scoped, non-exclusive, self-scheduled",
              "AI-managed contractors are viable; misclassified employees are a liability with back-tax interest.",
            ],
            [
              "No training on customer data, in any idea, at any tier",
              "One reversal here would be uninsurable and unrecoverable in reputation.",
            ],
          ]}
        />
      </Section>

      <Section title="Researched and declined">
        <p className="mb-4 text-sm text-zinc-500">
          Kept so the next evaluation cycle does not re-derive the same
          conclusions. Each entry names what would have to change for it to be
          worth re-opening — a rejection that cannot expire is a prejudice, not
          a finding.
        </p>
        <div className="space-y-4">
          {screenedIdeas.map((idea) => (
            <div
              key={idea.name}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-medium text-zinc-200">{idea.name}</h3>
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs uppercase text-zinc-400">
                  {idea.screen}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-500">{idea.thesis}</p>
              <p className="mt-3 text-sm text-zinc-400">{idea.reason}</p>
              <p className="mt-3 text-sm text-zinc-500">
                <span className="text-zinc-400">Revisit if:</span>{" "}
                {idea.revisitIf}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Not legal advice">
        <p className="text-sm text-zinc-500">
          This report is the portfolio&apos;s own screening judgement, not a
          legal opinion. Regulatory positions cited here — the European
          Accessibility Act, the EU AI Act timetable, TCPA and consent rules,
          contractor classification tests — change, and vary by jurisdiction.
          Confirm with qualified counsel before launching any idea scored medium
          or high, and before relying on any control listed on an idea page.
        </p>
      </Section>
    </ReportLayout>
  );
}

function CategoryAnalysisReport() {
  const categories = businessIdeas.reduce(
    (acc, idea) => {
      if (!acc[idea.category]) {
        acc[idea.category] = [];
      }
      acc[idea.category].push(idea);
      return acc;
    },
    {} as Record<string, typeof businessIdeas>,
  );

  return (
    <ReportLayout
      title="Category Analysis"
      description="Comparative analysis across idea categories for solo AI-first founders."
      badge="Deep Dive"
    >
      {Object.entries(categories).map(([category, ideas]) => (
        <Section key={category} title={categoryLabel(category as IdeaCategory)}>
          <p className="mb-4 text-sm text-zinc-400">
            {ideas.length} idea{ideas.length > 1 ? "s" : ""} in this category.
            Average score:{" "}
            {Math.round(
              ideas.reduce((sum, i) => sum + averageScore(i.dimensions), 0) /
                ideas.length,
            )}
            /100.
          </p>
          <div className="grid gap-3">
            {ideas.map((idea) => (
              <Link
                key={idea.id}
                href={`/ideas/${idea.slug}`}
                className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition hover:border-zinc-700"
              >
                <span className="text-zinc-200">{idea.name}</span>
                <span className="text-sm text-zinc-500">
                  #{idea.rank100k} at $100k · #{idea.rank1m} at $1M
                </span>
              </Link>
            ))}
          </div>
        </Section>
      ))}

      <Section title="Category recommendations">
        <Callout variant="success">
          <strong>Best for $100k:</strong> Developer tools and content automation
          — fastest time to revenue, highest margins, self-serve distribution.
        </Callout>
        <Callout variant="info">
          <strong>Best for $1M:</strong> Platform-integrated products (Shopify,
          GitHub) — distribution compounds and ACV expands with enterprise
          tiers.
        </Callout>
        <Callout variant="warning">
          <strong>Highest risk:</strong> API infrastructure and legal AI —
          commoditization and liability concerns limit defensibility.
        </Callout>
      </Section>
    </ReportLayout>
  );
}
