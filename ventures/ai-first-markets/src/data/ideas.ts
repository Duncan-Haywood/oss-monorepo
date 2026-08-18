import type { BusinessIdea } from "@/lib/types";

type Scores = [number, number, number, number, number, number, number];
type Rationales = [string, string, string, string, string, string, string];

/**
 * The seventh dimension — liability containment — is scored so that a HIGH
 * score means LOW exposure. It has to point the same direction as the other
 * six or the composite score would reward the ideas most likely to end in a
 * lawsuit.
 */
const DIMENSION_META: { key: string; label: string; weight: number }[] = [
  { key: "ai-leverage", label: "AI Leverage", weight: 18 },
  { key: "automation", label: "Zero-Employee Ops", weight: 18 },
  { key: "time-to-revenue", label: "Time to Revenue", weight: 13 },
  { key: "margin", label: "Gross Margin", weight: 13 },
  { key: "defensibility", label: "Defensibility", weight: 13 },
  { key: "market-access", label: "Distribution", weight: 13 },
  { key: "liability", label: "Liability Containment", weight: 12 },
];

const baseDimensions = (scores: Scores, rationales: Rationales) =>
  DIMENSION_META.map((meta, i) => ({
    key: meta.key,
    label: meta.label,
    score: scores[i],
    maxScore: 10,
    weight: meta.weight,
    rationale: rationales[i],
  }));

