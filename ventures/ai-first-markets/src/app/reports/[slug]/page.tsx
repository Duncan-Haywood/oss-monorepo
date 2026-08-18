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
    case "venture-screen-2026-08":
      return <VentureScreen202608Report />;
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

  const nameList = (list: typeof ideas) =>
    list.map((i) => i.name).join(", ");

  return (
    <ReportLayout
      title="Executive Summary"
      description={`Portfolio overview of ${ideas.length} software-first, AI-first business ideas evaluated for solo-founder viability with zero employees.`}
      badge="Overview"
    >
      <Callout variant="success">
        <strong>Bottom line:</strong> {strong100k.length} ideas carry a
        &quot;strong&quot; verdict for reaching $100k ARR:{" "}
        {nameList(strong100k)}. For $1M ARR,{" "}
        {nameList(getTopIdeasForMilestone("1m", 2))} lead the portfolio.
      </Callout>

      <Callout variant="info">
        <strong>Since the August 2026 screen:</strong> six candidates were added
        under an explicit liability, capital, and autonomy filter, and eleven
        categories were rejected outright — see the{" "}
        <Link
          href="/reports/venture-screen-2026-08"
          className="underline hover:text-sky-100"
        >
          new venture screen
        </Link>
        .
      </Callout>

      <Section title="Evaluation criteria">
        <p className="text-zinc-400">
          Each idea is scored across six dimensions (0–10 each): AI leverage,
          zero-employee operations, time to revenue, gross margin,
          defensibility, and distribution. Milestone plans include optimistic,
          realistic, and pessimistic timelines with specific customer counts and
          automation stacks.
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

const screenSources: { label: string; url: string }[] = [
  {
    label: "EU AI Act implementation timeline (artificialintelligenceact.eu)",
    url: "https://artificialintelligenceact.eu/implementation-timeline/",
  },
  {
    label: "AI Act update: changed rules and extended deadlines (Latham & Watkins)",
    url: "https://www.lw.com/en/insights/ai-act-update-eu-resolves-to-change-rules-and-extend-deadlines",
  },
  {
    label: "Proposed deferral of high-risk AI obligations (DLA Piper)",
    url: "https://knowledge.dlapiper.com/dlapiperknowledge/globalemploymentlatestdevelopments/2026/The-Digital-AI-Omnibus-Proposed-deferral-of-high-risk-AI-obligations-under-the-AI-Act",
  },
  {
    label: "California AI Transparency Act (SB 942) deadlines (National Law Review)",
    url: "https://natlawreview.com/article/californias-ongoing-ai-regulation-key-deadlines-arriving-2026-and-beyond",
  },
  {
    label: "MCP adoption and emerging monetization models (2026)",
    url: "https://medium.com/mcp-server/the-rise-of-mcp-protocol-adoption-in-2026-and-emerging-monetization-models-cb03438e985c",
  },
  {
    label: "AI Act compliance tooling: what exists today (Legiscope)",
    url: "https://www.legiscope.com/blog/ai-act-compliance-tools.html",
  },
];

/** First clause only — the table has one line per idea, the detail page has the rest. */
function capitalHeadline(capitalNeed: string): string {
  return capitalNeed.split(/[;—]/)[0].trim().replace(/,$/, "");
}

function VentureScreen202608Report() {
  const screened = businessIdeas
    .filter((idea) => idea.screenedAt === "2026-08")
    .sort((a, b) => a.rank100k - b.rank100k);

  return (
    <ReportLayout
      title="New Venture Screen — August 2026"
      description="Candidate businesses evaluated for a portfolio that has to be run by agents: AI-heavy, no employees, low capital, and — the binding constraint — low liability."
      badge="Deep Dive"
    >
      <Callout variant="info">
        <strong>Why this screen exists:</strong> the original eight ideas were
        scored on upside — AI leverage, margin, time to revenue. None of those
        dimensions asks what happens when the product is wrong. For a business
        with no employees and no legal team, that question decides which
        markets are enterable at all, so it is now scored explicitly on every
        new idea.
      </Callout>

      <Section title="The filters">
        <DataTable
          headers={["Filter", "Test applied", "What it rules out"]}
          rows={[
            [
              "AI-heavy",
              "The model does work a person would otherwise be paid for",
              "Thin wrappers where the AI is a feature, not the product",
            ],
            [
              "No employees",
              "Delivery scales without headcount; contractors optional and agent-coordinated",
              "Services businesses wearing a SaaS label",
            ],
            [
              "Low liability",
              "Being wrong costs a refund, not a lawsuit or a licence",
              "Regulated advice, safety-critical decisions, decisions about people",
            ],
            [
              "Low capital",
              "Under roughly $5k to first revenue, excluding founder time",
              "Inventory, hardware, prepaid data licences",
            ],
            [
              "Agent-operable",
              "Build, support, billing, and marketing all runnable unattended",
              "Anything needing a demo call to close the first sale",
            ],
          ]}
        />
      </Section>

      <Section title="What the regulatory calendar changed">
        <p className="text-zinc-400">
          Three dates shaped which categories stayed in scope. As of August 2026
          the EU AI Act&apos;s Article 50 transparency duties apply, which means
          any customer-facing bot must disclose that it is a bot, and synthetic
          content marking follows in December 2026. Most standalone high-risk
          obligations moved out to December 2027 under the digital omnibus
          package — but AI used in employment contexts stayed on the earlier
          track, which is precisely why nothing in this screen touches hiring,
          monitoring, or promotion decisions. California&apos;s SB 942, as
          amended by AB 853, became operative on the same August date but binds
          providers above one million monthly users, so it constrains vendors
          rather than anything in this portfolio.
        </p>
        <Callout variant="warning">
          These dates come from secondary legal commentary gathered in August
          2026 and the omnibus process was still moving. Verify against the
          official timeline before any of them becomes load-bearing for a
          launch decision.
        </Callout>
      </Section>

      <Section title="Six candidates that passed">
        <DataTable
          headers={[
            "Idea",
            "Category",
            "$100k verdict",
            "Liability",
            "Capital to first revenue",
          ]}
          rows={screened.map((idea) => [
            idea.name,
            categoryLabel(idea.category),
            verdictLabel(
              idea.plans.find((p) => p.milestone === "100k")!.verdict,
            ),
            riskLabel(idea.riskProfile!.liability),
            capitalHeadline(idea.riskProfile!.capitalNeed),
          ])}
        />
        <p className="mt-4 text-sm text-zinc-500">
          Ranks are interleaved with the original eight rather than appended,
          so the portfolio ordering stays comparable. One candidate — the
          regulation diff feed — is marked <em>unlikely</em> at $1M and kept
          anyway: it is the cheapest to run and the honest read is that its
          ceiling, not its quality, is the problem.
        </p>
      </Section>

      <Section title="Where to start">
        <div className="grid gap-4 lg:grid-cols-3">
          {screened.slice(0, 3).map((idea) => (
            <IdeaCard key={idea.id} idea={idea} milestone="100k" />
          ))}
        </div>
      </Section>

      <Section title="Rejected, and why">
        <p className="mb-4 text-zinc-400">
          These were considered and dropped. Most are profitable for someone —
          they are wrong for an operator who cannot absorb a bad outcome.
        </p>
        <DataTable
          headers={["Candidate", "Reason it was dropped"]}
          rows={[
            [
              "AI hiring screens, worker monitoring, promotion scoring",
              "The one high-risk category that did not get a deferral, and discrimination exposure lands on the vendor as well as the employer.",
            ],
            [
              "Companion or mental-health chatbots",
              "Duty-of-care and minor-safety exposure that no disclaimer covers. Not runnable unattended at any price.",
            ],
            [
              "Symptom checkers and clinical decision support",
              "Medical device pathway; certification cost and liability are both orders of magnitude past this portfolio.",
            ],
            [
              "Credit scoring, insurance pricing, debt collection automation",
              "High-risk classification plus consumer-finance licensing (ECOA, FDCPA analogues). Wrong answers harm individuals directly.",
            ],
            [
              "Trading signals or automated financial advice",
              "Adviser registration, and a loss the customer suffers is attributable to the product.",
            ],
            [
              "Accessibility overlay widgets",
              "Cheap to build and actively harmful — it hides failures from audits. Excluded on ethics, not economics; the remediation-PR product exists as the honest version.",
            ],
            [
              "Scraped-data resale (social graphs, marketplace pricing)",
              "Terms-of-service breach, GDPR basis problems, and access-control questions. A business that depends on nobody enforcing anything.",
            ],
            [
              "Voice cloning and face-swap creative tools",
              "Misuse rate too high to supervise with no staff, plus synthetic-content marking duties.",
            ],
            [
              "Auto-DM growth and engagement bots",
              "Platform bans, anti-spam law, and it degrades the channel for everyone. Fails the ethics filter outright.",
            ],
            [
              "Student assignment writing",
              "Sells academic dishonesty. Declined regardless of margin.",
            ],
            [
              "Anything custodying customer funds",
              "Money-transmission licensing and capital requirements. The gateway idea deliberately settles through a platform instead.",
            ],
          ]}
        />
      </Section>

      <Section title="Operating rules the screen implies">
        <ul className="list-inside list-disc space-y-2 text-zinc-400">
          <li>
            Any customer-facing bot discloses it is a bot, in-product, by
            default — the Article 50 baseline, applied everywhere rather than
            only in the EU.
          </li>
          <li>
            Nothing auto-merges, auto-submits, or auto-sends on a customer&apos;s
            behalf where being wrong is expensive. The customer keeps the last
            click.
          </li>
          <li>
            Errors-and-omissions cover is bought before the first paying
            customer in any line where a miss has a downstream cost — the COI
            tracker is the clearest case.
          </li>
          <li>
            Contracts cap liability at fees paid and state plainly what the
            product is not: not legal advice, not insurance advice, not a
            compliance certificate.
          </li>
          <li>
            Data minimisation is the default posture: no retention of proxied
            payloads, no pooling of tenant content, no training on customer
            data.
          </li>
        </ul>
      </Section>

      <Section title="What would change these rankings">
        <DataTable
          headers={["Idea", "The assumption that decides it", "Cheapest test"]}
          rows={screened.map((idea) => [
            idea.name,
            idea.plans.find((p) => p.milestone === "100k")!.risks[0],
            idea.firstExperiment,
          ])}
        />
      </Section>

      <Section title="Sources">
        <ul className="list-inside list-disc space-y-2 text-sm text-zinc-500">
          {screenSources.map((source) => (
            <li key={source.url}>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-emerald-400 hover:text-emerald-300"
              >
                {source.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-zinc-500">
          Market sizing and competitor lists were assembled from public sources
          in August 2026. Nothing here has been validated with a customer yet —
          every verdict on this page is a prior, not a finding.
        </p>
      </Section>
    </ReportLayout>
  );
}
