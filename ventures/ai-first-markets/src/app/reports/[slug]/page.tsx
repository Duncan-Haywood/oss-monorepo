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
import { getAllIdeas, getTopIdeasForMilestone } from "@/lib/evaluation";
import {
  averageScore,
  categoryLabel,
  formatArr,
  liabilityColor,
  liabilityLabel,
  liabilityWeight,
  monthsLabel,
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
        <strong>Bottom line:</strong> {strong100k.length} ideas carry a
        &quot;strong&quot; verdict for reaching $100k ARR:{" "}
        {strong100k.map((i) => i.name).join(", ")}. For $1M ARR the leaders are{" "}
        {getTopIdeasForMilestone("1m", 2)
          .map((i) => i.name)
          .join(" and ")}
        . Every idea also carries a liability rating — see the{" "}
        <Link
          href="/reports/liability-screen"
          className="text-emerald-400 hover:text-emerald-300"
        >
          risk screen
        </Link>{" "}
        before acting on a ranking.
      </Callout>

      <Section title="Evaluation criteria">
        <p className="text-zinc-400">
          Each idea is scored across six dimensions (0–10 each): AI leverage,
          zero-employee operations, time to revenue, gross margin,
          defensibility, and distribution. Milestone plans include optimistic,
          realistic, and pessimistic timelines with specific customer counts and
          automation stacks.
        </p>
        <p className="mt-4 text-zinc-400">
          Scores are not the whole decision. Each idea also carries a liability
          rating — the legal and financial exposure left over after the
          controls built into the product design. A high score with medium
          exposure is a different proposition for a one-person operator than
          the same score with low exposure.
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
      description="How business ideas are evaluated across six dimensions, each scored 0–10."
      badge="Deep Dive"
    >
      <Section title="Dimensions">
        {[
          {
            name: "AI Leverage",
            weight: "20%",
            desc: "How central is AI to the product value? Higher scores for AI-native products vs AI as a feature.",
          },
          {
            name: "Zero-Employee Ops",
            weight: "20%",
            desc: "Can the business run without hiring? Self-serve onboarding, automated support, API-driven ops.",
          },
          {
            name: "Time to Revenue",
            weight: "15%",
            desc: "How quickly can you charge the first customer? Self-serve and marketplace distribution score highest.",
          },
          {
            name: "Gross Margin",
            weight: "15%",
            desc: "Revenue minus direct costs (inference, telephony, hosting). Target 70%+ for software.",
          },
          {
            name: "Defensibility",
            weight: "15%",
            desc: "Moat from data, integrations, vertical expertise — not raw model access.",
          },
          {
            name: "Distribution",
            weight: "15%",
            desc: "How will customers find you? Marketplaces, SEO, communities, and API ecosystems score well.",
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
  const ideas = [...getAllIdeas()].sort(
    (a, b) =>
      liabilityWeight(a.liability.level) - liabilityWeight(b.liability.level) ||
      a.rank100k - b.rank100k,
  );

  const counts = ideas.reduce(
    (acc, idea) => {
      acc[idea.liability.level] += 1;
      return acc;
    },
    { low: 0, medium: 0, high: 0 } as Record<string, number>,
  );

  return (
    <ReportLayout
      title="Liability & Risk Screen"
      description="Every idea rated for the legal and financial exposure its operator carries, and the controls that hold the rating in place."
      badge="Deep Dive"
    >
      <Callout variant="info">
        <strong>What this rates:</strong> exposure that survives the listed
        controls — not how hard the business is to build, and not regulatory
        complexity in the abstract. An idea rated <em>medium</em> is not
        disqualified; it has to earn the exposure with margin or defensibility
        the low-risk ideas cannot match.
      </Callout>

      <Section title="Distribution">
        <DataTable
          headers={["Rating", "Ideas", "What it means for a one-person operator"]}
          rows={[
            [
              "Low",
              String(counts.low),
              "Standard SaaS terms, a DPA, and disciplined scoping cover it.",
            ],
            [
              "Medium",
              String(counts.medium),
              "Needs a specific control in the product design itself, not just in the contract.",
            ],
            [
              "High",
              String(counts.high),
              "Needs insurance, a licensed party in the loop, or a narrowed buyer before launch.",
            ],
          ]}
        />
      </Section>

      <Section title="Three controls that recur across the portfolio">
        <ul className="list-inside list-disc space-y-2 text-zinc-400">
          <li>
            <strong className="text-zinc-200">Advise, do not act.</strong>{" "}
            Products that open a pull request, draft a document, or send a
            report leave the consequential action with the customer. Every
            idea that auto-executes against production carries a materially
            worse profile.
          </li>
          <li>
            <strong className="text-zinc-200">
              Stay out of the request path.
            </strong>{" "}
            Async ingestion and scheduled collection mean an outage here is not
            an outage for the customer. This is a design decision, and it is
            the difference between low and medium on several ideas.
          </li>
          <li>
            <strong className="text-zinc-200">
              Sell to someone who keeps the professional judgment.
            </strong>{" "}
            Where output is legal, medical, or safety-adjacent, the buyer
            should be a platform or firm with a licensed human downstream —
            never an end consumer relying on it directly.
          </li>
        </ul>
      </Section>

      <Section title="Rated ideas">
        <div className="space-y-4">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <Link
                    href={`/ideas/${idea.slug}`}
                    className="text-lg font-semibold text-zinc-50 hover:text-emerald-400"
                  >
                    {idea.name}
                  </Link>
                  <p className="mt-1 text-sm text-zinc-500">
                    {categoryLabel(idea.category)} · score{" "}
                    {averageScore(idea.dimensions)}
                  </p>
                </div>
                <span
                  className={`text-sm font-medium ${liabilityColor(
                    idea.liability.level,
                  )}`}
                >
                  {liabilityLabel(idea.liability.level)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium uppercase text-zinc-500">
                    Primary exposure
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {idea.liability.exposures[0]}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase text-zinc-500">
                    Controlling design choice
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {idea.liability.controls[0]}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Callout variant="warning">
        This screen is an operator&apos;s risk assessment, not legal advice.
        Anything rated medium or high should be reviewed by a lawyer in the
        relevant jurisdiction before the first customer, not after.
      </Callout>
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