export const businessIdeas: BusinessIdea[] = [
  {
    id: "01",
    slug: "ai-pr-review-bot",
    name: "AI PR Review Agent",
    tagline: "Automated code review that ships with your CI pipeline",
    category: "devtools",
    summary:
      "A GitHub/GitLab app that runs AI-powered PR reviews, security scans, and style enforcement. Sold per-seat to engineering teams who want faster reviews without hiring.",
    problem:
      "Engineering teams bottleneck on PR reviews. Senior engineers spend 20–30% of time reviewing instead of building. Hiring dedicated reviewers doesn't scale for SMBs.",
    solution:
      "Drop-in GitHub App that comments on PRs with actionable feedback, risk scores, and auto-fix suggestions. Integrates with existing CI; learns team conventions over time.",
    targetCustomer: "10–200 person engineering teams, Series A–C startups, agencies",
    aiLeverage: [
      "LLM analyzes diffs with repo context and team style guides",
      "RAG over internal docs and past PR decisions",
      "Auto-generates fix PRs for low-risk changes",
      "Learns from accepted/rejected suggestions via feedback loop",
    ],
    zeroEmployeeOps: [
      "Self-serve GitHub Marketplace install",
      "Stripe billing with usage-based tiers",
      "AI support bot trained on docs handles 90% of tickets",
      "Automated onboarding emails and in-app tours",
      "Status page and incident comms via PagerDuty webhooks",
    ],
    dimensions: baseDimensions(
      [9, 9, 8, 8, 6, 7, 7],
      [
        "Core product is AI-native; quality directly tied to model improvements",
        "Fully API-driven; no human reviewers in the loop for v1",
        "GitHub Marketplace enables revenue within 4–8 weeks of MVP",
        "85%+ gross margin after inference costs at scale",
        "Moat from team-specific fine-tuning, not raw model access",
        "GitHub Marketplace + dev Twitter + Product Hunt distribution",
        "Holds customer source code, but never promises to catch every defect",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Read access to proprietary source code across many customers",
        "A missed vulnerability that ships to production invites blame",
        "Suggested code could reproduce licensed snippets from training data",
      ],
      controls: [
        "Least-privilege GitHub App scopes; no repo cloning to durable storage",
        "Diff context held in memory for the review, then discarded; no training on customer code",
        "Positioned as review assistance, not a security guarantee — no 'secure' or 'compliant' claims in marketing",
        "Liability capped at fees paid; standard SaaS terms reviewed by counsel before first paid seat",
      ],
      redLines: [
        "No auto-merge of AI-authored changes without a human approver",
        "No selling of scan results or aggregated code metrics to third parties",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 8, realistic: 14, pessimistic: 24 },
        customerCount: { count: 85, unit: "teams @ $99/mo avg" },
        pricing: {
          model: "Per-seat SaaS ($29–$99/seat/mo)",
          averageRevenue: 98,
          currency: "USD",
        },
        keyMilestones: [
          "MVP GitHub App with 3 review types (security, style, logic)",
          "10 design partners from personal network / Twitter",
          "GitHub Marketplace listing live",
          "First $5k MRR via outbound to YC companies",
          "Add Slack integration for review notifications",
        ],
        automationStack: [
          "GitHub webhooks → Cloudflare Workers → inference API",
          "Stripe + Metabase dashboards for revenue",
          "Intercom AI agent for support",
          "Linear for self-managed bug triage",
        ],
        risks: [
          "GitHub could ship native AI review",
          "Inference costs eat margin on large repos",
          "Enterprise needs SOC2 before $50k+ deals",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 24, realistic: 36, pessimistic: 48 },
        customerCount: { count: 420, unit: "teams @ $199/mo avg" },
        pricing: {
          model: "Tiered per-seat + usage overage",
          averageRevenue: 199,
          currency: "USD",
        },
        keyMilestones: [
          "GitLab and Bitbucket integrations",
          "Custom rule engine (no-code policy builder)",
          "Enterprise SSO + audit logs",
          "Partner channel with DevOps consultancies",
          "Fine-tuned models per language/framework vertical",
        ],
        automationStack: [
          "Multi-tenant inference routing with cost caps",
          "Automated SOC2 evidence collection (Vanta)",
          "Partner portal with rev-share tracking",
        ],
        risks: [
          "Cursor/Copilot expanding into review",
          "Churn if quality inconsistent across languages",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["CodeRabbit", "Greptile", "Qodo (Codium)", "GitHub Copilot review"],
    moat: "Team-specific learning loop + custom policy engine + CI integration depth",
    firstExperiment:
      "Build a CLI that reviews 10 open-source PRs and post results as a Twitter thread. Measure engagement and waitlist signups.",
    rank100k: 1,
    rank1m: 2,
  },
  {
    id: "02",
    slug: "vertical-ai-receptionist",
    name: "AI Receptionist for Trades",
    tagline: "24/7 phone + SMS booking for plumbers, HVAC, and electricians",
    category: "vertical-saas",
    summary:
      "Voice and SMS AI agent that answers calls, books appointments, sends quotes, and follows up — built specifically for home services businesses.",
    problem:
      "Trades businesses miss 30–40% of inbound calls. Hiring receptionists costs $3–4k/month. Generic chatbots fail on accents, jargon, and scheduling nuance.",
    solution:
      "Industry-tuned voice agent with calendar sync, dispatch rules, and SMS follow-ups. White-label option for franchise groups.",
    targetCustomer: "Solo to 20-tech HVAC, plumbing, electrical, and landscaping companies in US/UK/AU",
    aiLeverage: [
      "Real-time voice with trade-specific vocabulary",
      "Quote estimation from job description + historical pricing",
      "Automated follow-up sequences for no-shows",
      "Sentiment detection escalates angry callers",
    ],
    zeroEmployeeOps: [
      "Self-serve signup with Twilio number provisioning",
      "AI onboarding calls to configure services and hours",
      "Automated billing tied to call volume",
      "Churn prediction triggers win-back campaigns",
    ],
    dimensions: baseDimensions(
      [9, 8, 7, 7, 7, 8, 4],
      [
        "Voice AI is the product; continuous prompt tuning per vertical",
        "Call handling fully automated; human escalation optional",
        "Trades owners buy fast when they see missed-call ROI",
        "60–70% margin after telephony + inference",
        "Vertical data (pricing, dispatch rules) creates stickiness",
        "Facebook groups, trade associations, Google Local Services ads",
        "Highest-exposure idea in the portfolio: recording consent, TCPA, and emergency calls",
      ],
    ),
    liability: {
      level: "high",
      exposures: [
        "Call recording without consent is a criminal exposure in two-party-consent states",
        "TCPA statutory damages run $500–$1,500 per message for non-consented SMS or outbound dialing",
        "A gas leak or no-heat call mishandled by a bot is a safety event, not a support ticket",
        "Booking errors and quoted prices the customer's business must then honour",
      ],
      controls: [
        "AI disclosure and recording notice in the first seconds of every call, per state",
        "Inbound only at launch; outbound SMS strictly opt-in with logged consent artefacts",
        "Emergency keyword triage transfers to a human line before any booking logic runs",
        "Quotes are ranges from the customer's own price book, never the model's invention",
        "Customer is the caller-data controller; the product is a processor with a signed DPA",
      ],
      redLines: [
        "No cold outbound dialing campaigns, at any price",
        "No claiming to be human when a caller asks",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 28 },
        customerCount: { count: 140, unit: "businesses @ $59/mo avg" },
        pricing: {
          model: "Base fee + per-minute overage ($49–$149/mo)",
          averageRevenue: 59,
          currency: "USD",
        },
        keyMilestones: [
          "MVP for one vertical (HVAC) in one metro",
          "20 beta customers from cold outreach + Facebook groups",
          "Case study: 'Recovered $12k/mo in missed jobs'",
          "Expand to plumbing and electrical playbooks",
          "Referral program: 1 month free per referral",
        ],
        automationStack: [
          "Twilio + Deepgram/AssemblyAI + LLM orchestration",
          "Cal.com / Jobber API integrations",
          "HubSpot automated nurture for leads",
        ],
        risks: [
          "Voice AI reliability in noisy environments",
          "High CAC if paid ads don't convert",
          "Seasonal churn in some trades",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 42, pessimistic: 60 },
        customerCount: { count: 700, unit: "businesses @ $119/mo avg" },
        pricing: {
          model: "Tiered plans + franchise bundles",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "Multi-trade support across US + UK",
          "Franchise white-label (50+ location deals)",
          "Dispatch optimization add-on",
          "Integration marketplace (ServiceTitan, Housecall Pro)",
        ],
        automationStack: [
          "Multi-tenant voice routing with SLA monitoring",
          "Automated QA on call transcripts",
          "Partner API for franchise onboarding",
        ],
        risks: [
          "ServiceTitan builds native AI receptionist",
          "Regulatory changes on AI disclosure for phone calls",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["Smith.ai", "Ruby Receptionists", "Avoca", "ServiceAgent"],
    moat: "Vertical playbooks + dispatch integrations + call outcome data",
    firstExperiment:
      "Run a free 'missed call audit' landing page for HVAC owners in one city. Offer 2 weeks free AI answering.",
    rank100k: 3,
    rank1m: 4,
  },
  {
    id: "03",
    slug: "compliance-doc-generator",
    name: "AI Compliance Doc Generator",
    tagline: "SOC2, ISO 27001, and HIPAA docs generated and maintained by AI",
    category: "vertical-saas",
    summary:
      "Generates, updates, and evidence-collects compliance documentation for startups. Connects to AWS/GCP/GitHub to auto-populate controls.",
    problem:
      "Startups need SOC2 for enterprise deals but pay $30–80k to consultants. Docs go stale within weeks. Founders hate compliance busywork.",
    solution:
      "AI generates policy docs from a questionnaire, monitors infra for drift, and produces audit-ready evidence packages.",
    targetCustomer: "Seed to Series B B2B SaaS companies (20–150 employees) selling to enterprise",
    aiLeverage: [
      "Generates policies mapped to specific control frameworks",
      "Monitors infra changes and flags control gaps",
      "Auto-drafts answers to security questionnaires",
      "Summarizes audit evidence into reviewer-friendly packs",
    ],
    zeroEmployeeOps: [
      "Self-serve onboarding wizard",
      "Automated evidence collection via API integrations",
      "AI chat for compliance questions",
      "Upsell to auditor introductions (referral fee, not service)",
    ],
    dimensions: baseDimensions(
      [8, 9, 6, 9, 7, 6, 4],
      [
        "Doc generation and monitoring are AI-native workflows",
        "Evidence collection fully automated via integrations",
        "Longer sales cycle (60–90 days) slows early revenue",
        "90%+ gross margin; minimal COGS",
        "Control mappings + customer evidence history",
        "Outbound to CTOs + partnerships with Vanta/Drata alternatives",
        "Customers rely on the output in front of auditors and regulators",
      ],
    ),
    liability: {
      level: "high",
      exposures: [
        "A wrong control mapping surfaces during a real audit and the customer fails",
        "Drifting toward opinions only a licensed auditor may give",
        "Holding the customer's security evidence, which is itself a breach target",
      ],
      controls: [
        "Ships drafts and evidence templates; every artefact requires a named human sign-off before it leaves",
        "Never described as an audit, an attestation, or a certification",
        "Independent auditor partner channel — the auditor opines, the software prepares",
        "Evidence stored per-tenant with customer-held retention settings",
      ],
      redLines: [
        "No issuing, signing, or co-signing an attestation",
        "No claim that using the product makes a customer 'SOC 2 compliant'",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 18, pessimistic: 30 },
        customerCount: { count: 55, unit: "companies @ $149/mo avg" },
        pricing: {
          model: "Annual contracts ($1.2k–$6k/yr)",
          averageRevenue: 149,
          currency: "USD",
        },
        keyMilestones: [
          "SOC2 Type I doc pack for one framework",
          "AWS + GitHub evidence connectors",
          "10 customers via founder network",
          "Security questionnaire auto-fill feature",
          "Case study with logo on homepage",
        ],
        automationStack: [
          "Terraform/AWS/GitHub API pollers",
          "Document version control with change alerts",
          "Stripe annual billing",
        ],
        risks: [
          "Vanta/Drata expanding doc generation",
          "Liability if generated docs fail audit",
          "Enterprise requires human auditor regardless",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 48, pessimistic: 72 },
        customerCount: { count: 280, unit: "companies @ $299/mo avg" },
        pricing: {
          model: "Tiered by company size + framework count",
          averageRevenue: 299,
          currency: "USD",
        },
        keyMilestones: [
          "ISO 27001 and HIPAA frameworks",
          "Auditor partner network (referral revenue)",
          "Continuous monitoring dashboard",
          "Mid-market outbound team (AI SDR)",
        ],
        automationStack: [
          "Multi-framework control crosswalk engine",
          "Automated customer health scoring",
        ],
        risks: ["Crowded GRC market", "Audit failures create reputation risk"],
        verdict: "stretch",
      },
    ],
    competitors: ["Vanta", "Drata", "Secureframe", "Laika"],
    moat: "AI-native doc generation speed + lower price point for early-stage",
    firstExperiment:
      "Offer free SOC2 policy template generator. Gate evidence automation behind waitlist.",
    rank100k: 11,
    rank1m: 10,
  },
  {
    id: "04",
    slug: "api-uptime-intelligence",
    name: "API Uptime Intelligence",
    tagline: "Monitor, benchmark, and alert on third-party API reliability",
    category: "api-infrastructure",
    summary:
      "Tracks latency, error rates, and breaking changes across the APIs your product depends on. Predicts outages before they hit production.",
    problem:
      "Teams depend on 10–50 third-party APIs with no unified visibility. Status pages lie. Outages discovered by customers first.",
    solution:
      "Synthetic monitoring + changelog scraping + AI anomaly detection across your API dependency graph.",
    targetCustomer: "Platform engineers and SREs at SaaS companies with 5+ critical API dependencies",
    aiLeverage: [
      "Anomaly detection on latency/error patterns",
      "Changelog parsing to predict breaking changes",
      "Root-cause suggestions linking failures across dependencies",
      "Natural language incident summaries for Slack",
    ],
    zeroEmployeeOps: [
      "Self-serve with API key import from OpenAPI specs",
      "Slack/PagerDuty alert routing",
      "Usage-based billing auto-scales",
      "AI-generated weekly reliability reports",
    ],
    dimensions: baseDimensions(
      [7, 9, 7, 8, 6, 6, 8],
      [
        "AI adds signal on top of commodity monitoring",
        "Fully automated probes and alerting",
        "Devs pay quickly when they have recent outage pain",
        "80%+ margin; probe costs are low",
        "Dependency graph data improves over time",
        "Dev communities, Hacker News, integration marketplaces",
        "Observes public endpoints; exposure is mostly about probe etiquette",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Probing a third party's API without permission can read as unauthorized access or rate-limit abuse",
        "Publishing a vendor's uptime score invites a defamation complaint if the measurement is wrong",
        "A missed outage alert the customer was depending on",
      ],
      controls: [
        "Documented, published probe policy: identified user agent, conservative intervals, honour robots and ToS",
        "Public status pages and documented health endpoints only — no credentialed or authenticated probing",
        "Vendor-facing right of reply and a correction process before any score is published",
        "Alerting sold as best-effort with an explicit no-guarantee clause; no SLA credits on missed detection",
      ],
      redLines: [
        "No load testing, credential stuffing, or any probe designed to find a weakness",
        "No publishing a vendor score derived from a single failed probe",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 26 },
        customerCount: { count: 70, unit: "teams @ $119/mo avg" },
        pricing: {
          model: "Per-API monitored ($49–$299/mo)",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "Monitor top 50 public APIs out of the box",
          "Custom endpoint monitoring from OpenAPI import",
          "Slack integration with smart alert grouping",
          "Launch on Hacker News with outage postmortem angle",
        ],
        automationStack: [
          "Global probe network via Cloudflare Workers",
          "Timeseries DB with automated retention",
          "Stripe metered billing",
        ],
        risks: [
          "Datadog/New Relic expanding API monitoring",
          "Probe costs at scale for high-frequency checks",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 28, realistic: 40, pessimistic: 54 },
        customerCount: { count: 350, unit: "teams @ $238/mo avg" },
        pricing: {
          model: "Platform fee + per-dependency pricing",
          averageRevenue: 238,
          currency: "USD",
        },
        keyMilestones: [
          "Private API monitoring behind auth",
          "SLA breach auto-documentation for vendor disputes",
          "Enterprise SSO and audit logs",
          "Integration with incident.io and PagerDuty",
        ],
        automationStack: [
          "Multi-region probe orchestration",
          "Automated vendor SLA report generation",
        ],
        risks: ["Commoditization by observability incumbents"],
        verdict: "viable",
      },
    ],
    competitors: ["Checkly", "Better Uptime", "Datadog Synthetics", "Bearer"],
    moat: "Cross-API dependency graph + changelog intelligence",
    firstExperiment:
      "Publish a free public dashboard of Stripe/Twilio/OpenAI uptime with email alerts.",
    rank100k: 7,
    rank1m: 6,
  },
  {
    id: "05",
    slug: "linkedin-content-engine",
    name: "LinkedIn Content Engine",
    tagline: "AI ghostwriter + scheduler for B2B founders and consultants",
    category: "content-automation",
    summary:
      "Turns voice memos, call notes, and rough bullets into a month of LinkedIn posts. Schedules, A/B tests hooks, and reports on pipeline influence.",
    problem:
      "Founders know LinkedIn drives deals but lack time and writing skill. Agencies cost $3–5k/month. Generic AI content sounds robotic.",
    solution:
      "Voice-first content capture → AI drafting in user's voice → scheduling + analytics tied to CRM pipeline.",
    targetCustomer: "B2B founders, consultants, and fractional executives ($200k+ personal income)",
    aiLeverage: [
      "Voice-to-post with style matching from past content",
      "Hook A/B testing with engagement prediction",
      "Comment drafting and DM response suggestions",
      "Content calendar optimized for algorithm timing",
    ],
    zeroEmployeeOps: [
      "Self-serve onboarding with voice sample",
      "Stripe subscriptions with annual prepay discount",
      "Automated weekly performance emails",
      "AI support for content approvals",
    ],
    dimensions: baseDimensions(
      [9, 9, 8, 9, 5, 7, 5],
      [
        "Entire value prop is AI content quality",
        "No human editors; user approves in app",
        "Fastest path to revenue — founders pay $99/mo impulsively",
        "92%+ gross margin",
        "Low defensibility; voice matching is replicable",
        "LinkedIn itself + founder Twitter + podcast sponsorships",
        "Lives inside another platform's automation rules and publishes claims in a customer's name",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "LinkedIn's automation terms — an unofficial posting path gets customers' accounts restricted",
        "Generated posts that state false credentials, fabricated metrics, or unlabelled endorsements (FTC)",
        "Defamation or impersonation if generated copy names competitors or real people",
      ],
      controls: [
        "Publish only through official APIs and approved partner integrations; no browser-session scraping",
        "Human approval required before anything posts — the product drafts, the customer publishes",
        "Claim filter blocks fabricated statistics, testimonials, and earnings claims before the draft is shown",
        "No automated connection requests, DMs, or engagement pods",
      ],
      redLines: [
        "No fake engagement, purchased followers, or undisclosed paid promotion",
        "No generating content that impersonates a named real person",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 6, realistic: 10, pessimistic: 18 },
        customerCount: { count: 170, unit: "users @ $49/mo avg" },
        pricing: {
          model: "Monthly subscription ($49–$199/mo)",
          averageRevenue: 49,
          currency: "USD",
        },
        keyMilestones: [
          "Voice memo → 5 posts workflow",
          "LinkedIn scheduling API integration",
          "50 users from personal brand content",
          "Annual plan at $399 drives cash flow",
        ],
        automationStack: [
          "Whisper transcription + LLM post generation",
          "Buffer/LinkedIn API scheduling",
          "Stripe + Loops for lifecycle emails",
        ],
        risks: [
          "LinkedIn API restrictions",
          "High churn if content quality inconsistent",
          "Crowded market (Taplio, AuthoredUp)",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 20, realistic: 30, pessimistic: 42 },
        customerCount: { count: 850, unit: "users @ $98/mo avg" },
        pricing: {
          model: "Pro tier + team plans for agencies",
          averageRevenue: 98,
          currency: "USD",
        },
        keyMilestones: [
          "Team/agency white-label (10-seat bundles)",
          "CRM attribution (HubSpot deal influence)",
          "Twitter/X cross-posting",
          "Affiliate program for business coaches",
        ],
        automationStack: [
          "Multi-tenant style profile training",
          "Automated churn intervention sequences",
        ],
        risks: [
          "Platform risk from LinkedIn",
          "Race to bottom on pricing",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["Taplio", "AuthoredUp", "Shield Analytics", "Hypefury"],
    moat: "Voice capture workflow + style matching accuracy + CRM attribution",
    firstExperiment:
      "Offer free 'LinkedIn audit' — analyze last 20 posts and generate 5 improved versions.",
    rank100k: 4,
    rank1m: 8,
  },
  {
    id: "06",
    slug: "rag-as-a-service",
    name: "RAG-as-a-Service",
    tagline: "Drop-in knowledge base API for AI apps",
    category: "api-infrastructure",
    summary:
      "Managed ingestion, chunking, embedding, and retrieval API. Developers add company knowledge to their AI apps in hours, not weeks.",
    problem:
      "Every AI app needs RAG but building ingestion pipelines, chunking strategies, and retrieval is weeks of work. Vector DB ops are painful.",
    solution:
      "Upload docs or connect sources → auto-chunked, embedded, and queryable via REST API. Handles updates, dedup, and access control.",
    targetCustomer: "AI startup developers and indie hackers building chatbots and agents",
    aiLeverage: [
      "Auto-selects chunking strategy per document type",
      "Hybrid search with reranking",
      "Query rewriting for better retrieval",
      "Eval dashboard for retrieval quality",
    ],
    zeroEmployeeOps: [
      "API-first with docs and SDKs",
      "Usage-based billing with free tier",
      "Automated scaling of embedding pipelines",
      "Status page and AI support bot",
    ],
    dimensions: baseDimensions(
      [8, 9, 7, 7, 5, 7, 4],
      [
        "RAG quality is the product differentiator",
        "Fully managed infra; no ops headcount",
        "Devs adopt fast with generous free tier",
        "70% margin after embedding costs",
        "Commoditizing fast; needs dev experience moat",
        "Developer marketing: docs, tutorials, Discord",
        "Takes custody of whatever customers upload, which is the worst data-liability shape available",
      ],
    ),
    liability: {
      level: "high",
      exposures: [
        "Customers will upload PII, and some will upload PHI or payment data regardless of what the terms say",
        "Cross-tenant retrieval leakage is the single failure that ends the business",
        "GDPR processor duties: deletion, subprocessor disclosure, transfer basis, breach notification within 72 hours",
      ],
      controls: [
        "Hard tenant isolation at the index level, with an automated cross-tenant retrieval test in CI",
        "No PHI tier at launch — refuse the segment rather than sign a BAA a solo operator cannot honour",
        "EU data-residency option and a published subprocessor list from day one",
        "Customer-controlled retention and hard-delete; no training on customer corpora, ever",
        "Cyber liability insurance in place before the first paying customer, not after",
      ],
      redLines: [
        "No healthcare or payments segment until isolation is independently tested",
        "No silent subprocessor changes",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 18, pessimistic: 28 },
        customerCount: { count: 200, unit: "accounts @ $42/mo avg" },
        pricing: {
          model: "Usage-based ($0.01/1k tokens + base fee)",
          averageRevenue: 42,
          currency: "USD",
        },
        keyMilestones: [
          "REST API with 5 source connectors",
          "Python and TypeScript SDKs",
          "1000 free-tier developers",
          "Convert 10% to paid via usage limits",
        ],
        automationStack: [
          "Cloudflare Workers + Vectorize or Pinecone",
          "Async ingestion queue",
          "Stripe metered billing",
        ],
        risks: [
          "OpenAI/Anthropic shipping managed RAG",
          "Embedding cost volatility",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 42, pessimistic: 60 },
        customerCount: { count: 800, unit: "accounts @ $104/mo avg" },
        pricing: {
          model: "Enterprise tier with SLA + dedicated indexes",
          averageRevenue: 104,
          currency: "USD",
        },
        keyMilestones: [
          "Enterprise SSO and VPC deployment option",
          "Eval and observability suite",
          "Partnership with LangChain/LlamaIndex",
          "Multi-modal ingestion (images, tables)",
        ],
        automationStack: [
          "Auto-scaling ingestion workers",
          "Cost attribution per tenant",
        ],
        risks: ["Hyperscaler competition", "Developer tool churn"],
        verdict: "stretch",
      },
    ],
    competitors: ["Pinecone", "Weaviate Cloud", "Vectara", "Nuclia"],
    moat: "Developer experience + chunking intelligence + eval tooling",
    firstExperiment:
      "Open-source a chunking comparison tool. Upsell managed API in docs.",
    rank100k: 12,
    rank1m: 11,
  },
  {
    id: "07",
    slug: "ai-qa-for-ecommerce",
    name: "AI QA for E-commerce",
    tagline: "Automated storefront testing before every deploy",
    category: "ai-agent",
    summary:
      "AI agents browse your Shopify store like real customers — testing checkout, promos, and mobile layouts. Catches revenue-killing bugs pre-deploy.",
    problem:
      "E-commerce teams ship checkout bugs that cost thousands per hour. Manual QA doesn't scale. Synthetic tests miss visual and UX issues.",
    solution:
      "AI agents run exploratory tests on staging and production, comparing screenshots, prices, and flows against baselines.",
    targetCustomer: "Shopify Plus merchants and DTC brands doing $2M–$50M annual revenue",
    aiLeverage: [
      "Vision models detect layout and pricing errors",
      "Agents explore edge cases humans miss",
      "Natural language test plan generation",
      "Auto-triage: revenue impact scoring per bug",
    ],
    zeroEmployeeOps: [
      "Shopify App Store distribution",
      "Self-serve install with automated test setup",
      "Slack alerts for critical bugs",
      "Usage-based billing per test run",
    ],
    dimensions: baseDimensions(
      [9, 8, 7, 8, 7, 8, 7],
      [
        "Vision + agent AI is core to detection quality",
        "Test runs fully automated; no QA analysts",
        "Shopify App Store enables discovery",
        "75%+ margin after compute",
        "Store-specific baselines improve over time",
        "Shopify App Store + agency partnerships",
        "Automated traffic against a live store is the exposure; contained by staging-first defaults",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Test runs against production checkout can create real orders, real charges, and skewed analytics",
        "Storefront credentials held on the customer's behalf",
        "A missed checkout break during a peak sale, with lost revenue attributed to the tool",
      ],
      controls: [
        "Staging or preview environments by default; production runs need per-store written authorization",
        "Payment gateway test mode enforced; a live-card transaction aborts the run",
        "Scoped, rotatable app credentials — never the customer's admin password",
        "Rate-limited runs with a bot-identifying user agent so the customer's analytics stay clean",
        "Sold as coverage, not a guarantee; no revenue-loss indemnity",
      ],
      redLines: [
        "No test run that places a real, chargeable order",
        "No running against a store the account holder cannot prove they control",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 26 },
        customerCount: { count: 85, unit: "stores @ $98/mo avg" },
        pricing: {
          model: "Monthly + per-test-run overage",
          averageRevenue: 98,
          currency: "USD",
        },
        keyMilestones: [
          "Shopify app with 5 critical path tests",
          "20 beta merchants from Shopify communities",
          "Case study: caught $15k checkout bug",
          "Agency partner program (20% rev share)",
        ],
        automationStack: [
          "Playwright + vision model pipeline",
          "Shopify webhook-triggered test runs",
          "Stripe billing via Shopify Billing API",
        ],
        risks: [
          "Shopify platform changes",
          "Flaky tests erode trust",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 28, realistic: 40, pessimistic: 54 },
        customerCount: { count: 420, unit: "stores @ $198/mo avg" },
        pricing: {
          model: "Tiered plans by GMV + test frequency",
          averageRevenue: 198,
          currency: "USD",
        },
        keyMilestones: [
          "WooCommerce and BigCommerce support",
          "CI/CD integration (pre-deploy gates)",
          "Competitive price monitoring add-on",
          "Enterprise multi-store dashboards",
        ],
        automationStack: [
          "Parallel test orchestration",
          "Automated flake detection and retry",
        ],
        risks: ["Shopify builds native AI testing"],
        verdict: "viable",
      },
    ],
    competitors: ["Chromatic", "Percy", "Applitools", "Reflect"],
    moat: "E-commerce specific test playbooks + revenue impact scoring",
    firstExperiment:
      "Free 'store health scan' for 10 Shopify stores. Publish bug reports (anonymized) as content.",
    rank100k: 13,
    rank1m: 1,
  },
  {
    id: "08",
    slug: "contract-review-api",
    name: "Contract Review API",
    tagline: "AI redlining API for legal tech and procurement platforms",
    category: "ai-agent",
    summary:
      "B2B API that reviews contracts, flags risks, and suggests redlines. Sold to legal tech platforms, procurement tools, and marketplaces.",
    problem:
      "Legal review is slow and expensive. Platforms want AI review but building in-house requires legal expertise and liability management.",
    solution:
      "API-first contract analysis with playbooks per contract type (NDA, MSA, SaaS agreement). Returns structured risk scores and suggested edits.",
    targetCustomer: "Legal tech startups, procurement platforms, and contract management SaaS",
    aiLeverage: [
      "Clause-level risk classification",
      "Playbook-driven redline suggestions",
      "Comparison against market-standard terms",
      "Summarization for non-lawyer stakeholders",
    ],
    zeroEmployeeOps: [
      "API docs with sandbox environment",
      "Usage-based billing",
      "AI handles integration support",
      "Automated SLA monitoring",
    ],
    dimensions: baseDimensions(
      [9, 8, 6, 8, 8, 5, 3],
      [
        "Legal AI requires high accuracy; core is LLM + playbooks",
        "API delivery scales without lawyers in loop for standard docs",
        "B2B API sales cycles are 3–6 months",
        "80%+ margin at scale",
        "Playbook library + outcome data is defensible",
        "Outbound to legal tech founders; conference presence needed",
        "Lowest liability score in the portfolio: unauthorized-practice risk plus reliance on legal risk flags",
      ],
    ),
    liability: {
      level: "high",
      exposures: [
        "Unauthorized practice of law if end users treat output as advice — rules vary by state and country",
        "A missed indemnity or auto-renewal clause that costs a customer real money",
        "Custody of confidential and privileged documents",
      ],
      controls: [
        "Sell the API to legal teams and legal-tech vendors, not advice to consumers — the buyer supplies the lawyer",
        "Contractual requirement that downstream products keep a qualified reviewer in the loop",
        "Output framed as extraction and flags against a customer-supplied playbook, never a conclusion",
        "Zero-retention processing mode; documents are not stored after the response",
        "Errors-and-omissions cover sized to contract value before enterprise deals",
      ],
      redLines: [
        "No consumer-facing 'is this contract safe to sign' product",
        "No marketing that positions the output as a substitute for counsel",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 14, realistic: 22, pessimistic: 36 },
        customerCount: { count: 25, unit: "API customers @ $333/mo avg" },
        pricing: {
          model: "Per-document API pricing + platform fee",
          averageRevenue: 333,
          currency: "USD",
        },
        keyMilestones: [
          "NDA + MSA review endpoints live",
          "5 design partner integrations",
          "SOC2 Type I for enterprise trust",
          "Published accuracy benchmarks vs junior associates",
        ],
        automationStack: [
          "Document parsing pipeline (PDF/DOCX)",
          "Structured output with confidence scores",
          "Stripe metered billing",
        ],
        risks: [
          "Liability for missed clauses",
          "Harvey/Ironclad expanding API offerings",
          "Regulatory scrutiny on legal AI",
        ],
        verdict: "stretch",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 36, realistic: 48, pessimistic: 72 },
        customerCount: { count: 80, unit: "API customers @ $1,042/mo avg" },
        pricing: {
          model: "Enterprise API tiers + custom playbooks",
          averageRevenue: 1042,
          currency: "USD",
        },
        keyMilestones: [
          "20+ contract type playbooks",
          "White-label for 3 major legal platforms",
          "Human-in-loop escalation partnership (referral)",
          "International contract support (UK, EU)",
        ],
        automationStack: [
          "Multi-tenant playbook management",
          "Automated accuracy regression testing",
        ],
        risks: ["Legal liability caps growth", "Long enterprise sales cycles"],
        verdict: "stretch",
      },
    ],
    competitors: ["Harvey", "Ironclad AI", "Luminance", "Spellbook"],
    moat: "Playbook depth + platform integrations + accuracy benchmarks",
    firstExperiment:
      "Free NDA reviewer tool on website. Track API key requests from legal tech domains.",
    rank100k: 14,
    rank1m: 13,
  },
  {
    id: "09",
    slug: "a11y-regression-gate",
    name: "Accessibility Regression Gate",
    tagline: "Catch WCAG regressions in CI and ship the fix as a pull request",
    category: "devtools",
    summary:
      "A GitHub App that runs accessibility checks against every preview deployment, fails the build on new violations, and opens fix PRs for the deterministic subset. Sold per-repo to product teams under European Accessibility Act and ADA Title II pressure.",
    problem:
      "Roughly 96% of top homepages still fail WCAG, and enforcement stopped being theoretical: the EAA has been enforced since June 2025, a French court put Carrefour under a €500-per-day compliance order, and a German regulator fined a retailer €150,000 over checkout alt-text. Teams respond by buying a one-off audit, fixing the findings, and regressing within two sprints because nothing guards the build. The audit is a photograph; the codebase is a movie.",
    solution:
      "Install on the repo. Every PR gets axe-core plus keyboard-and-focus traversal run against the preview deploy, diffed against the base branch so only new violations block. For the mechanically-fixable class — missing alt text, unlabelled controls, contrast tokens, heading order, form associations — an agent opens a fix PR with a before/after screenshot. Everything else is filed as a triaged issue with the exact element, the failing success criterion, and a suggested remediation for a human to make.",
    targetCustomer:
      "10–200 person product and platform teams shipping to EU consumers, US public-sector buyers, or regulated enterprise procurement",
    aiLeverage: [
      "Agent writes the remediation patch against the actual component, not a generic snippet",
      "Triage model separates mechanically-fixable violations from ones needing design judgement",
      "Vision model checks that a fix did not break the visual layout before opening the PR",
      "Natural-language explanation of each failure mapped to the specific WCAG success criterion",
      "Learns each repo's component library so fixes match existing patterns",
    ],
    zeroEmployeeOps: [
      "GitHub Marketplace install and Stripe billing; no sales call",
      "Deterministic scanners do detection, so support volume is about configuration, not judgement calls",
      "Docs-trained support agent handles setup questions",
      "Usage metering per repo with automatic tier upgrades",
    ],
    dimensions: baseDimensions(
      [7, 9, 8, 9, 6, 8, 7],
      [
        "Detection is deterministic open-source tooling; AI earns its place in remediation and triage, not scanning",
        "Runs entirely in the customer's CI; no human in any loop",
        "Regulatory deadlines already passed, so the buyer has a live problem and a budget line",
        "90%+ margin — compute is a browser run plus a patch generation per PR",
        "Moderate: axe-core is free, so the moat is the fix loop and the repo-specific patterns, not detection",
        "GitHub Marketplace, agency partners doing EAA remediation, and search demand that regulation created",
        "Real exposure in a litigated area, but containable by refusing to certify anything",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "A customer sued for inaccessibility points at the vendor that told them they were fine",
        "Automated tooling detects only about a quarter to a third of WCAG issues — the gap between 'no violations found' and 'accessible' is where the lawsuits live",
        "Overlay-style products have repeatedly lost in court and drawn regulator attention; being mistaken for one is itself a risk",
      ],
      controls: [
        "The product reports findings and blocks regressions. It never issues a compliance statement, badge, score, or certificate",
        "Every report states the coverage limit in plain language: automated checks catch a minority of barriers and manual assistive-technology testing is required",
        "No runtime script, no DOM manipulation on the customer's live site — fixes land as reviewable source-code PRs only",
        "Marketing avoids 'compliant', 'ADA-ready', and 'EAA-ready'; the claim is 'catches regressions before they ship'",
        "Referral relationships with real accessibility auditors for the manual half, rather than pretending to cover it",
      ],
      redLines: [
        "No overlay widget, ever — the category loses in court and hurts the users it claims to serve",
        "No marketing that implies purchase confers legal compliance",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 7, realistic: 13, pessimistic: 22 },
        customerCount: { count: 70, unit: "teams @ $119/mo avg" },
        pricing: {
          model: "Per-repo SaaS ($49–$299/repo/mo by PR volume)",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "CI action that diffs violations against the base branch — the whole wedge is 'only new failures block'",
          "Fix-PR generation for the six most common mechanical violation classes",
          "Public scan of 500 EU retail checkout flows, published as an anonymised state-of-the-web report",
          "GitHub Marketplace listing plus a free single-repo tier",
          "Referral agreement with two accessibility audit firms",
        ],
        automationStack: [
          "GitHub webhooks → containerised Playwright + axe-core run → patch generation",
          "Stripe metered billing per repo",
          "Screenshot diffing to self-verify fixes before opening a PR",
        ],
        risks: [
          "GitHub, Vercel, or Netlify ships this as a free platform check",
          "Buyers want a compliance certificate and this product deliberately will not sell one",
          "Fix PRs that break layout destroy trust fast — verification quality is existential",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 26, realistic: 38, pessimistic: 54 },
        customerCount: { count: 300, unit: "orgs @ $278/mo avg" },
        pricing: {
          model: "Org-wide plans with per-repo tiers and an audit-evidence add-on",
          averageRevenue: 278,
          currency: "USD",
        },
        keyMilestones: [
          "Org-level dashboard showing regression trend across every repo",
          "Design-system mode: fix the component once, resolve violations everywhere",
          "Evidence export that an external auditor can consume — data, not conclusions",
          "Mobile (React Native, Flutter) coverage",
          "Channel partnership with agencies doing EAA remediation at scale",
        ],
        automationStack: [
          "Multi-repo scheduling with per-org compute caps",
          "Self-serve enterprise SSO",
          "Automated partner rev-share accounting",
        ],
        risks: [
          "Enterprise buyers prefer incumbent suites (Deque, Level Access) that bundle manual testing",
          "Regulatory attention could fade if EU enforcement stays light outside France and Germany",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Deque axe DevTools",
      "Siteimprove",
      "Level Access",
      "Pa11y CI (free)",
      "Lighthouse CI (free)",
    ],
    moat: "The fix loop — repo-specific remediation patterns that improve per customer — plus a deliberate refusal to sell certification, which is what makes engineering teams trust it",
    firstExperiment:
      "Scan 500 EU retailer checkout flows with axe-core, publish the anonymised failure distribution, and email each named-but-unpublished company their own report with a fix PR already opened against any public repo. Measure reply rate and PR merges.",
    rank100k: 2,
    rank1m: 3,
  },
  {
    id: "10",
    slug: "mcp-gateway-service",
    name: "Agent-Ready API Gateway",
    tagline: "Turn an existing API into a hosted, metered, agent-safe MCP server",
    category: "api-infrastructure",
    summary:
      "Managed MCP hosting for companies that already have an API. Point it at an OpenAPI spec and get a curated tool surface, OAuth, per-tenant scoping, usage metering, and eval-backed regression tests when the upstream API changes. Sold to the API vendor, not to the agent user.",
    problem:
      "There are over 20,000 MCP servers in the wild and fewer than 5% earn a dollar. Most are unmaintained community wrappers around someone else's API — which means the vendor's agent surface is being defined by a stranger, with no auth story, no metering, and no one to fix it when the spec changes. Vendors know agents are becoming a distribution channel; almost none want to staff a team to own a second API surface.",
    solution:
      "A generation-plus-hosting service. The generator turns an OpenAPI or GraphQL spec into a tool surface an agent can actually use — collapsing 200 endpoints into 20 task-shaped tools with descriptions tuned by measured agent success rate, not by transliterating the REST docs. The runtime handles OAuth, per-tenant scoping, rate limits, per-tool usage metering for billing, and audit logs. When the upstream spec changes, an eval suite runs and the diff arrives as a PR.",
    targetCustomer:
      "20–500 person B2B SaaS and API companies whose customers are starting to ask for agent access; secondarily data providers who want to sell per-call to agents",
    aiLeverage: [
      "Tool-surface design: an agent proposes the task-shaped tool set and its descriptions",
      "Eval harness scores agent task success per tool and rewrites descriptions that underperform",
      "Automatic repair proposals when the upstream spec drifts",
      "Synthetic agent traffic generated to test scoping and failure modes before customers hit them",
    ],
    zeroEmployeeOps: [
      "Self-serve onboarding from a spec URL",
      "Usage-based Stripe billing with per-tool metering built in",
      "Hosted on edge infrastructure with no servers to operate",
      "Status page and incident comms automated from health checks",
    ],
    dimensions: baseDimensions(
      [7, 9, 7, 8, 6, 7, 7],
      [
        "AI does tool-surface design and eval-driven tuning; the transport itself is plumbing",
        "Fully self-serve; no human in provisioning or support for the standard path",
        "Buyers have budget but a real procurement step — slower than a marketplace install",
        "80%+ after edge compute; a proxy is cheap until traffic is enormous",
        "Moderate: the eval corpus and tool-design patterns compound, the protocol does not",
        "Developer channels, MCP directories, and co-marketing with the vendors themselves",
        "You are a proxy in someone's auth path — real, but a well-understood infrastructure risk",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Sitting in the auth path between a vendor and its customers' agents — a token leak is the vendor's breach, with your name on it",
        "Gateway downtime that takes the vendor's agent channel offline",
        "An over-broad tool scope that lets an agent take a destructive action the user never authorised",
      ],
      controls: [
        "No credential storage by default: OAuth token pass-through with short-lived tokens, never long-lived customer keys at rest",
        "Write and destructive operations are opt-in per tool and default to requiring explicit user confirmation",
        "Request and response bodies not retained; logs record metadata only, with the vendor controlling retention",
        "Published subprocessor list, uptime history, and a liability cap tied to fees — no consequential-damage exposure",
        "Independent penetration test before the first enterprise contract",
      ],
      redLines: [
        "No retaining or training on data flowing through the gateway",
        "No exposing a destructive tool without an explicit vendor sign-off recorded in the config",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 17, pessimistic: 28 },
        customerCount: { count: 42, unit: "vendors @ $199/mo avg" },
        pricing: {
          model: "Platform fee ($99–$499/mo) plus per-call overage",
          averageRevenue: 199,
          currency: "USD",
        },
        keyMilestones: [
          "Spec-to-tools generator with the eval harness, since agent success rate is the only real proof",
          "Hosted runtime with OAuth and per-tenant scoping",
          "Five design-partner vendors whose community MCP wrappers are already broken",
          "Public benchmark: agent task success on generated tool surfaces vs. raw REST transliteration",
          "Directory listings and co-marketing with design partners",
        ],
        automationStack: [
          "Edge runtime with per-tenant isolation",
          "Stripe metered billing keyed to the gateway's own usage counters",
          "Nightly eval runs against every hosted surface with regression alerts",
        ],
        risks: [
          "Platform absorption is the dominant risk: Cloudflare, Stripe, or the API-tooling vendors ship this natively",
          "Vendors decide to own the surface in-house once it matters",
          "MCP itself gets superseded — the eval and tool-design assets transfer, the transport work does not",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 28, realistic: 42, pessimistic: 60 },
        customerCount: { count: 190, unit: "vendors @ $439/mo avg" },
        pricing: {
          model: "Tiered platform fee with volume-based call pricing and a revenue-share tier for metered tools",
          averageRevenue: 439,
          currency: "USD",
        },
        keyMilestones: [
          "Billing rails so vendors can charge agents per tool call and settle through the gateway",
          "Multi-region deployment with data-residency controls",
          "Marketplace presence for agent builders discovering vendor tools",
          "SOC 2 Type II, which becomes table stakes once the gateway is in the auth path",
        ],
        automationStack: [
          "Automated compliance evidence collection",
          "Self-serve enterprise onboarding with contract templates",
          "Cost-aware routing with per-vendor spend caps",
        ],
        risks: [
          "Margin compression if the protocol commoditises to a free platform feature",
          "Concentration risk if a handful of vendors carry most of the revenue",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Cloudflare remote MCP hosting",
      "Zapier MCP",
      "Apify (MCP hosting, pay-per-event)",
      "Speakeasy / Stainless (spec-to-SDK, moving adjacent)",
      "MCPize",
      "Nevermined",
    ],
    moat: "The eval corpus — measured agent success rates across thousands of tool surfaces — which tells you what a good tool description looks like and cannot be copied from the spec",
    firstExperiment:
      "Take the ten most-wrapped public APIs, benchmark agent task success on the existing community MCP servers against a generated surface, and send each vendor their own scorecard. Measure how many ask who owns their agent surface.",
    rank100k: 10,
    rank1m: 7,
  },
  {
    id: "11",
    slug: "brand-watch-intelligence",
    name: "Brand Conflict Watch",
    tagline: "Weekly trademark, domain, and marketplace conflict alerts for small brand owners",
    category: "data-product",
    summary:
      "Monitoring across trademark registries, domain registrations, app stores, and marketplaces, scored for genuine conflict risk and delivered as a weekly digest plus instant alerts. Informational monitoring priced for brand owners who cannot justify a law-firm watch service.",
    problem:
      "The opposition window opens when a mark is published and runs 30 days whether the owner noticed or not. Law-firm watch services are priced per mark and per jurisdiction; the cheap end of the market is a keyword scan of one database emailed monthly. Small brand owners consequently discover conflicts after the window closed, when the only remaining options are expensive.",
    solution:
      "Ingest public registry data (USPTO, EUIPO, WIPO), domain registration feeds, app-store listings, and marketplace seller data. Score each candidate conflict on phonetic similarity, semantic similarity, goods-and-services overlap, and logo-embedding distance, so the digest is short enough to actually read. Every alert ships with an evidence pack — filing details, specimen images, dates, deadline — formatted to hand straight to an attorney.",
    targetCustomer:
      "Brand owners with 1–20 marks: DTC brands, agencies managing client portfolios, and trademark filing services that want to white-label monitoring",
    aiLeverage: [
      "Similarity scoring that combines phonetic, semantic, and visual signals instead of string matching",
      "Goods-and-services overlap classification from Nice class descriptions written in registry-speak",
      "Logo similarity via image embeddings across design marks",
      "Plain-language explanation of why each alert scored the way it did",
      "Noise suppression learned from which alerts a customer dismisses",
    ],
    zeroEmployeeOps: [
      "Bulk public data ingested on a schedule; no manual research",
      "Self-serve signup keyed to a mark or portfolio",
      "Digest generation and delivery fully automated",
      "Attorney referral handled by directory handoff, not by a salesperson",
    ],
    dimensions: baseDimensions(
      [6, 9, 8, 9, 6, 6, 6],
      [
        "AI improves precision materially, but the underlying value is timely public data — this is a data product first",
        "Ingest, score, deliver: no human touches a customer alert",
        "Low price point and an obvious trigger event (a new filing) make self-serve conversion fast",
        "90%+ — public bulk data, cheap embedding costs, no per-customer marginal work",
        "Moderate: the data is public to everyone; the moat is scoring quality and dismissal feedback",
        "SEO against 'trademark monitoring' intent plus white-label deals with filing services",
        "Sits next to legal advice and must never cross into it — manageable, but the line is the whole design",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Unauthorized practice of law if an alert reads as an opinion on infringement rather than a notification of a filing",
        "A missed conflict during a lapsed ingest, after which the opposition deadline is gone",
        "Naming a third party's filing in a risk-scored alert that reaches the wrong audience",
      ],
      controls: [
        "Alerts state facts and similarity scores. They never say 'this infringes', 'you should oppose', or recommend a legal course of action",
        "Prominent, non-buried notice that this is monitoring, not legal advice, plus one-click handoff to an independent attorney",
        "Coverage page publishing exactly which registries and feeds are monitored, at what refresh cadence, with the gaps named",
        "Best-effort terms with no deadline guarantee, and automated ingest-failure alerts to customers when a source goes stale",
        "Attorney referrals are unpaid or flat-fee directory listings — no per-matter fee-sharing, which is prohibited in most jurisdictions",
      ],
      redLines: [
        "No filing, opposing, or corresponding with any registry on a customer's behalf",
        "No revenue share with attorneys on matters generated by an alert",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 8, realistic: 15, pessimistic: 24 },
        customerCount: { count: 190, unit: "portfolios @ $44/mo avg" },
        pricing: {
          model: "Per-portfolio subscription ($19–$99/mo by mark count and jurisdictions)",
          averageRevenue: 44,
          currency: "USD",
        },
        keyMilestones: [
          "USPTO ingest plus similarity scoring — one jurisdiction done well beats four done shallowly",
          "Weekly digest with an evidence pack per alert",
          "EUIPO and WIPO coverage",
          "Free 'watch one mark' tier as the acquisition channel",
          "First white-label deal with a trademark filing service",
        ],
        automationStack: [
          "Scheduled bulk-data ingest with staleness alerting",
          "Embedding index for phonetic, semantic, and logo similarity",
          "Stripe self-serve billing; transactional email for digests",
        ],
        risks: [
          "Low ARPU means churn hurts disproportionately — a brand owner who sees no conflicts for a year cancels",
          "Incumbents (Corsearch, CompuMark) could launch a cheap self-serve tier",
          "Registry bulk-data format changes break ingest silently if not monitored",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 46, pessimistic: 66 },
        customerCount: { count: 900, unit: "portfolios + white-label seats @ $93/mo avg" },
        pricing: {
          model: "Tiered subscription plus white-label API priced per monitored mark",
          averageRevenue: 93,
          currency: "USD",
        },
        keyMilestones: [
          "Marketplace and app-store counterfeit monitoring as the upsell tier",
          "White-label API as the primary growth channel — agencies and filing services carry the distribution",
          "Portfolio analytics for agencies managing hundreds of marks",
          "Coverage beyond US and EU into the jurisdictions those agencies actually file in",
        ],
        automationStack: [
          "Multi-tenant API with per-partner rate limits and rev-share accounting",
          "Automated coverage-gap reporting to keep the published claims honest",
        ],
        risks: [
          "SMB churn caps direct revenue; the $1M path depends almost entirely on the white-label channel landing",
          "Enforcement, which is where the money is, is exactly the part this business will not do",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Corsearch",
      "Clarivate CompuMark",
      "Markify",
      "Trademark Engine monitoring",
      "Law-firm watch services",
    ],
    moat: "Scoring precision tuned on dismissal feedback — the product wins by sending fewer, better alerts, which is the opposite of what keyword-alert incumbents optimise",
    firstExperiment:
      "Run the scorer over the last 12 months of USPTO publications for 200 DTC brands, then send each brand the conflicts they missed, with dates and deadlines. Conversion on 'here is what you did not see' is the whole thesis.",
    rank100k: 8,
    rank1m: 12,
  },
  {
    id: "12",
    slug: "public-bid-radar",
    name: "Public Bid Radar",
    tagline: "Government RFPs matched to what your firm can actually win",
    category: "data-product",
    summary:
      "Aggregates state, local, and education procurement notices from official open-data sources, scores each against a firm's capability profile and award history, and produces a go/no-go brief. Public data only; no bid is ever submitted on the customer's behalf.",
    problem:
      "Tens of thousands of US public agencies publish bids across a fragmented mess of portals. Enterprise intelligence platforms are priced for firms with a capture team, so smaller contractors and agencies fall back on keyword email alerts and drown — hundreds of irrelevant notices a week, each requiring a document download to find out that a bonding requirement or a set-aside disqualifies them on page 14.",
    solution:
      "Normalize notices from official open-data endpoints and portal APIs into one schema, then extract the disqualifying facts up front: bonding, insurance minimums, licensing, set-aside status, incumbent, historical award values for the same commodity code. Score fit against the firm's profile and past wins, and produce a one-page go/no-go brief with the reasons for the recommendation and a response outline.",
    targetCustomer:
      "5–100 person firms that already sell to government: specialty contractors, IT and staffing resellers, professional-services and engineering firms, and the consultants who chase bids for them",
    aiLeverage: [
      "Extraction of requirements from unstructured solicitation PDFs and addenda",
      "Fit scoring against a capability profile built from the firm's own past awards",
      "Historical award analysis: who won, at what price, how often the incumbent renews",
      "Draft response outlines mapped to the solicitation's own evaluation criteria",
      "Change detection on addenda, which is where deadlines quietly move",
    ],
    zeroEmployeeOps: [
      "Scheduled ingest from official open-data endpoints — no manual collection",
      "Self-serve onboarding by uploading past awards or naming a commodity code",
      "Briefs generated and emailed automatically on a cadence the customer sets",
      "Support handled by a docs-trained agent; the product has no services component",
    ],
    dimensions: baseDimensions(
      [8, 8, 7, 8, 7, 6, 8],
      [
        "Extraction and fit-scoring across messy solicitation documents is exactly what models are good at",
        "Fully automated pipeline, though ingest breakage needs monitoring rather than staffing",
        "Buyers have a budget line for bid intelligence already; the sale is a switch, not a new category",
        "80%+ — public data with no licensing fees; costs are extraction compute and storage",
        "Award-history corpus compounds: the longer it runs, the better the win-probability scoring",
        "Trade associations, procurement consultants, and SEO against a specific set of commodity codes",
        "Public records, no advice, no submissions — one of the cleanest liability shapes in the portfolio",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Crawling portals whose terms of service prohibit automated retrieval",
        "A missed or mis-parsed deadline that costs a customer a bid they would have won",
        "Contact data inside notices falling under privacy rules if treated as a marketing list",
      ],
      controls: [
        "Official open-data APIs, published bulk feeds, and portals whose terms permit automated access — the ingest list records the permission basis for each source",
        "No credentialed scraping, no account creation to reach gated content, documented crawl rate and identified user agent",
        "Every brief links to the authoritative source notice and states that the agency's posting governs; deadlines are shown as retrieved-at, not as guarantees",
        "Contact fields are displayed in context, never exported as a marketing list or sold",
        "Terms disclaim bid outcomes; the product informs a decision it does not make",
      ],
      redLines: [
        "No submitting a bid, registering, or corresponding with an agency on a customer's behalf",
        "No ingesting a source whose terms forbid it, however valuable the data",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 9, realistic: 16, pessimistic: 26 },
        customerCount: { count: 60, unit: "firms @ $139/mo avg" },
        pricing: {
          model: "Per-firm subscription ($79–$399/mo by geography and commodity-code breadth)",
          averageRevenue: 139,
          currency: "USD",
        },
        keyMilestones: [
          "Ingest for one state plus federal SAM.gov, normalized into a single schema",
          "Requirement extraction that surfaces disqualifiers on the summary line",
          "Go/no-go brief generation with reasons attached",
          "Free weekly digest for one commodity code as the acquisition channel",
          "Award-history backfill, which is what makes fit scoring better than keywords",
        ],
        automationStack: [
          "Scheduled ingest with per-source health monitoring and staleness alerts",
          "Document extraction pipeline with confidence thresholds and human-review flags surfaced to the customer",
          "Stripe self-serve billing; transactional digests",
        ],
        risks: [
          "Portal fragmentation makes coverage expensive to widen — each new source is bespoke",
          "Free federal sources set a low anchor price in buyers' minds",
          "Deltek GovWin could introduce a genuine SMB tier",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 26, realistic: 38, pessimistic: 56 },
        customerCount: { count: 260, unit: "firms @ $320/mo avg" },
        pricing: {
          model: "Tiered by geography and seats, plus an API tier for consultants and resellers",
          averageRevenue: 320,
          currency: "USD",
        },
        keyMilestones: [
          "National coverage across state, local, and education procurement",
          "Win-probability model trained on the accumulated award corpus",
          "Pipeline and teaming features for firms bidding jointly",
          "API and white-label tier for procurement consultants",
        ],
        automationStack: [
          "Self-healing ingest that opens a PR when a source schema changes",
          "Per-tenant capability profiles with automated award-history refresh",
        ],
        risks: [
          "Coverage debt compounds — every ingest source is a maintenance liability",
          "Government-adjacent buyers procure slowly and expect annual invoicing, which strains cash",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Deltek GovWin IQ",
      "BidPrime",
      "GovSpend",
      "Periscope / Bonfire portals",
      "SAM.gov (free)",
    ],
    moat: "The normalized award-history corpus. Notices are public and copyable; a decade of who-won-what-at-what-price, linked across fragmented portals, is not",
    firstExperiment:
      "Ingest one state's procurement portal, generate go/no-go briefs for 50 recent solicitations, and send each to a firm that bid on similar work. Measure whether they agree with the recommendation — accuracy against people who know the market is the only signal worth having early.",
    rank100k: 9,
    rank1m: 5,
  },
  {
    id: "13",
    slug: "multi-location-listing-guard",
    name: "Multi-Location Listing Guard",
    tagline: "Catches brand-standard and disclosure drift across every franchise location",
    category: "vertical-saas",
    summary:
      "Continuous monitoring of every location's public listings, pages, hours, pricing, and required disclosures against the franchisor's brand standard, with an exception queue and prefilled correction requests. Aimed at mid-market franchisors priced out of enterprise location-management suites.",
    problem:
      "A 60-unit franchisor's brand exists in 60 places it does not control. Franchisees change hours, invent promotions, post out-of-date pricing, drop required disclosures, and use logos from three refreshes ago. Enterprise suites solve this for national chains at national-chain prices; the 20-to-200-unit franchisor checks manually, or does not check, and finds out when a customer complains or a regulator does.",
    solution:
      "Monitor each location's public surface — listing profiles, local pages, menus and price lists, review responses — and compare against the brand standard the franchisor defines once. Vision and text models flag drift: wrong logo, expired promotion, missing disclosure, hours contradicting the listing. Output is an exception queue with severity and a prefilled correction request the franchisor sends to the franchisee.",
    targetCustomer:
      "Franchisors and multi-location operators with 20–300 units in food service, fitness, home services, and personal care — plus the franchise-development consultancies that advise them",
    aiLeverage: [
      "Vision comparison of logos, storefront images, and promotional creative against the brand kit",
      "Text comparison of pricing, hours, and offers against the current standard",
      "Detection of missing required disclosures, which is the part that turns brand drift into legal risk",
      "Severity triage so the franchisor sees ten items, not four hundred",
      "Drafted correction requests in the franchisor's own tone",
    ],
    zeroEmployeeOps: [
      "Location list imported once; monitoring runs on a schedule with no operator involvement",
      "Exception queue and correction requests generated automatically",
      "Per-location pricing meters itself as the franchise grows",
      "Self-serve onboarding with a free audit of ten locations as the entry point",
    ],
    dimensions: baseDimensions(
      [8, 8, 7, 9, 6, 6, 8],
      [
        "Vision plus text comparison at this scale is only economical with models; manual checking is what it replaces",
        "Fully scheduled monitoring; the franchisor works the queue, not the vendor",
        "The free audit demonstrates the problem immediately, which shortens the sale considerably",
        "85%+ — public page fetches and periodic model calls per location",
        "Moderate: brand-standard configuration and drift history create switching cost, the monitoring itself is replicable",
        "Franchise associations, franchise-development consultants, and conference presence in a tight-knit industry",
        "Observes public pages about the customer's own network; low exposure with basic crawl discipline",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Fetching listing platforms at a rate or in a manner their terms prohibit",
        "A false 'compliant' reading on a required disclosure that later draws a regulator",
        "Franchise-relationship sensitivity: monitoring output used punitively in a dispute between franchisor and franchisee",
      ],
      controls: [
        "Official platform APIs where they exist; otherwise polite, rate-limited, identified fetching of public pages within terms",
        "Findings are flagged observations with evidence and a timestamp — the product never certifies that a location is compliant",
        "Disclosure checks cite the specific brand-standard rule they came from, so the franchisor's own counsel owns the underlying legal question",
        "Monitors only locations the customer attests it franchises or operates, recorded at onboarding",
        "Evidence retention windows configurable, since this data can end up in franchise disputes",
      ],
      redLines: [
        "No monitoring a competitor's locations for a customer",
        "No representing that a flagged-clean location satisfies any law or regulation",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 8, realistic: 15, pessimistic: 24 },
        customerCount: { count: 22, unit: "franchisors @ $379/mo avg" },
        pricing: {
          model: "Per-location pricing ($6–$15/location/mo) with a platform minimum",
          averageRevenue: 379,
          currency: "USD",
        },
        keyMilestones: [
          "Brand-standard configuration plus listing and local-page monitoring",
          "Free ten-location audit as the acquisition offer",
          "Exception queue with severity and prefilled correction requests",
          "Vision checks for logo and creative drift",
          "Two franchise-consultancy referral partnerships",
        ],
        automationStack: [
          "Scheduled fetch and diff per location with change history",
          "Vision and text comparison pipeline with per-tenant brand kits",
          "Stripe per-location metered billing",
        ],
        risks: [
          "Franchisors may see this as a franchisee-relations problem rather than a software purchase",
          "Yext, SOCi, and Chatmeter moving down-market",
          "Platform API access terms changing under the product",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 24, realistic: 36, pessimistic: 52 },
        customerCount: { count: 115, unit: "franchisors @ $725/mo avg" },
        pricing: {
          model: "Per-location tiers with a compliance-evidence add-on and multi-brand accounts",
          averageRevenue: 725,
          currency: "USD",
        },
        keyMilestones: [
          "Franchisee-facing portal so corrections close the loop without email",
          "Multi-brand accounts for franchise holding groups",
          "Ad and paid-social creative monitoring",
          "Drift benchmarking across the customer base as an anonymised industry report",
        ],
        automationStack: [
          "Per-brand rule engines configured by the customer, not by the vendor",
          "Automated partner rev-share for consultancy referrals",
        ],
        risks: [
          "Per-location pricing caps ARPU unless the location count grows",
          "Sales cycle lengthens as deal size grows, which strains a zero-employee model",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["Yext", "SOCi", "Chatmeter", "Rio SEO", "Manual franchisor spot checks"],
    moat: "Configured brand standards plus accumulated drift history per network — switching means re-teaching the system what the brand is",
    firstExperiment:
      "Audit ten locations each for twenty mid-market franchisors and send each franchisor their own drift report unprompted. Measure how many reply asking about the locations not in the sample.",
    rank100k: 6,
    rank1m: 9,
  },
  {
    id: "14",
    slug: "docs-debt-service",
    name: "Docs Debt Service",
    tagline: "Documentation that keeps pace with the codebase, drafted by agents and reviewed by contract writers",
    category: "content-automation",
    summary:
      "A retainer service that keeps a developer product's documentation current: agents draft reference and guide updates as PRs from the actual diff, and a vetted contract technical writer reviews the queue. The clearest test in the portfolio of whether AI-managed contractors beat pure software.",
    problem:
      "Developer-tool companies ship faster than they document, and the cost of stale docs went up in 2026: docs are now the interface that AI assistants read on a developer's behalf, so a wrong parameter in a reference page becomes a wrong answer inside every coding agent that retrieves it. Hiring a technical writer is a $120k+ commitment that a 20-person company defers indefinitely.",
    solution:
      "Connect the repo and changelog. On each release, an agent diffs the public API surface against the docs, drafts the updates as PRs against the docs repo, and assembles a review queue ordered by risk. A contract technical writer — sourced, scheduled, and paid per accepted PR by the same system — reviews the queue. The customer gets a monthly retainer with a stated PR throughput, not an hourly invoice.",
    targetCustomer:
      "Seed to Series B developer-tool and API companies with 5–50 engineers, no technical writer, and a public docs site that is visibly behind",
    aiLeverage: [
      "Diffs the shipped API surface against documented behaviour and finds the gaps",
      "Drafts reference updates, migration notes, and examples from the code and tests themselves",
      "Verifies code samples by executing them before a human ever sees the PR",
      "Assembles and prioritises the review queue so contractor time goes to the risky pages",
      "Handles contractor assignment, review SLAs, and per-accepted-PR payouts",
    ],
    zeroEmployeeOps: [
      "Contractors are project-scoped, work for multiple clients, and are paid per accepted PR — no employment relationship",
      "Assignment, review deadlines, and payouts run from the queue with no coordinator",
      "Retainer billing via Stripe; no hourly reconciliation",
      "Customer intake is a repo connection plus a style guide upload",
    ],
    dimensions: baseDimensions(
      [7, 6, 9, 6, 4, 6, 8],
      [
        "Agents do the drafting and verification; the human is a reviewer, which is where the leverage stops",
        "Weakest automation score in the portfolio — contractor supply and quality need real oversight even when the tooling is good",
        "Highest in the portfolio: services sell in weeks, and a retainer bills from month one",
        "60–70% after contractor cost, versus 85%+ for pure software — this is the price of the review layer",
        "Low: the offer is replicable and the customer relationship is the only real asset",
        "Developer communities, docs-platform partnerships, and outbound to companies whose docs are visibly stale",
        "Repo access and contractor classification are the exposures, both well-understood and contractually manageable",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Contractor misclassification if the arrangement starts to look like employment — set hours, exclusivity, integration into the customer's team",
        "Access to customer repositories, sometimes including private code, shared with a contractor",
        "Incorrect documentation that leads a developer into a costly integration mistake",
        "Cross-border contractor payment, tax, and sanctions screening",
      ],
      controls: [
        "Contractors set their own hours, serve multiple clients, use their own equipment, and are engaged per project with no exclusivity — reviewed against the applicable classification tests before scaling",
        "Read-only, per-customer scoped repo access; contractor NDAs; access revoked automatically when a project closes",
        "Every published change goes through the customer's own PR approval — the service proposes, the customer merges",
        "Contractor payouts run through a compliance-screened payments provider that handles tax forms and sanctions checks",
        "Retainer terms promise throughput and review, not documentation accuracy warranties",
      ],
      redLines: [
        "No contractor engagement structured with set hours or exclusivity, however convenient",
        "No pushing directly to a customer's default branch",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 5, realistic: 10, pessimistic: 18 },
        customerCount: { count: 17, unit: "companies @ $490/mo avg" },
        pricing: {
          model: "Monthly retainer ($290–$1,200/mo by release cadence and repo count)",
          averageRevenue: 490,
          currency: "USD",
        },
        keyMilestones: [
          "Drift detector that diffs the public API surface against the docs — this is the demo that sells the service",
          "PR drafting with executed, verified code samples",
          "Three contract writers onboarded with a per-accepted-PR rate card",
          "Five retainer customers sourced from a public 'your docs are stale' audit campaign",
          "Review-queue tooling that makes a writer's hour worth three",
        ],
        automationStack: [
          "Repo webhooks → surface diff → draft PR → sample execution in a sandbox",
          "Queue with assignment, SLA tracking, and per-PR payouts",
          "Stripe retainer billing with usage reporting to the customer",
        ],
        risks: [
          "Contractor supply and quality are the binding constraint, not demand",
          "Docs platforms (Mintlify, ReadMe) shipping agentic drift detection natively",
          "Retainer churn when a customer finally hires a writer — success looks like graduation",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 34, realistic: 54, pessimistic: 72 },
        customerCount: { count: 105, unit: "companies @ $790/mo avg" },
        pricing: {
          model: "Tiered retainers plus a self-serve software-only tier at higher margin",
          averageRevenue: 790,
          currency: "USD",
        },
        keyMilestones: [
          "Software-only tier that sells the drift detector without the review layer",
          "Contractor bench deep enough to absorb demand spikes without quality loss",
          "Agent-retrievability scoring — measuring whether AI assistants answer correctly from the customer's docs",
          "Partnership with a docs platform as a bundled service tier",
        ],
        automationStack: [
          "Automated contractor sourcing, trial assignment, and quality scoring",
          "Margin monitoring per account so unprofitable retainers surface immediately",
        ],
        risks: [
          "Services scale sublinearly; $1M means either a large bench or a genuine product pivot",
          "Margin compression as contractor rates rise faster than retainer prices",
          "The software-only tier cannibalises the retainer — which may be the right outcome, and changes the business",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Mintlify",
      "ReadMe",
      "Docs agencies and freelance technical writers",
      "In-house technical writer hire",
    ],
    moat: "Almost none as a service. The durable asset is the drift detector and the review queue — the reason to run the service at all is that it funds building them against real repos",
    firstExperiment:
      "Run the drift detector against 30 public developer-tool docs sites, and send each company a list of their documented-but-wrong parameters with one fix PR already open. Reply rate measures both the pain and the accuracy in a single test.",
    rank100k: 5,
    rank1m: 14,
  },
];
