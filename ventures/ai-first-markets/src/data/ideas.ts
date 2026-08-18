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
    rank100k: 7,
    rank1m: 9,
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
    rank100k: 5,
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
    rank100k: 10,
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
    rank100k: 11,
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
    slug: "accessibility-remediation-bot",
    name: "Accessibility Remediation Bot",
    tagline: "WCAG findings turned into reviewable pull requests",
    category: "devtools",
    summary:
      "A CI-integrated app that crawls a web product, finds WCAG 2.2 AA failures with a deterministic rule engine, and opens small fix PRs — alt text, form labels, focus order, contrast tokens — instead of injecting an overlay script.",
    problem:
      "Teams selling into the EU have been inside the European Accessibility Act's scope since June 2025, and US public-sector buyers now push WCAG conformance down to their vendors. The usual output is a 400-issue audit PDF that no one has engineering time to work through, so teams reach for an overlay widget — the category that has drawn FTC and plaintiff attention rather than fixing anything.",
    solution:
      "Deterministic scanning (axe-core rules plus keyboard and focus traversal) produces the finding; the model only authors the patch and explains it. Each PR is scoped to one component, carries before/after screenshots, and is ranked by how many real user paths it unblocks. Nothing ships without the customer merging it.",
    targetCustomer:
      "10–200 person product teams selling into the EU or public sector, and agencies maintaining client sites under retainer",
    aiLeverage: [
      "Model writes the code patch; the rule engine, not the model, decides what is broken",
      "Component-level context from the repo keeps fixes idiomatic to the codebase",
      "Screenshot diffing verifies the fix did not shift layout",
      "Findings clustered into one PR per component instead of one per instance",
    ],
    zeroEmployeeOps: [
      "Self-serve GitHub/GitLab Marketplace install",
      "Stripe seat billing with a free scan-only tier as the funnel",
      "Scan reports double as the sales asset — no demo call needed",
      "AI support agent grounded in WCAG success criteria and the product docs",
    ],
    dimensions: baseDimensions(
      [7, 9, 8, 9, 6, 8],
      [
        "AI authors patches and rationales; detection stays deterministic and auditable",
        "No human in the remediation loop; the customer's own review gate is the control",
        "Free scan converts to paid remediation inside a single sprint",
        "Scanning is cheap; inference is per-merged-fix, so cost tracks revenue",
        "Rules are public; the moat is patch quality and framework coverage, not detection",
        "Marketplace distribution plus a live regulatory deadline driving search demand",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 7, realistic: 13, pessimistic: 22 },
        customerCount: { count: 85, unit: "teams @ $99/mo avg" },
        pricing: {
          model: "Per-repo SaaS ($49–$199/repo/mo), free scan tier",
          averageRevenue: 99,
          currency: "USD",
        },
        keyMilestones: [
          "Scanner + fix PRs for React and plain HTML templates",
          "Free public scan tool that emails a findings summary",
          "10 design partners from EU-facing SaaS and agency networks",
          "Marketplace listing with before/after case studies",
          "Regression check that fails CI when a merged fix regresses",
        ],
        automationStack: [
          "Headless Chromium crawl on a scheduled worker",
          "axe-core + custom keyboard traversal rules",
          "Patch generation with screenshot verification before PR open",
          "Stripe metered billing keyed to merged fixes",
        ],
        risks: [
          "A customer treats merged PRs as a compliance certificate — contract must disclaim it",
          "Framework coverage gaps produce low-quality patches and churn",
          "Deque or GitHub ships native remediation",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 24, realistic: 34, pessimistic: 50 },
        customerCount: { count: 350, unit: "teams @ $238/mo avg" },
        pricing: {
          model: "Tiered per-repo + agency multi-site plans",
          averageRevenue: 238,
          currency: "USD",
        },
        keyMilestones: [
          "Vue, Svelte, and native mobile coverage",
          "Agency plan with white-label client reports",
          "VPAT/ACR draft generation from accumulated scan history",
          "Design-system linting so new components ship accessible",
        ],
        automationStack: [
          "Per-tenant crawl budgets with hard cost caps",
          "Accuracy regression suite over a fixture corpus of known failures",
        ],
        risks: [
          "Agencies resell rather than subscribe, compressing ACV",
          "Enforcement attention fades and urgency-driven demand softens",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Deque axe DevTools",
      "Evinced",
      "Siteimprove",
      "accessiBe / UserWay (overlays)",
    ],
    moat: "Patch quality per framework + merged-fix history that feeds conformance reporting",
    firstExperiment:
      "Run the scanner against 50 EU-facing SaaS marketing sites, send each a free findings summary with one worked fix PR against a public repo, and measure reply rate.",
    rank100k: 3,
    rank1m: 5,
    screenedAt: "2026-08",
    riskProfile: {
      liability: "low",
      regulatoryExposure:
        "Sells into an accessibility regime but makes no conformance claim. Contract states the tool produces engineering changes, not a legal determination, and never auto-merges. Overlay-style 'instant compliance' claims — the thing regulators have actually pursued — are off the table by design.",
      dataSensitivity:
        "Public page markup and repository code under a scoped token. No end-user personal data is processed or retained; screenshots are discarded after verification.",
      capitalNeed:
        "Under $2k to first revenue — marketplace listing, headless browser workers, and inference.",
      agentOperability:
        "Scanning, patch authoring, PR opening, and support are fully agent-run. A human decides pricing changes and reviews any contract that asks for a conformance warranty.",
      ethicalGuardrails: [
        "Never claim a customer is 'WCAG compliant' or 'ADA compliant' — report what was fixed and what remains",
        "No overlay or client-side patching that masks failures from audits",
        "Publish the rule set and false-positive rate so customers can verify findings",
      ],
    },
  },
  {
    id: "10",
    slug: "coi-compliance-tracker",
    name: "Insurance Certificate Tracker",
    tagline: "Vendor COIs parsed, matched to requirements, and chased on schedule",
    category: "vertical-saas",
    summary:
      "Email-in intake that reads ACORD certificates of insurance, mechanically compares each to the requirement template the customer set for that vendor, flags deficiencies, and chases the vendor and broker until a compliant certificate arrives.",
    problem:
      "General contractors, property managers, and staffing firms hold insurance requirements over hundreds of subcontractors and track them in a spreadsheet. Certificates arrive as PDFs in someone's inbox, limits and additional-insured wording get eyeballed, and expirations slip. A lapse surfaces at claim time, when the exposure lands on the customer.",
    solution:
      "Vendors email certificates to a per-customer address. The system extracts limits, dates, endorsements, and named insureds, compares them field-by-field against the customer's own requirement template, and produces a pass/fail with the evidence highlighted. Non-compliant vendors get scheduled follow-ups; everything lands in a dated audit trail.",
    targetCustomer:
      "General contractors, property managers, staffing agencies, and venues managing 50–1,000 insured vendors",
    aiLeverage: [
      "Structured extraction from heterogeneous ACORD PDFs and scans, with per-field confidence",
      "Endorsement wording comparison against the required form language",
      "Follow-up emails drafted per vendor with the specific deficiency named",
      "Low-confidence extractions routed to a review queue instead of being guessed",
    ],
    zeroEmployeeOps: [
      "Email intake means zero vendor onboarding — no portal for subs to learn",
      "Renewal chasing runs on a scheduler with no human trigger",
      "Self-serve requirement templates per vendor class",
      "Stripe subscription billing by tracked-vendor count",
    ],
    dimensions: baseDimensions(
      [8, 8, 6, 8, 7, 5],
      [
        "Document understanding is the product; rules comparison stays deterministic",
        "The chase loop — the actual labor being replaced — is fully automated",
        "Buyers are offline SMBs; outbound and referral cycles run 4–8 weeks",
        "80%+ margin; per-certificate inference cost is cents against $150–400/mo plans",
        "Switching means re-collecting certificates from every vendor — high friction",
        "No marketplace; growth is outbound, trade associations, and insurance broker referrals",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 11, realistic: 18, pessimistic: 30 },
        customerCount: { count: 45, unit: "firms @ $185/mo avg" },
        pricing: {
          model: "Tiered by tracked vendors ($99–$399/mo)",
          averageRevenue: 185,
          currency: "USD",
        },
        keyMilestones: [
          "ACORD 25 and 855 extraction above 95% field accuracy on a held-out set",
          "5 design partners recruited through subcontractor-heavy trade groups",
          "Requirement templates for the common trade classes shipped as defaults",
          "Broker referral arrangement — brokers hand it to insureds as a service",
          "First renewal cycle completed end-to-end without founder intervention",
        ],
        automationStack: [
          "Per-tenant inbound email with attachment parsing",
          "Extraction pipeline with confidence thresholds and a review queue",
          "Scheduled chase sequences with escalation to the customer's own contact",
          "Immutable audit log per vendor and certificate version",
        ],
        risks: [
          "Being read as giving insurance advice rather than mechanical comparison",
          "Incumbents (myCOI, TrustLayer) drop price to defend the mid-market",
          "OCR failures on faxed or photographed certificates erode trust early",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 28, realistic: 38, pessimistic: 56 },
        customerCount: { count: 240, unit: "firms @ $347/mo avg" },
        pricing: {
          model: "Vendor-count tiers + W-9/licence/safety document add-ons",
          averageRevenue: 347,
          currency: "USD",
        },
        keyMilestones: [
          "Expand from COIs to the whole vendor document set (W-9, licences, safety records)",
          "Integrations with Procore, Buildertrend, and AppFolio",
          "Multi-entity rollups for firms managing several properties or job sites",
          "Broker channel with revenue share",
        ],
        automationStack: [
          "Integration sync workers with per-tenant rate limits",
          "Extraction accuracy regression suite run on every model change",
        ],
        risks: [
          "Enterprise buyers demand SOC 2 and single sign-on before signing",
          "Channel partners want white-label, which caps direct ACV",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["myCOI", "TrustLayer", "Jones", "Evident ID", "SmartCompliance"],
    moat: "Accumulated vendor certificate history plus requirement templates that get re-verified every renewal",
    firstExperiment:
      "Offer 10 mid-size GCs a free one-time audit of their current COI spreadsheet: parse every certificate on file and return a deficiency list. Measure how many deficiencies are found and how many firms ask to keep it running.",
    rank100k: 6,
    rank1m: 2,
    screenedAt: "2026-08",
    riskProfile: {
      liability: "medium",
      regulatoryExposure:
        "Insurance producer licensing is the line to stay behind. The product performs mechanical comparison against requirements the customer supplies; it never recommends coverage, never opines on adequacy, and never places or binds insurance. Terms cap liability at fees paid and state that the customer remains responsible for accepting a vendor.",
      dataSensitivity:
        "Commercial insurance documents and vendor business contacts. No consumer personal data, no payment credentials, no claims data. Retention is per-tenant and exportable.",
      capitalNeed:
        "Under $5k to first revenue, plus errors-and-omissions cover once paying customers exist — the one line item here worth buying early.",
      agentOperability:
        "Intake, extraction, comparison, chasing, and reporting run unattended. A human sets the liability terms, buys the E&O policy, and handles any dispute about a missed deficiency.",
      ethicalGuardrails: [
        "Show the source certificate excerpt behind every pass/fail — no unexplained verdicts",
        "Route low-confidence extractions to review rather than guessing a compliant result",
        "State plainly in-product that this is document tracking, not insurance advice",
      ],
    },
  },
  {
    id: "11",
    slug: "repo-localization-agent",
    name: "Repo-Native Localization Agent",
    tagline: "Translation pull requests with product context, not a separate TMS",
    category: "devtools",
    summary:
      "Watches locale files in a repository, translates new and changed keys using a project glossary plus screenshots of the actual UI, and opens one reviewable PR per locale — no translation management system to sync with.",
    problem:
      "Teams shipping weekly cannot run an export-translate-import cycle. Strings drift out of sync, raw machine translation misses UI context so buttons overflow and placeholders break, and TMS platforms price and scope for localization departments that a solo-run product does not have.",
    solution:
      "Diff-driven translation: only changed keys are touched, each with the surrounding UI screenshot and glossary terms as context. The PR flags length overflow, missing interpolation placeholders, and terms that drift from previously approved translations. Human or contractor reviewers approve per-key inside the PR.",
    targetCustomer:
      "Product teams shipping in 3–15 locales — SaaS, mobile apps, and documentation sites — without a localization hire",
    aiLeverage: [
      "Translation conditioned on glossary, tone guide, and prior approved strings",
      "UI screenshots supply the context that makes short strings translatable",
      "Automatic checks for placeholder mismatch, overflow, and untranslated leakage",
      "Terminology drift detection against the approved glossary",
    ],
    zeroEmployeeOps: [
      "Marketplace install with repo-scoped tokens; no onboarding call",
      "Usage billing by translated key, metered through Stripe",
      "Optional reviewer marketplace staffed by contractors, coordinated by the agent",
      "Docs-grounded support agent handles integration questions",
    ],
    dimensions: baseDimensions(
      [8, 9, 7, 8, 5, 6],
      [
        "Quality gap versus raw machine translation comes from context assembly, which is the product",
        "Entirely PR-driven; contractors only enter for languages the customer wants reviewed",
        "Install-to-first-PR is minutes, but budgets are small until a second locale hurts",
        "Inference per key is cheap; margin holds above 80% at usage pricing",
        "Crowdin, Lokalise, and Tolgee all ship AI translation — differentiation is workflow, not capability",
        "Marketplace plus i18n library integrations; no regulatory or urgency trigger",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 28 },
        customerCount: { count: 120, unit: "teams @ $69/mo avg" },
        pricing: {
          model: "Usage-based by translated key ($29–$149/mo typical)",
          averageRevenue: 69,
          currency: "USD",
        },
        keyMilestones: [
          "Support for the common formats (JSON, ICU MessageFormat, .strings, ARB, PO)",
          "Screenshot context pulled from Storybook or Playwright runs",
          "Glossary and approved-translation memory per project",
          "20 open-source projects using the free tier as public proof",
        ],
        automationStack: [
          "Repo webhook → diff extraction → translation → PR open",
          "Placeholder and overflow linting as a required PR check",
          "Stripe metered billing keyed to translated keys",
        ],
        risks: [
          "Incumbent TMS vendors bundle the same PR workflow",
          "Frontier models make basic translation free enough that only review remains billable",
          "Low ACV means support load per dollar is high",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 32, realistic: 42, pessimistic: 60 },
        customerCount: { count: 450, unit: "teams @ $185/mo avg" },
        pricing: {
          model: "Team tiers + reviewed-translation add-on",
          averageRevenue: 185,
          currency: "USD",
        },
        keyMilestones: [
          "Reviewed-translation tier delivered through a managed contractor pool",
          "Marketing site and docs localization beyond product strings",
          "Locale-level quality scoring visible to the customer",
        ],
        automationStack: [
          "Contractor assignment, QA sampling, and payout run by agent",
          "Per-locale quality regression tracked over time",
        ],
        risks: [
          "Managed review reintroduces coordination load and compresses margin",
          "Category is crowded; differentiation may not survive incumbent copying",
        ],
        verdict: "stretch",
      },
    ],
    competitors: ["Crowdin", "Lokalise", "Tolgee", "Localazy", "Weblate"],
    moat: "Translation memory plus glossary tied to a specific repo, and review history that makes switching lossy",
    firstExperiment:
      "Ship it free against 20 open-source projects with active i18n directories; measure what fraction of generated PRs are merged without edits, which is the only quality signal that matters.",
    rank100k: 8,
    rank1m: 12,
    screenedAt: "2026-08",
    riskProfile: {
      liability: "low",
      regulatoryExposure:
        "None specific. The one real exposure is a mistranslation in safety or legal copy, handled by scoping terms to product UI strings and requiring customer merge for every change.",
      dataSensitivity:
        "Source strings and repository access under a scoped token. No customer end-user data. Strings are excluded from any training use by contract with the model provider.",
      capitalNeed:
        "Under $1k to first revenue; the only recurring costs are inference and CI minutes.",
      agentOperability:
        "Fully agent-run at the $100k tier. The $1M path adds contractor reviewers, which the agent can schedule and pay but which a human must vet.",
      ethicalGuardrails: [
        "Never auto-merge translations — the customer's reviewers stay in control",
        "Pay contractor reviewers per reviewed key at posted rates, disclosed up front",
        "Mark machine-translated strings as such in the PR so reviewers know what they are approving",
      ],
    },
  },
  {
    id: "12",
    slug: "agent-ready-api-gateway",
    name: "Agent-Ready API Gateway",
    tagline: "Turn an existing REST API into a metered, auditable MCP server",
    category: "api-infrastructure",
    summary:
      "Hosted service that generates an MCP server from an OpenAPI spec and adds what agent traffic actually requires: authentication, per-tool metering and pricing, quotas, abuse controls, and replayable audit logs.",
    problem:
      "MCP became a vendor-neutral standard in late 2025 and registries now index thousands of servers, but almost none of them meter or bill. API companies absorb the hosting and inference costs of agent traffic they cannot see, price, or rate-limit, and hand-rolling auth plus metering per server is weeks of work each time.",
    solution:
      "Point the service at an OpenAPI spec; it generates and hosts a conforming MCP server with OAuth or bring-your-own-key auth, per-tool usage records, quota enforcement, and structured logs. An evaluation harness scores whether tool names and descriptions are legible to agents — the failure mode that makes a technically correct server useless in practice.",
    targetCustomer:
      "Small and mid-size API companies and data vendors who want agent traffic to be a revenue line rather than an unpriced cost",
    aiLeverage: [
      "Tool descriptions generated and then evaluated against real agent call traces",
      "Agent-legibility scoring that catches ambiguous or overlapping tools before customers ship",
      "Anomaly detection over call patterns to separate runaway loops from legitimate usage",
      "Synthetic agent traffic used as an integration test suite",
    ],
    zeroEmployeeOps: [
      "Fully self-serve from spec upload to live endpoint",
      "Usage-based billing with hard caps that protect both sides",
      "Generated docs and quickstarts per customer server",
      "Registry submissions automated as part of publishing",
    ],
    dimensions: baseDimensions(
      [6, 9, 6, 7, 6, 7],
      [
        "AI is mostly the traffic, not the product; the AI-native part is agent-legibility evaluation",
        "Pure infrastructure — provisioning, billing, and scaling need no human",
        "Developer buyers evaluate fast, but the budget line for agent distribution is still forming",
        "Gateway compute and egress cap margin near 70–75% at usage pricing",
        "Standards-based, so switching is real but not painful; depth comes from usage analytics",
        "Registry listings, MCP directories, and the customers' own developer audiences",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 26 },
        customerCount: { count: 70, unit: "API vendors @ $119/mo avg" },
        pricing: {
          model: "Platform fee + per-call metering ($49–$499/mo typical)",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "Spec-to-server generation with OAuth and BYOK auth paths",
          "Per-tool metering with quota enforcement and spend caps",
          "Agent-legibility scorecard published as a free standalone tool",
          "15 servers live and listed in public registries",
          "Revenue-share option for vendors who want to charge per call",
        ],
        automationStack: [
          "Spec ingestion → codegen → isolated runtime per tenant",
          "Usage records streamed to Stripe metered billing",
          "Structured audit logs with configurable retention, no-retention by default",
        ],
        risks: [
          "Cloud vendors bundle MCP hosting into existing API gateways for free",
          "Agent traffic volumes stay too low to justify a metering layer",
          "Protocol churn forces repeated regeneration of every hosted server",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 40, pessimistic: 60 },
        customerCount: { count: 300, unit: "API vendors @ $278/mo avg" },
        pricing: {
          model: "Volume tiers + revenue share on metered agent calls",
          averageRevenue: 278,
          currency: "USD",
        },
        keyMilestones: [
          "Marketplace where agent builders discover and pay for hosted tools",
          "Per-call settlement and payouts to API vendors",
          "Enterprise controls: private servers, IP allowlists, data residency",
        ],
        automationStack: [
          "Multi-region runtime with per-tenant cost ceilings",
          "Automated payout reconciliation and dispute flagging",
        ],
        risks: [
          "Platform dependence — a single upstream policy change can reprice the business",
          "Taking a cut of payments raises money-transmission questions that need counsel",
        ],
        verdict: "stretch",
      },
    ],
    competitors: ["Apify", "MCPize", "Zuplo", "Cloudflare AI Gateway", "self-hosted FastMCP"],
    moat: "Usage analytics across many servers, which informs pricing and legibility guidance no single vendor can see",
    firstExperiment:
      "Publish the agent-legibility scorecard as a free tool, run it over the most-installed public MCP servers, and publish the results. Count how many server owners ask for hosted metering after seeing their score.",
    rank100k: 9,
    rank1m: 7,
    screenedAt: "2026-08",
    riskProfile: {
      liability: "low",
      regulatoryExposure:
        "Infrastructure, so light — until the $1M path introduces revenue share on metered calls. Handling money on behalf of API vendors is the point at which payment-facilitator rules apply; keep settlement on a platform like Stripe Connect rather than holding funds.",
      dataSensitivity:
        "Proxied API traffic that may contain customer payloads. Default to no retention, log metadata only, and offer per-tenant data residency before asking anyone to route production traffic.",
      capitalNeed:
        "$2–5k to first revenue; compute and egress are the recurring costs and scale with usage.",
      agentOperability:
        "Provisioning, billing, incident alerting, and support are agent-run. A human signs any contract with retention or residency commitments and owns the payment-flow decision.",
      ethicalGuardrails: [
        "No-retention by default for proxied payloads; retention is opt-in and disclosed",
        "Hard spend caps on both sides so a runaway agent loop cannot generate a surprise bill",
        "Never resell or aggregate customer traffic content — usage analytics stay at the metadata level",
      ],
    },
  },
  {
    id: "13",
    slug: "public-bid-matchmaker",
    name: "Public Bid Matchmaker",
    tagline: "Published solicitations, filtered and drafted for small vendors",
    category: "ai-agent",
    summary:
      "Monitors official published procurement sources, matches solicitations against a vendor's capability profile, extracts the requirements matrix and deadlines, and drafts a response skeleton from the vendor's own past-performance library.",
    problem:
      "Public and institutional buyers publish across fragmented portals. Small vendors either miss relevant solicitations entirely or burn a week qualifying one they were never going to win, and the platforms that solve this are priced for firms with a capture team.",
    solution:
      "Ingest from official sources and open APIs, score fit against the vendor's NAICS codes, past performance, and bonding capacity, then extract the requirements into a checklist and draft the boilerplate sections. The vendor spends their time on the parts only they can write.",
    targetCustomer:
      "Small vendors selling to government and institutions — IT services, staffing, facilities, specialty trades — with 2–50 staff",
    aiLeverage: [
      "Fit scoring from capability profile against solicitation requirements",
      "Requirements matrix extraction from long PDFs, with page citations",
      "Response drafting from the vendor's own approved content library",
      "Amendment monitoring that flags what changed since the last read",
    ],
    zeroEmployeeOps: [
      "Ingestion, matching, and alerting run on a scheduler",
      "Self-serve capability profile onboarding",
      "Content library builds itself from each submitted response",
      "Stripe subscription billing by tracked jurisdictions",
    ],
    dimensions: baseDimensions(
      [8, 7, 6, 8, 6, 5],
      [
        "Matching and long-document extraction are exactly what current models do well",
        "Ingestion and drafting are automated; the vendor's own review is the only manual step",
        "SMB contractors buy on demonstrated hit rate, which takes a bid cycle or two to show",
        "80%+ margin; ingestion cost is fixed and amortizes across subscribers",
        "Public data is available to everyone — the moat is the vendor's own content library",
        "Outbound plus trade associations; no marketplace and no viral loop",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 18, pessimistic: 30 },
        customerCount: { count: 55, unit: "vendors @ $155/mo avg" },
        pricing: {
          model: "Tiered by jurisdictions tracked ($79–$399/mo)",
          averageRevenue: 155,
          currency: "USD",
        },
        keyMilestones: [
          "Ingestion from federal and 5 state portals via official APIs and feeds",
          "Fit scoring validated against 100 historical awards in one vertical",
          "Requirements matrix export that matches how vendors actually build responses",
          "First customer win attributable to a matched solicitation",
        ],
        automationStack: [
          "Scheduled ingestion with per-source change detection",
          "Document extraction with citation back to the source page",
          "Deadline and amendment alerting via email and Slack",
        ],
        risks: [
          "Fit scoring that is merely plausible wastes customer time and churns fast",
          "Portal terms of use vary; some sources cannot be redistributed",
          "Incumbents move down-market with a cheap tier",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 34, realistic: 44, pessimistic: 64 },
        customerCount: { count: 260, unit: "vendors @ $320/mo avg" },
        pricing: {
          model: "Jurisdiction tiers + per-response drafting credits",
          averageRevenue: 320,
          currency: "USD",
        },
        keyMilestones: [
          "National coverage plus institutional buyers (universities, health systems)",
          "Win/loss analytics fed back into fit scoring",
          "Teaming-partner matching between complementary small vendors",
        ],
        automationStack: [
          "Award-outcome ingestion to close the feedback loop on scoring",
          "Per-vendor content library versioning",
        ],
        risks: [
          "Public procurement budgets are political and can contract sharply",
          "Drafting quality expectations rise faster than the content library matures",
        ],
        verdict: "stretch",
      },
    ],
    competitors: ["GovWin IQ (Deltek)", "BidPrime", "GovDash", "Rogue", "OpenGov Procurement"],
    moat: "The vendor's own accumulated response library plus award-outcome feedback on fit scoring",
    firstExperiment:
      "Pick one state and one NAICS family, run matching over 90 days of historical solicitations, and show 15 vendors what they missed. Track how many say the misses were real.",
    rank100k: 12,
    rank1m: 10,
    screenedAt: "2026-08",
    riskProfile: {
      liability: "low",
      regulatoryExposure:
        "Sits next to procurement rules without being inside them. No lobbying, no contact with evaluators, no submission on a vendor's behalf, and no coordination between vendors bidding the same solicitation — the last of which would be an antitrust problem, not a product feature.",
      dataSensitivity:
        "Publicly published solicitations plus the vendor's own past-performance content, which is confidential to that tenant and never pooled across customers.",
      capitalNeed:
        "Under $3k to first revenue; ingestion and storage are the fixed costs.",
      agentOperability:
        "Ingestion, matching, drafting, and alerting run unattended. A human reviews source terms of use before adding a jurisdiction and never lets the agent submit a bid.",
      ethicalGuardrails: [
        "Official sources and published feeds only — no scraping behind logins or around access controls",
        "Never submit a response; the vendor signs and files their own bid",
        "Never match two competing vendors into a coordinated bid",
        "Report fit scores with the reasoning shown, and publish measured hit rates rather than win promises",
      ],
    },
  },
  {
    id: "14",
    slug: "regulation-diff-feed",
    name: "Regulation Diff Feed",
    tagline: "Clause-level change alerts for one narrow regulated niche",
    category: "data-product",
    summary:
      "Monitors a defined list of official regulatory sources for one narrow industry, diffs documents at clause level when they change, summarises what moved and which internal artifacts it touches, and delivers it by email, Slack, or API.",
    problem:
      "Compliance staff in narrow niches — food and cosmetics labelling, device labelling, product safety documentation — track rule changes by hand across agency sites and PDF bulletins. Broad regulatory intelligence platforms cover everything shallowly and price for banks, so small manufacturers subscribe to newsletters and hope.",
    solution:
      "A curated source list per niche, clause-level diffing, and a summary that always shows the primary-source text next to the change. Subscribers map their own labels, SOPs, or templates to clauses once, and then get told which of their artifacts a change touches.",
    targetCustomer:
      "Compliance and quality leads at small manufacturers, importers, and consultancies in one regulated niche",
    aiLeverage: [
      "Clause-level diff summarisation with the source text always attached",
      "Impact mapping from a changed clause to the subscriber's registered artifacts",
      "Noise suppression — editorial and formatting changes filtered from substantive ones",
      "Plain-language rewrites for non-specialists, with the original one click away",
    ],
    zeroEmployeeOps: [
      "Monitoring, diffing, and delivery are entirely scheduled jobs",
      "Self-serve subscription with no onboarding call",
      "Content doubles as SEO and newsletter distribution",
      "Support burden is near zero — the product is a feed",
    ],
    dimensions: baseDimensions(
      [7, 9, 7, 9, 5, 4],
      [
        "Summarisation and impact mapping are AI; detection is a deterministic diff",
        "No human in the loop once the source list is curated",
        "A free public feed can build an audience within weeks; conversion is the slow part",
        "90%+ margin — costs are storage, crawling, and modest inference",
        "Source curation and impact mapping are copyable; the audience is the real asset",
        "Narrow niches have small searchable audiences and no marketplace",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 18, pessimistic: 30 },
        customerCount: { count: 90, unit: "teams @ $92/mo avg" },
        pricing: {
          model: "Team subscription ($49–$249/mo) + API tier",
          averageRevenue: 92,
          currency: "USD",
        },
        keyMilestones: [
          "One niche covered end to end with a public free tier",
          "Clause-level diffs with primary-source citation on every alert",
          "Artifact mapping so subscribers see which of their documents a change hits",
          "1,000 free subscribers as the conversion pool",
        ],
        automationStack: [
          "Scheduled source crawling with change detection and archival",
          "Diff pipeline with substantive-versus-editorial classification",
          "Email, Slack, and webhook delivery",
        ],
        risks: [
          "A niche narrow enough to own may be too small to reach $100k",
          "Standards bodies charge for their texts — quoting beyond fair use is a copyright problem",
          "A free government alerting service can appear and take the floor",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 42, realistic: 54, pessimistic: 72 },
        customerCount: { count: 700, unit: "teams @ $119/mo avg" },
        pricing: {
          model: "Multi-niche bundles + enterprise API",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "Six or more niches, each with its own curated source list",
          "API tier sold to consultancies embedding alerts in client portals",
          "Historical clause archive as a separate research product",
        ],
        automationStack: [
          "Per-niche source health monitoring with staleness alerts",
          "Cross-niche deduplication of overlapping regulations",
        ],
        risks: [
          "Each new niche needs its own curation and starts the audience build from zero",
          "Incumbent legal publishers bundle equivalent alerts into existing contracts",
          "Ceiling is set by audience size, not by product quality",
        ],
        verdict: "unlikely",
      },
    ],
    competitors: [
      "Compliance.ai",
      "LexisNexis Regulatory",
      "Thomson Reuters Regulatory Intelligence",
      "niche paid newsletters",
    ],
    moat: "Curated source lists and a clause-level historical archive that cannot be backfilled by a new entrant",
    firstExperiment:
      "Run a free weekly diff digest for one niche for 8 weeks. Measure open rate and how many recipients ask for artifact mapping — that ask is the paid product.",
    rank100k: 13,
    rank1m: 14,
    screenedAt: "2026-08",
    riskProfile: {
      liability: "low",
      regulatoryExposure:
        "Publishing about regulation is not practising law. Every alert is framed as notice of a change with the primary source attached, never as advice on what a subscriber must do, and terms say so.",
      dataSensitivity:
        "Public regulatory documents plus a subscriber's own artifact titles. No sensitive customer data. Copyright is the live issue: link and quote briefly from paywalled standards, never republish them.",
      capitalNeed:
        "Under $1k to first revenue — crawling, storage, and inference only.",
      agentOperability:
        "Crawling, diffing, drafting, and delivery run fully unattended. A human curates the initial source list per niche and checks licensing before any paywalled source is added.",
      ethicalGuardrails: [
        "Always show the primary source; never let a summary be the only thing a subscriber sees",
        "Label every summary as notice of change, not legal advice",
        "Respect the licence on standards texts — link out rather than reproduce",
        "Correct a wrong or missed alert publicly in the next issue",
      ],
    },
  },
];
