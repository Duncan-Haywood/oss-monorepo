import Link from "next/link";
import { notFound } from "next/navigation";
import type { BusinessIdea, IdeaCategory } from "@/lib/types";
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
  liabilityLabel,
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
    case "liability-and-ethics-screen":
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
        {strong100k.map((i) => i.name).join(", ")}. No idea in the portfolio
        rates stronger than &quot;viable&quot; at $1M ARR;{" "}
        {getTopIdeasForMilestone("1m", 2)
          .map((i) => i.name)
          .join(" and ")}{" "}
        lead that ranking.
      </Callout>

      <Callout variant="warning">
        <strong>Read this with the screen:</strong> every idea also carries a{" "}
        <Link
          href="/reports/liability-and-ethics-screen"
          className="underline hover:text-amber-100"
        >
          liability and ethics profile
        </Link>
        . Liability is a gate applied before economics, not a dimension averaged
        into the score — an attractive margin never buys off a regulatory
        exposure.
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
        <p className="mt-4 text-zinc-400">
          The newest entrants score well for a different reason:{" "}
          <strong className="text-zinc-200">
            a deadline someone else set
          </strong>
          . Accessibility conformance and chatbot disclosure both have live
          statutory forcing functions in 2026, which replaces the hardest part
          of early distribution — convincing a buyer the problem is urgent.
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
              "LinkedIn Content Engine",
              "Impulse purchase for founders, 92% margin, fastest time-to-revenue",
              "Free LinkedIn post audit tool",
            ],
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

      <Section title="How ranks are derived">
        <p className="text-zinc-400">
          The six dimension weights above give an overall quality score. Ranks
          are per-milestone and derived by a stated rule rather than assigned by
          hand: sort first by that milestone&apos;s verdict (strong before
          viable before stretch before unlikely), then by a milestone-weighted
          dimension score.
        </p>
        <div className="mt-4">
          <DataTable
            headers={["Dimension", "Weight at $100k", "Weight at $1M"]}
            rows={[
              ["AI leverage", "15%", "15%"],
              ["Zero-employee ops", "20%", "15%"],
              ["Time to revenue", "25%", "5%"],
              ["Gross margin", "10%", "20%"],
              ["Defensibility", "5%", "30%"],
              ["Distribution", "25%", "15%"],
            ]}
          />
        </div>
        <p className="mt-4 text-sm text-zinc-500">
          Getting to $100k is a question of reaching customers quickly with
          something that runs itself; getting to $1M is a question of whether
          the margin and the moat hold once competitors notice. The weights say
          that and nothing more. Ranks were recomputed across the full set when
          the portfolio grew past the original eight ideas, so a few earlier
          positions moved — the ordering now follows the rule rather than the
          order ideas were written in.
        </p>
      </Section>

      <Section title="Liability is a gate, not a dimension">
        <p className="text-zinc-400">
          Legal and ethical exposure is deliberately kept out of the weighted
          score. Averaging it in would let a 90% gross margin offset a
          regulatory regime, which is exactly the trade a solo operator cannot
          survive. Each idea instead carries a{" "}
          <Link
            href="/reports/liability-and-ethics-screen"
            className="text-emerald-400 hover:text-emerald-300"
          >
            liability and ethics profile
          </Link>{" "}
          that is read alongside the score, and some candidate ideas are
          rejected there before they are ever scored.
        </p>
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
  const ideas = getAllIdeas();
  const byTier = (tier: BusinessIdea["riskProfile"]["liabilityTier"]) =>
    ideas.filter((i) => i.riskProfile.liabilityTier === tier);

  return (
    <ReportLayout
      title="Liability and Ethics Screen"
      description="The gate every idea passes before its economics are considered — what regulates it, what data it touches, what it refuses to do, and what was rejected outright."
      badge="Deep Dive"
    >
      <Callout variant="warning">
        <strong>The rule:</strong> liability is a gate, not a scoring dimension.
        An idea with elevated liability is not disqualified, but it never gets
        funded on the strength of its economics alone — it needs insurance in
        place, and where flagged, counsel, before the first paying customer.
        Averaging a liability score into a commercial score would let a high
        margin quietly buy off a regulatory exposure.
      </Callout>

      <Section title="Tiers">
        <DataTable
          headers={["Tier", "What it means", "Required before first revenue"]}
          rows={[
            [
              "Contained",
              "Advisory or infrastructure product. A defect costs a refund and reputation, not a claim. No regulated data, no money movement, no decisions made about people.",
              "LLC, terms with a liability cap",
            ],
            [
              "Moderate",
              "The customer trusts output for a decision with real cost, or the product processes customer business data.",
              "LLC, tech E&O, DPA where data is processed",
            ],
            [
              "Elevated",
              "A regulated regime attaches directly, or a defect plausibly harms a third party.",
              "LLC, E&O sized to the failure scenario, counsel review, and a written authorization from the customer",
            ],
          ]}
        />
      </Section>

      <Section title="Portfolio by tier">
        <p className="mb-4 text-sm text-zinc-500">
          {byTier("contained").length} contained · {byTier("moderate").length}{" "}
          moderate · {byTier("elevated").length} elevated
        </p>
        <DataTable
          headers={["Idea", "Tier", "What drives the tier"]}
          rows={ideas.map((idea) => [
            idea.name,
            liabilityLabel(idea.riskProfile.liabilityTier),
            idea.riskProfile.regulatoryExposure[0],
          ])}
        />
      </Section>

      <Section title="Rejected outright">
        <p className="mb-4 text-zinc-400">
          These were considered in this pass and dropped before scoring. The
          reason is recorded so the same idea does not get re-proposed on its
          economics in six months.
        </p>
        <DataTable
          headers={["Idea considered", "Why it was dropped"]}
          rows={[
            [
              "AI resume screening / candidate ranking",
              "Employment decisions are high-risk under the EU AI Act, whose provider obligations bind from August 2026, and are separately regulated in several US jurisdictions. Wrong output harms a person who is not the customer.",
            ],
            [
              "Consumer-facing AI legal or medical guidance",
              "Unauthorized practice of law and medical-advice exposure, with the harm landing on someone who never signed our terms. No liability cap survives that.",
            ],
            [
              "AI companion / engagement-optimized chat",
              "Companion-chatbot statutes now carry safety mandates and, in at least one state, a private right of action — and the business model is optimizing for attachment. Fails the ethics screen before the legal one.",
            ],
            [
              "PHI-touching clinical tooling (scribes, coding)",
              "HIPAA business-associate obligations, breach notification, and a data class that cannot be de-risked by retention policy. Not a solo-operator liability profile.",
            ],
            [
              "Money movement: lending, payouts, embedded banking",
              "Licensing, KYC/AML, and custody obligations. High capital, high liability, and a compliance function that cannot be automated away.",
            ],
            [
              "Scraped-data products (contact data, marketplace mirrors)",
              "Terms-of-service and computer-misuse exposure, plus data-broker registration duties once personal data is involved. The public-record feed in this portfolio exists precisely because it avoids all three.",
            ],
            [
              "Mass cold outreach automation (email/SMS at volume)",
              "GDPR and TCPA exposure sit with our customers, but the product would exist to help them take it on. Fails the ethics screen: the value is externalized onto recipients.",
            ],
            [
              "Voice cloning, synthetic likeness, undisclosed AI personas",
              "Impersonation is the product. Disclosure statutes aside, it is the thing this portfolio's guardrails exist to prevent.",
            ],
            [
              "Contractor-marketplace arbitrage (AI-managed labour pools)",
              "Misclassification exposure and wage-and-hour rules that vary by jurisdiction. Managing contractors through agents concentrates employment risk in exactly the place we have no capacity to defend.",
            ],
          ]}
        />
      </Section>

      <Section title="Parked, not rejected">
        <p className="mb-4 text-zinc-400">
          Legal and ethical, plausibly profitable, but they lost to something
          already in the set. Worth revisiting if a top-ranked idea dies.
        </p>
        <DataTable
          headers={["Idea", "Why it is parked"]}
          rows={[
            [
              "Answer-engine visibility monitoring",
              "Real 2026 demand — brands want to know how assistants answer about them — but the enterprise tier is crowded and the SMB tier churns hard once the first report is read. Weak retention, weak moat.",
            ],
            [
              "Failed-payment recovery / dunning",
              "Excellent margins and revenue-tied pricing, but the category has funded incumbents and the wedge is a pricing play, not an AI one.",
            ],
            [
              "LLM eval and agent observability platform",
              "A $2.7B market in 2026 growing fast, and roughly a third of teams still run no evaluation at all — but Langfuse, LangSmith, Braintrust, and Arize are all funded and shipping. Wrong fight for a solo operator.",
            ],
            [
              "EU AI Act deployer documentation",
              "Genuine August 2026 forcing function, but it overlaps the compliance-doc generator already in this portfolio. Better as a module there than a separate venture.",
            ],
          ]}
        />
      </Section>

      <Section title="Standing rules">
        <ul className="list-inside list-disc space-y-2 text-zinc-400">
          <li>
            Sell measurement, evidence, and tooling — never a guarantee of
            compliance, security, or legal outcome.
          </li>
          <li>
            Prefer products that never hold regulated data. The cheapest breach
            response is not having the data.
          </li>
          <li>
            Keep the failure mode inside the customer relationship. If a defect
            can harm someone who never signed the terms, the tier is elevated.
          </li>
          <li>
            Write access is a liability decision, not a feature decision.
            Propose changes; let the customer merge, publish, or send.
          </li>
          <li>
            Disclose AI authorship wherever a reader could reasonably assume a
            human wrote it.
          </li>
          <li>
            Insurance and entity costs belong in the first year&apos;s budget,
            not the first crisis.
          </li>
          <li>
            Ethical guardrails are recorded per idea before launch, when they
            cost nothing to keep.
          </li>
        </ul>
      </Section>

      <Section title="Signals this pass was built on">
        <ul className="list-inside list-disc space-y-2 text-sm text-zinc-500">
          <li>
            EU AI Act high-risk provider and deployer obligations became binding
            on 2 August 2026, with SME-scaled penalties.
          </li>
          <li>
            The European Accessibility Act has been enforceable since June 2025;
            member-state enforcement stepped up through 2026, and only
            micro-enterprises are exempt.
          </li>
          <li>
            Twenty-seven US states were pursuing chatbot-disclosure legislation
            as of April 2026; several enacted laws carry per-violation statutory
            damages and at least one a private right of action.
          </li>
          <li>
            More than ten thousand public MCP servers are in circulation with
            under 5% monetized; the ecosystem&apos;s stated gaps are trust at
            the server boundary and visibility into agent actions.
          </li>
          <li>
            LLM observability was a ~$2.7B market in 2026, with roughly 30% of
            teams running agents in production and no evaluation at all.
          </li>
        </ul>
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
