import type { BusinessIdea } from "../lib/types.ts";

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
    rank1m: 3,
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
    rank100k: 5,
    rank1m: 7,
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
    rank100k: 4,
    rank1m: 5,
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
    rank1m: 6,
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
    rank100k: 6,
    rank1m: 8,
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
    rank100k: 7,
    rank1m: 2,
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
    rank100k: 8,
    rank1m: 9,
  },
];
