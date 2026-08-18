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
    case "opportunity-refresh-2026":
      return <OpportunityRefreshReport />;
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
        {strong100k.map((i) => i.name).join(", ")}. For $1M ARR, AI QA for
        E-commerce and AI PR Review Agent lead the portfolio.
      </Callout>

      <Callout variant="info">
        The most recent additions were screened for legal exposure before they
        were scored on upside. See the{" "}
        <Link
          href="/reports/opportunity-refresh-2026"
          className="text-emerald-400 hover:text-emerald-300"
        >
          2026 Opportunity Refresh
        </Link>{" "}
        for what was added, what was rejected, and why.
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
              "Accessibility Regression Guard",
              "Deadlines already passed, so budget exists today; overlay vendors cannot claim the same trust position",
              "Fix PRs on 25 open-source projects → publish merge rate",
            ],
            [
              "AI Receptionist for Trades",
              "Clear ROI (missed calls = lost revenue), high willingness to pay",
              "Free missed-call audit in one metro",
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

const NEW_IDEA_SLUGS = [
  "accessibility-regression-guard",
  "cra-sbom-autopilot",
  "dependency-upgrade-agent",
  "llm-feature-assurance",
  "regulatory-deadline-feed",
  "agent-ready-commerce",
];

function OpportunityRefreshReport() {
  const added = NEW_IDEA_SLUGS.map(
    (slug) => businessIdeas.find((idea) => idea.slug === slug)!,
  );

  return (
    <ReportLayout
      title="2026 Opportunity Refresh"
      description="Six candidates added after a market scan in August 2026, screened for liability before they were screened for upside — plus the spaces that were researched and rejected."
      badge="Deep Dive"
    >
      <Callout variant="info">
        <strong>Scope of this pass:</strong> find software businesses not
        already represented in this portfolio or in the sibling ventures, that
        one operator can build and run with agents, at low capital and
        containable legal exposure. Ideas were rejected for liability before
        they were ever scored on upside.
      </Callout>

      <Section title="The screen">
        <DataTable
          headers={["Test", "Why it comes first"]}
          rows={[
            [
              "Containable liability",
              "No handling of PHI, funds, or safety-critical decisions. An operator with no legal department cannot absorb those tails.",
            ],
            [
              "No claim the product cannot back",
              "The FTC's $1M order against accessiBe was about overstating what automated remediation delivers. Marketing scope is a legal surface, not a copy exercise.",
            ],
            [
              "Verifiable output",
              "Prefer work a machine can check — a passing test suite, a resolved rule, a cited source. Verifiable output is what makes zero-employee operation honest rather than merely cheap.",
            ],
            [
              "No sales-led motion",
              "If it needs enterprise sales, a solo operator with agents is structurally the wrong seller. Several otherwise attractive spaces failed here.",
            ],
            [
              "Customer keeps control",
              "Nothing auto-merges, auto-files, or auto-publishes on a customer's behalf. This caps blast radius and keeps accountability where it belongs.",
            ],
          ]}
        />
      </Section>

      <Section title="Added to the portfolio">
        <div className="space-y-4">
          {added.map((idea) => {
            const plan = idea.plans.find((p) => p.milestone === "100k")!;
            return (
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
                    <p className="mt-1 text-sm text-zinc-400">{idea.tagline}</p>
                  </div>
                  <span
                    className={`text-sm font-medium ${verdictColor(plan.verdict)}`}
                  >
                    {verdictLabel(plan.verdict)} at $100k
                  </span>
                </div>
                <p className="mt-3 text-sm text-zinc-500">
                  {categoryLabel(idea.category)} · #{idea.rank100k} at $100k · #
                  {idea.rank1m} at $1M
                  {idea.liability ? ` · ${riskLabel(idea.liability.level)}` : ""}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Why these, specifically">
        <DataTable
          headers={["Idea", "The wedge"]}
          rows={[
            [
              "Accessibility Regression Guard",
              "Deadlines already passed, so budget exists now. Overlay vendors took a regulatory hit for claiming more than automation delivers, which leaves an honest source-level fixer with a trust position they cannot occupy.",
            ],
            [
              "CRA Readiness Autopilot",
              "Reporting clocks start 11 September 2026 and you cannot report on components you never inventoried. A dated obligation removes the need to educate the market.",
            ],
            [
              "Upgrade Agent",
              "Existing bots open the PR and leave the breakage. Outcome pricing works here because 'green test suite' is machine-verifiable, which is rare.",
            ],
            [
              "LLM Feature Assurance",
              "Many small products shipped an AI feature with no gate on it, and Article 50 transparency duties now apply to ordinary chat and generated-content surfaces, not just high-risk systems.",
            ],
            [
              "Regulatory Deadline Feed",
              "The dates themselves move — the Digital Omnibus shifted the high-risk deadline to December 2027 after most guides were written. A citation-first dataset with change history is the part free trackers never maintain.",
            ],
            [
              "Agent-Ready Commerce",
              "Over a million merchants are auto-enrolled in AI shopping surfaces while transactional adoption stayed thin. It is a timing bet on discovery, and it is scored as one rather than dressed up.",
            ],
          ]}
        />
      </Section>

      <Section title="Researched and rejected">
        <DataTable
          headers={["Space", "Why it was dropped"]}
          rows={[
            [
              "MCP gateways and agent tool infrastructure",
              "Ten-plus funded entrants, enterprise buyers, security review cycles. Structurally a sales-led market — the wrong shape for a solo operator.",
            ],
            [
              "AI answer-engine visibility monitoring",
              "Fast-growing but already contested by incumbent SEO suites bundling it into existing subscriptions. The standalone version has no pricing power.",
            ],
            [
              "GovCon bid matching and proposal drafting",
              "Several well-funded platforms already do discovery plus proposal drafting for the same buyer. Late entry with no data advantage.",
            ],
            [
              "Certificate-of-insurance tracking",
              "Genuine pain, but a mature vendor set and buyers who expect the vendor to stand behind compliance outcomes.",
            ],
            [
              "Medical billing and prior authorisation",
              "Rejected on liability alone. PHI plus payment consequences is not a defensible exposure for an operator with no compliance staff.",
            ],
            [
              "Accessibility overlay widgets",
              "Rejected on ethics before economics. Overlays do not fix source-level failures, and selling them as compliance is the conduct that drew regulatory action.",
            ],
            [
              "Scraped-data products behind login walls",
              "Public logged-out scraping has survived in court; bypassing authentication is what produced judgments against scrapers. Any dataset here stays on public sources with citations.",
            ],
          ]}
        />
      </Section>

      <Section title="Ethical lines that shaped the designs">
        <ul className="list-inside list-disc space-y-2 text-zinc-400">
          <li>
            No compliance guarantees. Every regulated-adjacent idea sells
            tooling and documentation, never assurance of a legal outcome.
          </li>
          <li>
            No manipulation of AI assistants — no cloaking, no crawler-targeted
            content, no instructions planted for agents to find.
          </li>
          <li>
            No filing, merging, or publishing on a customer&apos;s behalf.
            Agents draft; customers decide.
          </li>
          <li>
            Security findings go to the affected vendor privately first, and
            only aggregate statistics are published.
          </li>
          <li>
            Contractors, if ever used, are for judgment work automation should
            not do — manual accessibility testing, legal review — not for
            volume labour dressed up as automation.
          </li>
        </ul>
      </Section>

      <Callout variant="warning">
        <strong>Confidence and freshness:</strong> market and regulatory claims
        here were gathered by search on 18 August 2026 from secondary sources,
        not read out of the primary legal texts. Dates in this area have already
        moved once. Verify against the official text before any of this reaches
        a landing page or a customer conversation.
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
