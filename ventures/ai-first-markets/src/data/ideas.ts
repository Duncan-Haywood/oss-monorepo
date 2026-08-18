import type { BusinessIdea } from "@/lib/types";

const baseDimensions = (
  scores: [number, number, number, number, number, number],
  rationales: [string, string, string, string, string, string],
) => [
  {
    key: "ai-leverage",
    label: "AI Leverage",
    score: scores[0],
    maxScore: 10,
    rationale: rationales[0],
  },
  {
    key: "automation",
    label: "Zero-Employee Ops",
    score: scores[1],
    maxScore: 10,
    rationale: rationales[1],
  },
  {
    key: "time-to-revenue",
    label: "Time to Revenue",
    score: scores[2],
    maxScore: 10,
    rationale: rationales[2],
  },
  {
    key: "margin",
    label: "Gross Margin",
    score: scores[3],
    maxScore: 10,
    rationale: rationales[3],
  },
  {
    key: "defensibility",
    label: "Defensibility",
    score: scores[4],
    maxScore: 10,
    rationale: rationales[4],
  },
  {
    key: "market-access",
    label: "Distribution",
    score: scores[5],
    maxScore: 10,
    rationale: rationales[5],
  },
];

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
      [9, 9, 8, 8, 6, 7],
      [
        "Core product is AI-native; quality directly tied to model improvements",
        "Fully API-driven; no human reviewers in the loop for v1",
        "GitHub Marketplace enables revenue within 4–8 weeks of MVP",
        "85%+ gross margin after inference costs at scale",
        "Moat from team-specific fine-tuning, not raw model access",
        "GitHub Marketplace + dev Twitter + Product Hunt distribution",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Customer source code leaves the customer's perimeter for inference (IP and confidentiality exposure)",
        "A missed vulnerability in a reviewed PR gets attributed to the tool",
        "Enterprise buyers demand a DPA, subprocessor list, and SOC 2 before six-figure deals",
      ],
      controls: [
        "Zero-retention inference endpoints; contractually never train on customer code",
        "Positioned in docs and ToS as review assistance, not a security guarantee",
        "Suggestions only — never auto-merge; a human approves every change",
        "Least-privilege GitHub App scopes, per-tenant isolation, short log retention",
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
      [9, 8, 7, 7, 7, 8],
      [
        "Voice AI is the product; continuous prompt tuning per vertical",
        "Call handling fully automated; human escalation optional",
        "Trades owners buy fast when they see missed-call ROI",
        "60–70% margin after telephony + inference",
        "Vertical data (pricing, dispatch rules) creates stickiness",
        "Facebook groups, trade associations, Google Local Services ads",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Call recording consent varies by state (two-party consent jurisdictions)",
        "Outbound SMS follow-up touches TCPA and carrier 10DLC rules",
        "A missed or mishandled emergency call causes real harm to a caller and the customer",
        "Several states now require disclosure when a caller is speaking with AI",
      ],
      controls: [
        "Disclose the AI at the start of every call; keep the disclosure non-skippable",
        "Recording enabled per-jurisdiction with consent language; recording off by default",
        "Inbound and customer-initiated messaging only — no cold outbound campaigns",
        "Explicit out-of-scope list (medical, emergency dispatch) with immediate human transfer",
        "Liability capped at fees paid; customer remains the service provider of record",
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
    rank100k: 2,
    rank1m: 3,
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
      [8, 9, 6, 9, 7, 6],
      [
        "Doc generation and monitoring are AI-native workflows",
        "Evidence collection fully automated via integrations",
        "Longer sales cycle (60–90 days) slows early revenue",
        "90%+ gross margin; minimal COGS",
        "Control mappings + customer evidence history",
        "Outbound to CTOs + partnerships with Vanta/Drata alternatives",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Customers may treat generated policies as audit-ready or as legal advice",
        "Wrong control language contributes to a failed audit the customer paid for",
        "Storing customers' control evidence concentrates sensitive security data",
      ],
      controls: [
        "Sold as drafting and maintenance support; the auditor and counsel stay in the loop",
        "Never signs, attests to, or submits anything on the customer's behalf",
        "Prominent 'not legal or audit advice' notice in product, docs, and ToS",
        "Evidence stored encrypted with tenant isolation and customer-controlled deletion",
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
    rank100k: 6,
    rank1m: 8,
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
      [7, 9, 7, 8, 6, 6],
      [
        "AI adds signal on top of commodity monitoring",
        "Fully automated probes and alerting",
        "Devs pay quickly when they have recent outage pain",
        "80%+ margin; probe costs are low",
        "Dependency graph data improves over time",
        "Dev communities, Hacker News, integration marketplaces",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Probing third-party APIs can violate the provider's terms or rate limits",
        "Publishing comparative reliability claims invites trade-libel complaints from vendors",
      ],
      controls: [
        "Prefer documented status endpoints and customer-authorized probes over unsanctioned polling",
        "Publish the measurement methodology and raw sample counts alongside every claim",
        "Vendor right-of-reply and a correction process before adverse numbers go public",
        "Conservative rate limits and honored robots/ToS on every monitored surface",
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
    rank100k: 5,
    rank1m: 4,
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
      [9, 9, 8, 9, 5, 7],
      [
        "Entire value prop is AI content quality",
        "No human editors; user approves in app",
        "Fastest path to revenue — founders pay $99/mo impulsively",
        "92%+ gross margin",
        "Low defensibility; voice matching is replicable",
        "LinkedIn itself + founder Twitter + podcast sponsorships",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Platform terms restrict unauthorized automation; account bans hit customers, not just the vendor",
        "Generated posts can plagiarize, defame, or make unsubstantiated claims under the customer's name",
        "FTC endorsement and disclosure rules apply to promotional content",
      ],
      controls: [
        "Official APIs and scheduled publishing only — no headless browser automation of accounts",
        "Human approval required before any post is published; drafts by default",
        "Originality and claim checks in the pipeline; refuse to draft attacks on named individuals",
        "Customer owns and is responsible for published content; stated plainly in ToS",
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
    rank100k: 3,
    rank1m: 5,
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
      [8, 9, 7, 7, 5, 7],
      [
        "RAG quality is the product differentiator",
        "Fully managed infra; no ops headcount",
        "Devs adopt fast with generous free tier",
        "70% margin after embedding costs",
        "Commoditizing fast; needs dev experience moat",
        "Developer marketing: docs, tutorials, Discord",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Ingesting customer documents makes the business a GDPR processor with full processor duties",
        "A breach exposes multiple tenants' proprietary knowledge bases at once",
        "Customers may ingest content they do not hold the rights to",
      ],
      controls: [
        "DPA with a published subprocessor list, regional storage options, and deletion SLAs",
        "Per-tenant encryption keys and hard tenant isolation at the index layer",
        "No training on customer data, ever; contractual and enforced at the infra layer",
        "Acceptable use policy placing ingestion rights on the customer",
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
    rank100k: 7,
    rank1m: 9,
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
      [9, 8, 7, 8, 7, 8],
      [
        "Vision + agent AI is core to detection quality",
        "Test runs fully automated; no QA analysts",
        "Shopify App Store enables discovery",
        "75%+ margin after compute",
        "Store-specific baselines improve over time",
        "Shopify App Store + agency partnerships",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Test agents running against a live storefront can create real orders or mutate real data",
        "Test runs require store credentials and payment sandbox access",
      ],
      controls: [
        "Staging-first by default; production runs require an explicit opt-in and a scoped test account",
        "Destructive-action allowlist with a hard stop on real payment capture",
        "Secrets held in a managed vault, scoped per store, rotated on schedule",
        "Findings are reports, not automatic changes to the storefront",
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
    rank100k: 8,
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
      [9, 8, 6, 8, 8, 5],
      [
        "Legal AI requires high accuracy; core is LLM + playbooks",
        "API delivery scales without lawyers in loop for standard docs",
        "B2B API sales cycles are 3–6 months",
        "80%+ margin at scale",
        "Playbook library + outcome data is defensible",
        "Outbound to legal tech founders; conference presence needed",
      ],
    ),
    liability: {
      level: "high",
      exposures: [
        "Redlining contracts edges into unauthorized practice of law in most US states",
        "A missed clause can cause direct, quantifiable financial loss the customer will attribute to the tool",
        "Processing counterparties' confidential agreements concentrates privileged material",
      ],
      controls: [
        "Sold only as B2B infrastructure to legal-tech and procurement platforms that keep a lawyer in the loop — never direct to consumers",
        "Contractual requirement that the buyer presents output as a draft for attorney review",
        "Short retention windows, no training on customer contracts, per-tenant encryption",
        "Errors-and-omissions cover and a liability cap sized to the contract value before scaling",
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
    rank1m: 10,
  },
  {
    id: "09",
    slug: "local-answer-visibility",
    name: "Answer Engine Visibility for Local Services",
    tagline: "Tells a plumber whether ChatGPT recommends them, and what to fix",
    category: "data-product",
    summary:
      "A $39-79/month subscription that runs a fixed panel of buying-intent prompts through ChatGPT, Gemini, Perplexity and Google AI Overviews every week for one local service business, tracks whether that business is named and cited, and returns a short ordered fix list. The enterprise tier of this market is well served and expensive; the local tier is not served at all.",
    problem:
      "Local service buyers increasingly ask an assistant instead of scrolling a map pack, and the assistant names three businesses. Owners have no idea whether they are one of them. Existing AI-visibility tools are built and priced for brand marketing teams, so a six-van HVAC company has no way to find out and no idea what to change.",
    solution:
      "Onboard with a business name, service area, and category. The system generates a panel of 30-60 local buying prompts, runs them on a weekly schedule across assistants, extracts brand mentions, competitor mentions, and cited sources, then produces a ranked fix list: the citation sources the assistants actually pulled from, which of those the business is missing or wrong on, and the specific edits that close the gap.",
    targetCustomer:
      "Owner-operated local service businesses (trades, dental, legal, veterinary, medspa) in the US, and the small agencies that manage them",
    aiLeverage: [
      "Prompt panels are generated per category and service area, not hand-written",
      "Mention, sentiment, and citation extraction from unstructured assistant answers",
      "Fix list is drafted from the delta between cited sources and the business's actual listings",
      "Category-level benchmarks improve as more businesses in the same vertical are tracked",
    ],
    zeroEmployeeOps: [
      "Self-serve signup with a free one-off scan as the hook",
      "Stripe subscriptions; weekly report delivered by email, no login required",
      "Scheduled runs on cron workers with per-account inference cost caps",
      "Agency reseller tier is the same product with a white-label PDF",
      "Support is a docs bot; the report itself is the onboarding",
    ],
    dimensions: baseDimensions(
      [9, 9, 9, 7, 3, 8],
      [
        "The product is literally LLM output measured over time; nothing else produces the data",
        "Fully scheduled and self-serve; no human touches a single account",
        "Low price point and an existing local-business channel put first revenue weeks out",
        "Inference per account per week is a real recurring cost; 75-85% gross margin, not 90%",
        "Weakest dimension by far. Trivially cloned, and the upmarket tools can price down at will",
        "Reaches the same buyer as the local-site-studio venture; agency resellers compound it",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Promising ranking or recommendation outcomes would be a deceptive-advertising problem",
        "Automated querying of assistant products can run into platform terms and rate limits",
        "Reports name competitors, so factual accuracy about other businesses matters",
      ],
      controls: [
        "No guarantee language anywhere; the product sells measurement and a fix list, not placement",
        "Official APIs and documented rate limits only; no scraping of consumer chat interfaces",
        "Competitor mentions reproduced verbatim from assistant output with the prompt and date attached",
        "Every report states the sample size and that assistant answers vary run to run",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 7, realistic: 12, pessimistic: 20 },
        customerCount: { count: 175, unit: "businesses @ $49/mo avg" },
        pricing: {
          model: "Flat monthly per location ($39-$79), agency tier at $299 for 10",
          averageRevenue: 49,
          currency: "USD",
        },
        keyMilestones: [
          "Free single-scan landing page that returns a real result in under two minutes",
          "Weekly tracking for 10 businesses sourced from the local-site-studio customer base",
          "Category prompt panels for the five largest trade verticals",
          "Agency white-label tier live",
          "Publish a public category benchmark to earn inbound links and citations",
        ],
        automationStack: [
          "Cron workers -> assistant APIs -> extraction pipeline -> report renderer",
          "Stripe Billing with usage caps per plan",
          "Resend for weekly report delivery",
          "PostHog for funnel from free scan to paid",
        ],
        risks: [
          "Upmarket GEO tools add a cheap local tier and take the segment",
          "Assistant providers restrict or price up programmatic access",
          "Owners find the report interesting but not actionable enough to keep paying",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 48, pessimistic: 60 },
        customerCount: { count: 1400, unit: "locations @ $59/mo avg" },
        pricing: {
          model: "Per-location subscription with multi-location and agency tiers",
          averageRevenue: 59,
          currency: "USD",
        },
        keyMilestones: [
          "Multi-location rollups for franchise groups",
          "Fix execution, not just fix lists, for the subset of sources that expose APIs",
          "Reseller channel with 50+ agencies",
        ],
        automationStack: [
          "Per-tenant cost accounting to protect margin at volume",
          "Automated churn-risk scoring on report engagement",
        ],
        risks: [
          "Volume play with low switching cost; churn is the whole game",
          "1,400 local accounts at $59 is a distribution problem, not a product problem",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Profound",
      "Ahrefs Brand Radar",
      "SE Visible",
      "Conductor",
      "Local SEO agencies bundling it manually",
    ],
    moat: "Distribution through an existing local-business channel plus a category-level citation dataset that gets more useful per vertical served. The software itself is not the moat and should not be treated as one.",
    firstExperiment:
      "Run the panel by hand for 20 local businesses in one metro and one vertical, email each owner their result unsolicited but personalized, and measure reply rate and willingness to pay $49/mo. Fewer than 3 replies out of 20 kills it.",
    rank100k: 4,
    rank1m: 11,
  },
  {
    id: "10",
    slug: "accessibility-evidence-agent",
    name: "Accessibility Evidence Agent",
    tagline: "Continuous WCAG scanning, remediation PRs, and a procurement-ready evidence pack",
    category: "vertical-saas",
    summary:
      "A GitHub app for B2B SaaS vendors that scans every deploy against WCAG 2.2 AA, opens code-level remediation pull requests, and maintains a dated evidence pack their sales team can hand to a procurement reviewer. Explicitly not an overlay widget.",
    problem:
      "European Accessibility Act enforcement is ramping through 2026 and enterprise and public-sector buyers now ask for accessibility documentation during vendor selection and renewal. A 40-person SaaS vendor has no accessibility specialist, cannot answer the questionnaire, and stalls the deal. The overlay widgets marketed as a fix keep losing in court.",
    solution:
      "CI-integrated scanning on every PR with axe-core plus keyboard and focus-order checks, an agent that opens fix PRs against the component that actually caused the failure, regression tracking so a resolved issue cannot silently return, and a generated evidence pack: dated scan history, remediation log, known-issues register, and a draft conformance report for the customer's own review.",
    targetCustomer:
      "B2B SaaS vendors with 10-200 employees selling into EU or public-sector buyers, plus the agencies that build their front ends",
    aiLeverage: [
      "Maps a scanner violation to the offending component and writes the fix, not just the ticket",
      "Drafts the prose sections of the conformance report from the actual scan and remediation history",
      "Triages which violations are genuine versus scanner false positives before opening a PR",
      "Answers inbound procurement questionnaires from the evidence pack",
    ],
    zeroEmployeeOps: [
      "Self-serve GitHub Marketplace install with a free public-URL audit as the hook",
      "Evidence pack regenerates on a schedule with no human step",
      "Manual-audit demand is referred to partner auditors for a referral fee rather than staffed",
      "Stripe billing by repository and scan volume",
    ],
    dimensions: baseDimensions(
      [7, 8, 7, 8, 6, 6],
      [
        "Detection is mostly deterministic tooling; the AI earns its place in remediation and evidence drafting",
        "The manual-audit gap is the only part that cannot be automated, and it is deliberately referred out",
        "Demand is procurement-triggered, so deals arrive with a deadline attached",
        "Standard SaaS margin; scanning compute is cheap relative to price",
        "The dated evidence history is the sticky asset. Switching vendors means losing the audit trail",
        "Compliance-deadline search demand plus outbound to vendors whose sites fail a public scan",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Automated scanning catches roughly 30-40% of WCAG failures; a customer treating a clean scan as legal compliance is the core risk",
        "Accessibility overlay vendors have drawn litigation, and the category carries that reputational shadow",
        "Signing or attesting to a conformance report on a customer's behalf would transfer their exposure to the business",
      ],
      controls: [
        "No overlay, widget, or runtime DOM patching is ever shipped. The product only changes source code the customer merges",
        "Every report states automated coverage limits on its face and recommends a manual audit for the remainder",
        "Conformance reports are generated as drafts for the customer to review and sign themselves; the business never signs",
        "Marketed as evidence and remediation tooling, not as legal compliance or legal advice",
        "Partner referrals for manual and assistive-technology testing rather than claiming to cover it",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 26 },
        customerCount: { count: 70, unit: "vendors @ $119/mo avg" },
        pricing: {
          model: "Per-repository SaaS ($79-$249/mo) with an evidence-pack add-on",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "Free public-URL audit that emails a real failure list",
          "Fix PRs for the five failure classes that appear on most homepages",
          "Evidence pack v1 accepted by one real procurement reviewer",
          "Partner agreement with two manual audit firms",
          "First $5k MRR from vendors who failed a customer questionnaire",
        ],
        automationStack: [
          "GitHub Actions -> scanner -> triage -> fix PR",
          "Scheduled evidence regeneration to object storage",
          "Stripe billing per repo",
        ],
        risks: [
          "Design-system vendors ship this natively and it becomes a feature",
          "Fix PRs that break visual layout destroy trust fast",
          "Enforcement pace is uneven across member states, so urgency varies by customer",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 28, realistic: 42, pessimistic: 60 },
        customerCount: { count: 330, unit: "vendors @ $249/mo avg" },
        pricing: {
          model: "Tiered by repo count with an enterprise evidence and questionnaire tier",
          averageRevenue: 249,
          currency: "USD",
        },
        keyMilestones: [
          "Mobile app scanning alongside web",
          "Questionnaire autofill from the evidence pack",
          "Agency channel where one account covers many client sites",
        ],
        automationStack: [
          "Multi-repo orchestration with per-customer budgets",
          "Automated regression alerts tied to release tags",
        ],
        risks: [
          "Enterprise buyers want a named accountable human, which is exactly what this model does not have",
          "Scope creep toward manual auditing would import the liability the design avoids",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Level Access",
      "Deque axe DevTools",
      "Siteimprove",
      "accessiBe and other overlays (deliberately not the same product)",
    ],
    moat: "The dated, continuous evidence trail. A scan is a commodity; two years of timestamped remediation history that satisfies a procurement reviewer is not, and it cannot be backfilled by a competitor.",
    firstExperiment:
      "Scan 100 B2B SaaS marketing sites that sell into the EU, email the 30 worst a specific failing element with a screenshot, and offer a fix PR. Measure how many ask what it would cost to keep it clean.",
    rank100k: 12,
    rank1m: 7,
  },
  {
    id: "11",
    slug: "mcp-supply-chain-watch",
    name: "MCP Supply-Chain Watch",
    tagline: "Detects when a tool your agents already trust quietly changes what it does",
    category: "api-infrastructure",
    summary:
      "Continuous monitoring for the MCP servers an organization has connected to its agents: tool-description diffing to catch silent behavior changes, permission-surface tracking, dependency and CVE checks, and a CI policy gate backed by a signed allowlist.",
    problem:
      "MCP server counts are in the thousands and a large share of software organizations already run them in production, but the trust model is weak: a server's tool descriptions are instructions to a model, and they can change after approval without any code review. Manual vetting does not scale past a handful of servers, and platform teams have no continuous signal.",
    solution:
      "Point the service at the servers in use. It snapshots each server's tool manifest, descriptions, scopes, and endpoints on a schedule, diffs every change, flags description edits that alter agent behavior, tracks the maintainer and package provenance, and exposes a CI check that fails a deploy when a server drifts outside the signed allowlist.",
    targetCustomer:
      "Platform and application-security teams at companies running agents in production, plus AI-product startups whose customers ask how they vet tools",
    aiLeverage: [
      "Classifies whether a tool-description change is cosmetic or behavior-altering",
      "Flags injection-shaped instructions embedded in tool descriptions and schemas",
      "Summarizes the practical blast radius of a server's requested scopes",
      "Drafts the vetting write-up a platform team would otherwise produce by hand",
    ],
    zeroEmployeeOps: [
      "Open-source CLI scanner as the top of the funnel; hosted continuous monitoring is the paid product",
      "Self-serve signup, no demo required below the enterprise tier",
      "Findings delivered to Slack and CI, not to a dashboard someone must remember to check",
      "Research content generated from the aggregate corpus feeds distribution automatically",
    ],
    dimensions: baseDimensions(
      [8, 8, 5, 9, 7, 6],
      [
        "Judging whether a description change alters agent behavior is a language problem, not a diff problem",
        "Fully automated collection and alerting; the human question is only in enterprise procurement",
        "Weakest dimension. Security buyers move slowly and the ecosystem is still forming",
        "Pure software and scheduled crawling; near-90% margin",
        "A longitudinal record of how thousands of servers have behaved over time is genuinely hard to copy",
        "Developer-tool channels and the MCP ecosystem itself; the OSS scanner does the reaching",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Security tooling attracts failure-to-detect claims after an incident",
        "Publicly labelling a named open-source server as dangerous is a defamation risk if wrong",
        "Customer configuration data reveals their internal tool topology, which is sensitive on its own",
      ],
      controls: [
        "Findings are evidence-based and reproducible: every alert ships the diff that triggered it",
        "Maintainer notification and appeal path before any public listing changes; coordinated disclosure policy published",
        "No active exploitation or unauthorized probing of third-party servers; passive manifest collection only",
        "Warranty disclaimer and liability cap; sold as a monitoring signal, not as a guarantee of safety",
        "Customer topology data encrypted per tenant with short retention and no cross-tenant analytics without consent",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 20, pessimistic: 30 },
        customerCount: { count: 40, unit: "teams @ $209/mo avg" },
        pricing: {
          model: "Per-monitored-server tiers ($99-$499/mo), enterprise annual above that",
          averageRevenue: 209,
          currency: "USD",
        },
        keyMilestones: [
          "OSS scanner released with a public corpus report on manifest churn",
          "Hosted monitoring with Slack and CI delivery",
          "Signed allowlist and policy gate",
          "First 10 paying teams from the OSS funnel",
        ],
        automationStack: [
          "Scheduled collectors -> diff store -> classifier -> alert router",
          "Stripe metered billing per monitored server",
          "Automated security questionnaire responses from a maintained answer bank",
        ],
        risks: [
          "The official registry or a large scanner vendor absorbs this as a free feature",
          "Enterprise security sales cycles are the exact thing a zero-employee model handles worst",
          "MCP consolidation could shrink the number of distinct servers worth monitoring",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 48, pessimistic: 66 },
        customerCount: { count: 170, unit: "teams @ $490/mo avg" },
        pricing: {
          model: "Platform tier with runtime policy enforcement and audit export",
          averageRevenue: 490,
          currency: "USD",
        },
        keyMilestones: [
          "Runtime enforcement, not just detection",
          "Audit-grade export for regulated buyers",
          "Channel through agent-platform vendors",
        ],
        automationStack: [
          "Multi-region collection with tenant-level isolation",
          "Continuous evidence generation for customer audits",
        ],
        risks: [
          "Regulated buyers demand an accountable security contact and SOC 2, which forces either contractors or a ceiling",
          "Being right about a breach you did not catch is not a defense customers accept",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Snyk and Wiz extending into AI supply chain",
      "Invariant Labs",
      "MintMCP and gateway vendors",
      "The official MCP registry's own verification roadmap",
    ],
    moat: "The longitudinal corpus. Nobody can retroactively observe how a server's manifest behaved for the last eighteen months, and that history is what makes a drift alert credible.",
    firstExperiment:
      "Snapshot the public registry weekly for six weeks, publish what fraction of servers silently changed tool descriptions, and count inbound requests to monitor a private fleet.",
    rank100k: 10,
    rank1m: 12,
  },
  {
    id: "12",
    slug: "token-margin-analytics",
    name: "Token Margin Analytics",
    tagline: "Which customers and features are eating your inference budget",
    category: "devtools",
    summary:
      "Cost attribution for AI products: an SDK and ingestion pipeline that ties every model call to a customer, feature, and plan, then reports gross margin per customer and flags the accounts that cost more to serve than they pay.",
    problem:
      "AI product teams can see total spend at the provider and traces in an observability tool, but neither answers the question the business needs: which customer is unprofitable, and which feature caused last month's overrun. Cloud FinOps tools are built around reserved capacity, and eval-first observability platforms are built around output quality, not unit economics.",
    solution:
      "A thin SDK wraps model calls with customer, feature, and plan tags and ships metadata asynchronously. The service prices each call against current provider rates, rolls it up to margin per customer, per feature, and per plan, alerts on budget breaches, and recommends specific swaps: this feature's calls are 90% cacheable, this plan's heaviest 5% of accounts are negative margin.",
    targetCustomer:
      "Seed to Series B AI SaaS companies with usage-based inference costs, and solo builders running several AI products",
    aiLeverage: [
      "Classifies call patterns into cacheable, downgradeable, and irreducible",
      "Generates the actual prompt or routing change, not just the recommendation",
      "Forecasts next-month spend per plan from current usage mix",
      "Explains a spend anomaly in terms of the feature and customer that caused it",
    ],
    zeroEmployeeOps: [
      "Open-source SDK, hosted backend; install to first insight in under ten minutes",
      "Self-serve pricing with a free tier sized to solo builders",
      "Provider rate cards updated by an automated watcher, not by hand",
      "Docs bot handles integration questions, which are the bulk of support",
    ],
    dimensions: baseDimensions(
      [7, 9, 7, 8, 5, 7],
      [
        "The analytics are ordinary; AI earns its place in the optimization recommendations",
        "Async ingestion and self-serve onboarding leave nothing for a human to do",
        "Developer buyers with a budget problem they already know they have",
        "Metadata ingestion is cheap; the cost curve is far below the price curve",
        "Observability vendors are adding cost views, and providers publish better dashboards every quarter",
        "OSS SDK plus a genuinely shareable artifact: a margin-per-customer chart founders post",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Capturing prompt and response payloads would pull customer PII into the system",
        "Sitting in the request path would make an outage here an outage for the customer",
        "Cost figures inform pricing decisions, so a systematic pricing error has downstream financial effect",
      ],
      controls: [
        "Async ingestion only. The SDK never proxies or blocks a model call, by design and by test",
        "Metadata by default; payload capture is opt-in, redacted at the SDK before it leaves the customer's process",
        "Provider rate cards versioned and auditable, with every computed figure traceable to a rate and a timestamp",
        "DPA offered from day one; short retention with customer-controlled deletion",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 9, realistic: 15, pessimistic: 24 },
        customerCount: { count: 95, unit: "companies @ $89/mo avg" },
        pricing: {
          model: "Usage-tiered SaaS ($0 / $49 / $149 / $399) by tracked call volume",
          averageRevenue: 89,
          currency: "USD",
        },
        keyMilestones: [
          "SDKs for TypeScript and Python with the three major providers",
          "Margin-per-customer view as the single hero screen",
          "Budget alerts and anomaly attribution",
          "First 20 paying teams from the OSS SDK funnel",
        ],
        automationStack: [
          "Edge ingestion -> queue -> columnar store -> scheduled rollups",
          "Stripe metered billing",
          "Automated rate-card watcher across providers",
        ],
        risks: [
          "Langfuse, Braintrust, or a provider ships adequate cost attribution for free",
          "Teams solve it once with a homegrown dashboard and never look again",
          "Value is highest exactly when a customer is trying to cut spend, including this line item",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 26, realistic: 40, pessimistic: 56 },
        customerCount: { count: 300, unit: "companies @ $278/mo avg" },
        pricing: {
          model: "Volume tiers plus a finance-facing seat for reporting and forecasting",
          averageRevenue: 278,
          currency: "USD",
        },
        keyMilestones: [
          "Forecasting and budget enforcement per plan",
          "Warehouse export for finance teams",
          "Coverage of GPU and self-hosted inference alongside API spend",
        ],
        automationStack: [
          "Multi-tenant columnar storage with per-tenant cost accounting",
          "Automated month-end close export",
        ],
        risks: [
          "Finance buyers pull the product toward a FinOps suite the solo model cannot staff",
          "Consolidation: the winning observability platform bundles this and competes on nothing else",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["Langfuse", "Braintrust", "Helicone", "Finout and cloud FinOps suites"],
    moat: "Rate-card accuracy across providers plus the per-customer margin model. The integration is shallow, so the defensibility is in being trusted with the number a founder quotes to their board.",
    firstExperiment:
      "Instrument three friendly AI startups for free, show each their five least profitable customers, and see whether that single chart is worth $99/mo to them.",
    rank100k: 9,
    rank1m: 6,
  },
  {
    id: "13",
    slug: "local-bid-radar",
    name: "Local Bid Radar",
    tagline: "State, county, and school-district solicitations, matched to one small contractor",
    category: "data-product",
    summary:
      "A $59-149/month alerting product covering state, county, municipal, and special-district solicitations in one region and trade, with AI matching against a contractor's capability profile and a drafted bid or no-bid summary for each match.",
    problem:
      "Public-sector opportunity intelligence is priced and packaged for mid-market and enterprise contractors, with median annual costs in five figures. Federal-focused low-cost entrants exist, but state and local portals are fragmented across hundreds of sites with no common format, and that is exactly where a six-person contractor can actually win work.",
    solution:
      "Ingest solicitations from official open-data feeds and portal APIs across a target region, normalize them, match against the contractor's trade codes, bonding capacity, and service radius, and send a short daily digest where each item carries a drafted go/no-go summary: scope, deadline, bonding requirement, incumbent if known, and why it matched.",
    targetCustomer:
      "Small contractors and service firms (5-50 people) in trades, IT reselling, facilities, and staffing that sell to state and local government",
    aiLeverage: [
      "Normalizes wildly inconsistent portal formats into one schema without per-site hand-coding",
      "Matches unstructured scope text against a capability profile better than keyword rules",
      "Drafts the bid/no-bid summary and extracts the requirements that usually disqualify a bidder",
      "Repairs its own ingestion when a portal changes layout, which is the main operating cost",
    ],
    zeroEmployeeOps: [
      "Self-serve onboarding from a company profile and a trade code",
      "Daily digest by email; no dashboard required to get value",
      "Ingestion failures self-heal or open a ticket in a queue the agent works",
      "Regional expansion is a config change, not a hire",
    ],
    dimensions: baseDimensions(
      [8, 8, 6, 8, 6, 4],
      [
        "The hard parts — normalization, matching, summarizing — are all language work",
        "Ingestion breakage is the one recurring chore, and it is agent-maintainable",
        "SMB contractors buy on proof of a won bid, which lags the subscription by a quarter",
        "Data acquisition is real cost but bounded; margin sits around 80%",
        "Coverage of hard-to-reach local portals compounds and is genuinely tedious to replicate",
        "Weakest dimension. This buyer is not online-native, does not read dev channels, and rarely self-serves",
      ],
    ),
    liability: {
      level: "medium",
      exposures: [
        "Some procurement portals prohibit automated collection in their terms",
        "A missed or late solicitation will be blamed for a lost bid",
        "Drafting bid content edges toward proposal consulting and, near certification or set-aside advice, toward regulated territory",
      ],
      controls: [
        "Official open-data APIs and feeds first; portals that prohibit collection are excluded rather than scraped, and the coverage map says which",
        "Best-effort coverage stated plainly, with a source link on every item so the contractor verifies at the origin",
        "Product summarizes and matches; it does not certify eligibility, advise on set-aside status, or write submitted proposal text",
        "Liability capped at fees paid; no guarantee of completeness or of award outcomes",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 11, realistic: 18, pessimistic: 30 },
        customerCount: { count: 95, unit: "contractors @ $89/mo avg" },
        pricing: {
          model: "Per-company subscription by region count ($59-$149/mo)",
          averageRevenue: 89,
          currency: "USD",
        },
        keyMilestones: [
          "Full coverage of one state's official solicitation feeds",
          "Capability matching that a contractor agrees with on 8 of 10 items",
          "Free digest for one trade to build the list before charging",
          "First 25 paying contractors, sourced through trade associations",
        ],
        automationStack: [
          "Scheduled ingestion -> normalization -> matcher -> digest renderer",
          "Stripe subscriptions",
          "Self-healing ingestion with an agent-worked failure queue",
        ],
        risks: [
          "Cheap federal-focused entrants extend down into state and local",
          "Contractors treat it as a nice-to-have and churn after one quiet month",
          "Portal coverage gaps in the one region that matters to a given customer",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 34, realistic: 54, pessimistic: 72 },
        customerCount: { count: 620, unit: "contractors @ $135/mo avg" },
        pricing: {
          model: "Regional tiers plus a multi-seat team plan",
          averageRevenue: 135,
          currency: "USD",
        },
        keyMilestones: [
          "National coverage across the trades with the most local spend",
          "Win/loss tracking that turns the tool into the contractor's pipeline record",
          "Association partnerships as the primary channel",
        ],
        automationStack: [
          "Coverage monitoring with automated gap detection per region",
          "Partner portal with association rev-share",
        ],
        risks: [
          "620 SMB contractors acquired without a sales team is the binding constraint",
          "Incumbents can bundle state and local into existing enterprise seats at no extra price",
        ],
        verdict: "stretch",
      },
    ],
    competitors: ["GovSpend", "BidPrime", "BidNet Direct", "Fed-Spend", "BidSparq", "GovWin IQ"],
    moat: "Coverage of the fragmented local portals nobody wants to maintain, plus a matching profile that improves per customer. Coverage is a grind, and grind is what an agent-run business is actually good at.",
    firstExperiment:
      "Cover one state and one trade for free for 30 days, hand-verify the match quality against what those contractors actually bid, and measure how many convert to paid at $89 when the free period ends.",
    rank100k: 13,
    rank1m: 14,
  },
  {
    id: "14",
    slug: "docs-drift-agent",
    name: "Docs Drift Agent",
    tagline: "Opens the docs PR your last release should have included",
    category: "devtools",
    summary:
      "A GitHub app that watches code, API schema, and release diffs, identifies the documentation those changes invalidated, and opens a docs pull request with the correction already written. Also crawls the published help center to flag articles that no longer match the product.",
    problem:
      "Audits of B2B SaaS help centers find roughly 40% of articles carry at least one factually outdated element, and across the documentation reports of the last two years the maintenance burden has overtaken the creation burden. Docs platforms are good at publishing and search; keeping content true after a release is still manual.",
    solution:
      "Install on the repo. On each merge, the agent diffs public API surface, config options, CLI flags, and UI strings against the docs corpus, scores which pages are now wrong, and opens a single reviewable docs PR per release with the edits made. A scheduled crawl checks the live help center for the same drift when docs are not in the repo.",
    targetCustomer:
      "Developer-tool and API companies with docs-as-code, and SaaS teams with 200+ help-center articles and no technical writer",
    aiLeverage: [
      "Deciding which prose a code change invalidates is the whole product and is not rule-expressible",
      "Writes the corrected passage in the surrounding voice rather than flagging a TODO",
      "Generates changelog entries and migration notes from the same diff",
      "Ranks stale pages by traffic and support-ticket correlation so the PR stays small",
    ],
    zeroEmployeeOps: [
      "GitHub Marketplace install with a free staleness report on a public docs site",
      "Output is a pull request, so review effort belongs to the customer and the loop needs no human here",
      "Stripe billing per repo with volume tiers",
      "Docs bot for support, which is a fair test of the product itself",
    ],
    dimensions: baseDimensions(
      [8, 9, 7, 8, 4, 7],
      [
        "Judging semantic invalidation between code and prose is squarely a model capability",
        "Nothing in the loop requires a human on this side of the transaction",
        "Self-serve marketplace distribution and a problem teams already feel every release",
        "Inference per release is small against a $99-$299 subscription",
        "Weakest dimension. Mintlify, ReadMe, and GitHub can each absorb this as a feature",
        "Developer channels, docs communities, and a free staleness report that is shareable on its own",
      ],
    ),
    liability: {
      level: "low",
      exposures: [
        "Read access to private repositories carries the usual IP and confidentiality exposure",
        "A wrong docs edit that ships to users creates support load and, for API docs, integration breakage",
      ],
      controls: [
        "Pull requests only. Nothing publishes without a human merge, and auto-merge is not offered",
        "Least-privilege GitHub App scopes with no write access outside the docs paths the customer configures",
        "No training on customer repositories; zero-retention inference",
        "Every proposed edit cites the specific commit and code symbol that triggered it, so review is fast",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 8, realistic: 14, pessimistic: 22 },
        customerCount: { count: 70, unit: "teams @ $119/mo avg" },
        pricing: {
          model: "Per-repository SaaS ($99-$299/mo) by docs corpus size",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "Free public staleness report as the acquisition hook",
          "OpenAPI and CLI-flag drift detection shipped first, since they are checkable",
          "Docs PR quality good enough that teams merge without heavy editing",
          "Listing on GitHub Marketplace and in two docs-platform integration directories",
        ],
        automationStack: [
          "GitHub webhooks -> diff analysis -> docs PR",
          "Scheduled help-center crawler",
          "Stripe billing per repo",
        ],
        risks: [
          "Docs platforms ship equivalent AI maintenance and bundle it free",
          "Noisy or low-quality PRs get the app uninstalled after one bad release",
          "Teams tolerate stale docs for years, so urgency is lower than the data suggests",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 46, pessimistic: 62 },
        customerCount: { count: 280, unit: "teams @ $298/mo avg" },
        pricing: {
          model: "Corpus-size tiers plus a support-content tier for help centers",
          averageRevenue: 298,
          currency: "USD",
        },
        keyMilestones: [
          "Support-content coverage beyond developer docs",
          "Localization drift across translated docs sets",
          "Integrations with the major docs platforms rather than competing with them",
        ],
        automationStack: [
          "Corpus indexing per tenant with incremental reprocessing",
          "Quality telemetry on merge rate per PR type",
        ],
        risks: [
          "Platform absorption is the central threat and it does not go away with scale",
          "ACV ceiling without a services component the model will not staff",
        ],
        verdict: "stretch",
      },
    ],
    competitors: ["Mintlify", "ReadMe", "Docusaurus plus homegrown scripts", "Technical writing contractors"],
    moat: "The mapping between code symbols and doc passages, built per customer and improved by every merged and rejected PR. Thin, and the evaluation should not pretend otherwise.",
    firstExperiment:
      "Run drift detection against ten public API docs sites, open real PRs to the two most receptive open-source projects, and measure merge rate. Below 50% merged, the quality bar is not met.",
    rank100k: 11,
    rank1m: 13,
  },
];
