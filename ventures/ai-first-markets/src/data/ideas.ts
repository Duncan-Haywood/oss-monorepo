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
    rank1m: 5,
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
    rank100k: 8,
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
    rank100k: 6,
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
    rank100k: 12,
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
    rank1m: 12,
  },
  {
    id: "09",
    slug: "accessibility-regression-guard",
    name: "Accessibility Regression Guard",
    tagline: "Source-level WCAG fixes as pull requests — no overlay, no compliance theater",
    category: "devtools",
    summary:
      "A GitHub App that scans each PR for accessibility regressions and opens small, reviewable fix PRs against the source — plus an honest report of what automation cannot verify. Sold monthly per repository to teams facing EAA and ADA exposure.",
    problem:
      "European Accessibility Act deadlines have passed and member states are now supervising against them, with per-violation fines reported up to €100k in Germany and €250k in France. US federal web-accessibility filings keep climbing (roughly 3,100 in 2025, about 27% over 2024). Teams respond by buying an audit PDF nobody actions, or an overlay widget that does not fix the source — over 800 businesses running overlays were sued anyway, and the FTC ordered accessiBe to pay $1M for overstating what its automated remediation could do.",
    solution:
      "Run axe-core plus component-aware LLM analysis on every pull request. Block new violations, and open separate fix PRs for the mechanical ones (missing labels, alt text, heading order, contrast tokens, focus traps) written against the actual components. Ship a scoped conformance report that states plainly which criteria automation checked and which still need human testing.",
    targetCustomer:
      "5–100 person product teams at EU-facing SaaS and e-commerce companies; agencies maintaining client sites under retainer",
    aiLeverage: [
      "LLM maps a rule violation to the component that renders it, not just the DOM node",
      "Generates fixes that follow the repo's own component and token conventions",
      "Drafts alt text and label copy from surrounding content for human approval",
      "Learns which fix shapes a team merges and which it rejects",
    ],
    zeroEmployeeOps: [
      "GitHub Marketplace install and per-repo Stripe billing",
      "Fix quality gated by the customer's own CI, so no human QA loop",
      "Docs-trained support bot; manual-audit requests routed to partner firms for a referral fee",
      "Scope-limit language baked into every generated report, not into sales conversations",
    ],
    dimensions: baseDimensions(
      [8, 9, 8, 9, 7, 8],
      [
        "Rule detection is deterministic; the AI value is in generating correct source-level fixes",
        "Fully CI-driven; the customer's review process is the human step",
        "Regulatory deadlines already passed, so budget exists today",
        "Static analysis plus bounded inference per diff keeps COGS low",
        "Moat is a repo-specific fix library and regression baselines, not model access",
        "GitHub Marketplace, a11y communities, and agency partners",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 7, realistic: 12, pessimistic: 22 },
        customerCount: { count: 105, unit: "teams @ $79/mo avg" },
        pricing: {
          model: "Per-repo SaaS ($49–$199/repo/mo)",
          averageRevenue: 79,
          currency: "USD",
        },
        keyMilestones: [
          "PR-blocking scanner with the top 20 auto-fixable WCAG rules",
          "Fix-PR generator validated on 25 open-source projects",
          "Scoped conformance report with explicit automation limits",
          "GitHub Marketplace listing plus agency referral program",
          "First 25 paying repos from EU-facing SaaS",
        ],
        automationStack: [
          "GitHub webhooks → Workers → axe-core runner → inference",
          "Stripe per-repo metering with per-tenant inference caps",
          "Docs RAG support bot; partner routing for manual audits",
        ],
        risks: [
          "Marketing that drifts into compliance guarantees invites an FTC-style action",
          "Automation covers a minority of WCAG criteria, so buyers may expect more than it delivers",
          "Framework churn breaks component-level fix recipes",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 26, realistic: 40, pessimistic: 54 },
        customerCount: { count: 480, unit: "teams @ $174/mo avg" },
        pricing: {
          model: "Per-repo tiers plus org-wide plan with reporting",
          averageRevenue: 174,
          currency: "USD",
        },
        keyMilestones: [
          "Org-wide dashboard with per-property conformance trend",
          "Design-system mode that fixes once and propagates",
          "Partner network of manual auditors for the criteria automation cannot judge",
          "Procurement-ready accessibility documentation export",
        ],
        automationStack: [
          "Org-wide scan scheduling with per-tenant inference budgets",
          "Partner routing for manual-audit requests with rev-share tracking",
          "Conformance report generation triggered on release tags",
        ],
        risks: [
          "Deque and other incumbents move down-market",
          "Enforcement intensity varies by member state and could soften demand",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Deque axe DevTools",
      "TestParty",
      "Evinced",
      "Pope Tech",
      "accessiBe / UserWay (overlays)",
    ],
    moat: "Repo-specific fix recipes and regression baselines, plus a trust position overlay vendors legally cannot occupy",
    firstExperiment:
      "Run the fixer across 25 popular open-source projects, open real PRs, and publish the merge-acceptance rate. Merged PRs are the proof; the write-up is the distribution.",
    liability: {
      level: "medium",
      guardrails: [
        "Never claim WCAG, EAA, or ADA compliance — the FTC's $1M accessiBe order was about exactly that claim",
        "State in-product which criteria were machine-checked and which were not",
        "Sell remediation and regression prevention, never legal defensibility",
        "Fixes land as PRs the customer reviews and merges; nothing auto-merges",
      ],
    },
    sources: [
      {
        label: "EU accessibility requirements and EAA enforcement status",
        url: "https://www.levelaccess.com/blog/eu-accessibility-requirements-and-eaa-compliance/",
      },
      {
        label: "ADA website lawsuit tracker (filing volumes)",
        url: "https://info.usablenet.com/ada-website-compliance-lawsuit-tracker",
      },
      {
        label: "FTC order: accessiBe to pay $1M over automated remediation claims",
        url: "https://www.adatitleiii.com/2025/05/federal-trade-commission-orders-accessibe-to-pay-1m-for-misleading-claims-relating-to-automated-website-accessibility-remediation-tool/",
      },
    ],
    researched: "2026-08-18",
    rank100k: 2,
    rank1m: 4,
  },
  {
    id: "10",
    slug: "cra-sbom-autopilot",
    name: "CRA Readiness Autopilot",
    tagline: "SBOMs, exploited-vulnerability watch, and 24/72-hour report drafts for small software manufacturers",
    category: "devtools",
    summary:
      "Continuous SBOM generation wired into CI, matched against exploited-vulnerability feeds, with a drafted incident-report workflow for the EU Cyber Resilience Act's reporting clocks. Sold monthly per product line to vendors with no security team.",
    problem:
      "CRA vulnerability and incident reporting obligations start 11 September 2026: a 24-hour early warning and a 72-hour full notification to ENISA and national CSIRTs. Machine-readable SBOM obligations formally bite in December 2027, but you cannot report on components you have never inventoried. Penalties reach €15M or 2.5% of global turnover, and non-EU manufacturers are in scope once their products reach the EU market. Small vendors have neither the inventory nor the clock discipline.",
    solution:
      "A CI action that emits CycloneDX/SPDX SBOMs per build and stores them per release, continuously re-matches those components against exploited-vulnerability feeds, and when something lands, starts a timer and drafts the early-warning and follow-up notifications with the evidence attached. The customer reviews and files; the tool never files for them.",
    targetCustomer:
      "5–200 person software vendors and embedded-device makers selling into the EU, especially open-source-heavy teams with no dedicated security function",
    aiLeverage: [
      "Resolves messy dependency and vendor naming to canonical component identities",
      "Triages whether an advisory actually reaches the shipped configuration",
      "Drafts the notification narrative from commit, build, and advisory evidence",
      "Summarises component risk per release for the customer's own security page",
    ],
    zeroEmployeeOps: [
      "Self-serve GitHub/GitLab install with Stripe per-product-line billing",
      "Feed ingestion and re-matching run as scheduled jobs, not human review",
      "Escalation is a notification to the customer, never an action taken on their behalf",
      "Templates and docs maintained as versioned content, reviewed on feed changes",
    ],
    dimensions: baseDimensions(
      [7, 8, 7, 9, 7, 7],
      [
        "Inventory and matching are deterministic; AI does triage and drafting",
        "No human in the loop for detection; the customer owns the filing decision",
        "A dated regulatory obligation creates budget without market education",
        "Mostly compute and feed ingestion; inference is bounded per advisory",
        "Switching cost grows with SBOM history and evidence trail per release",
        "Reaches buyers through CI marketplaces, OSS maintainers, and CE-marking consultancies",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 8, realistic: 14, pessimistic: 24 },
        customerCount: { count: 70, unit: "vendors @ $119/mo avg" },
        pricing: {
          model: "Per-product-line SaaS ($79–$299/mo)",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "SBOM action for the five most common CI systems",
          "Release-pinned SBOM storage with diffing between versions",
          "Exploited-vulnerability matching with reachability triage",
          "Report-draft workflow with clocks, evidence bundle, and export",
          "First 20 paying vendors via OSS maintainer channels",
        ],
        automationStack: [
          "CI action → SBOM store → scheduled re-match against advisory feeds",
          "Stripe billing; PostHog for activation funnel",
          "Versioned template repo for notification drafts",
        ],
        risks: [
          "Scope creep toward being treated as the customer's compliance authority",
          "Feed quality and naming collisions produce false positives that erode trust",
          "GitHub, Cloudsmith, or Mend bundle enough of this for free",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 28, realistic: 42, pessimistic: 56 },
        customerCount: { count: 340, unit: "vendors @ $245/mo avg" },
        pricing: {
          model: "Tiered by product lines plus evidence-retention add-on",
          averageRevenue: 245,
          currency: "USD",
        },
        keyMilestones: [
          "Multi-product portfolio view for vendors with several CE-marked lines",
          "Customer-facing security advisory publishing",
          "Long-horizon evidence retention matching support-lifetime obligations",
          "Channel partnerships with CE-marking and product-compliance consultancies",
        ],
        automationStack: [
          "Advisory feed ingestion with cached per-product reachability results",
          "Evidence archive with retention matched to each product's support lifetime",
          "Referral portal for CE-marking consultancies",
        ],
        risks: [
          "Deadline-driven demand flattens once the first reporting wave passes",
          "Enterprise buyers demand assurances a solo operator should not give",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["Cloudsmith", "sbomify", "Mend.io", "Anchore", "FOSSA"],
    moat: "Per-release SBOM history plus a defensible evidence trail — worth more the longer a customer stays",
    firstExperiment:
      "Publish a free CRA readiness scanner that produces an SBOM and a component-risk summary for any public repo. Measure how many teams return to re-scan after a new advisory.",
    liability: {
      level: "medium",
      guardrails: [
        "Draft filings; never submit to ENISA or a CSIRT on a customer's behalf",
        "Position as documentation and monitoring tooling, not a conformity assessment body",
        "Report clocks conservatively and log every notification sent to the customer",
        "No claims that using the product makes a manufacturer CRA-compliant",
      ],
    },
    sources: [
      {
        label: "CRA compliance guide — reporting and SBOM timelines",
        url: "https://www.mend.io/blog/eu-cyber-resilience-act-compliance-guide/",
      },
      {
        label: "Countdown to 11 September 2026 CRA reporting obligations",
        url: "https://www.keysight.com/blogs/en/tech/nwvs/2025/09/11/one-year-countdown-to-eu-cra-compliance-september-11-2026-changes-everything",
      },
      {
        label: "CRA SBOM requirements",
        url: "https://sbomify.com/compliance/eu-cra/",
      },
    ],
    researched: "2026-08-18",
    rank100k: 5,
    rank1m: 7,
  },
  {
    id: "11",
    slug: "dependency-upgrade-agent",
    name: "Upgrade Agent",
    tagline: "Breaking-change migrations delivered as green-tested pull requests",
    category: "devtools",
    summary:
      "An agent that performs major-version framework, runtime, and SDK migrations in an isolated worktree, iterates until the customer's own test suite and typecheck pass, and opens one reviewable PR with a change report. Priced per completed migration, with a retainer to stay current.",
    problem:
      "Dependabot and Renovate open the pull request and stop at the breakage. Major upgrades — runtime end-of-life, framework majors, SDK rewrites — sit untouched for years, and they block the security patches stacked behind them. The work is unglamorous, well-defined, and exactly what teams defer indefinitely.",
    solution:
      "Point the agent at a repo and a target version. It runs the migration in a branch, executes the repo's own tests, typecheck, and lint, and iterates until green — or stops and reports precisely where a human decision is needed. Output is one PR plus a diff-level explanation of every behavioural change.",
    targetCustomer:
      "10–150 person engineering teams carrying deferred upgrades; agencies maintaining many client codebases on old majors",
    aiLeverage: [
      "Migration executed by an agent loop against the repo's real test suite",
      "Per-framework migration recipes refined from every completed job",
      "Explains behavioural changes at the diff level for reviewers",
      "Knows when to stop and escalate rather than guess at intent",
    ],
    zeroEmployeeOps: [
      "Self-serve repo connect, scoped branch-only write access",
      "Outcome-priced: billing triggers on a green PR, so success is machine-verifiable",
      "Isolated worktree per job with hard cost ceilings",
      "Support bot plus a public recipe catalogue that doubles as SEO",
    ],
    dimensions: baseDimensions(
      [9, 8, 7, 8, 6, 7],
      [
        "The product is an agent loop; nothing else does the work",
        "Verification is the customer's CI, which removes the human QA bottleneck",
        "Outcome pricing shortens the sale, but the first jobs need hand-holding",
        "Inference-heavy per job; margin depends on recipe reuse across customers",
        "Recipes and a growing corpus of verified migrations, not model access",
        "GitHub Marketplace, EOL-driven search demand, agency channel",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 9, realistic: 15, pessimistic: 26 },
        customerCount: { count: 60, unit: "teams @ $139/mo retainer plus job fees" },
        pricing: {
          model: "Per-migration fee ($200–$2,000) plus stay-current retainer",
          averageRevenue: 139,
          currency: "USD",
        },
        keyMilestones: [
          "Three deep recipes for high-demand migrations with real EOL pressure",
          "Green-gate harness that refuses to open a PR unless CI passes",
          "Published success rate and median human-review time per recipe",
          "20 paid migrations sold to teams found via EOL-related search traffic",
          "Retainer tier that re-runs quarterly to prevent drift",
        ],
        automationStack: [
          "Job queue → isolated worktree runners with per-job spend caps",
          "Stripe usage billing keyed to verified-green PRs",
          "Recipe catalogue published as static content for organic discovery",
        ],
        risks: [
          "Coding agents in the IDE make this a DIY task for competent teams",
          "Inference cost per job can exceed the fee on large or untested repos",
          "Repos with weak test coverage cannot be verified, so they must be declined",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 24, realistic: 38, pessimistic: 52 },
        customerCount: { count: 380, unit: "teams @ $219/mo avg plus job fees" },
        pricing: {
          model: "Retainer tiers plus per-migration fees; agency multi-repo plan",
          averageRevenue: 219,
          currency: "USD",
        },
        keyMilestones: [
          "Agency plan covering dozens of client repos under one contract",
          "Recipe library broad enough that most inbound jobs need no new work",
          "Continuous mode that keeps repos on supported majors year-round",
          "Self-hosted runner option for teams that will not grant cloud access",
        ],
        automationStack: [
          "Runner fleet with worktree isolation and per-job spend ceilings",
          "Versioned recipe registry published as public content",
          "Usage billing keyed to verified-green pull requests",
        ],
        risks: [
          "Platform vendors ship first-party upgrade agents",
          "Coverage debt in customer repos caps how much can be automated",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Renovate / Mend",
      "Dependabot",
      "Moderne / OpenRewrite",
      "Sourcegraph batch changes",
      "In-house use of coding agents",
    ],
    moat: "A verified-migration corpus and per-framework recipes, plus outcome pricing incumbents on seat pricing cannot easily match",
    firstExperiment:
      "Complete ten migrations on public repos with real test suites for free, publish the green-rate and median review time, and offer the same on private repos at a fixed fee.",
    liability: {
      level: "medium",
      guardrails: [
        "Branch-scoped write access only; never auto-merge and never touch main",
        "Refuse jobs where the test suite cannot verify the result, and say why",
        "No access to production secrets; runners are isolated and ephemeral per job",
        "Customer keeps ownership and review of every line the agent writes",
      ],
    },
    sources: [],
    researched: "2026-08-18",
    rank100k: 4,
    rank1m: 3,
  },
  {
    id: "12",
    slug: "llm-feature-assurance",
    name: "LLM Feature Assurance",
    tagline: "Regression tests, injection probes, and disclosure checks for teams shipping AI features",
    category: "ai-agent",
    summary:
      "A hosted assurance suite that runs on every prompt change, model swap, and deploy: golden-set regressions, prompt-injection probes, PII-leak detection, and AI-disclosure checks. Sold per AI feature to product teams that shipped an LLM feature without a test gate.",
    problem:
      "Enormous numbers of small SaaS products shipped an AI feature and have no gate on it. A prompt tweak or a model version bump silently changes behaviour; user-supplied content carries injections; outputs leak context that should never surface. Meanwhile EU AI Act transparency obligations under Article 50 became applicable on 2 August 2026 and apply to any system interacting with people or generating content — not only high-risk systems, whose deadline was pushed to December 2027 by the Digital Omnibus.",
    solution:
      "Point the suite at an endpoint or SDK. It maintains golden sets per feature, runs a maintained injection and jailbreak corpus, checks for PII and context leakage, and verifies that AI interaction and synthetic-content disclosures are actually present. Every run emits a scorecard artifact that a PR can block on.",
    targetCustomer:
      "5–100 person SaaS teams with one to five shipped AI features and no ML or safety staff",
    aiLeverage: [
      "Judge models grade open-ended outputs against per-feature rubrics",
      "Injection and jailbreak corpus refreshed from public research on a schedule",
      "Failure clustering that names the likely cause instead of dumping diffs",
      "Auto-proposes golden cases from real production failures the customer forwards",
    ],
    zeroEmployeeOps: [
      "Self-serve connect, Stripe usage billing per evaluation run",
      "Corpus and rubric updates ship as versioned content, not consulting",
      "Findings are reports; remediation stays with the customer",
      "Docs-trained support bot with escalation to a public issue tracker",
    ],
    dimensions: baseDimensions(
      [9, 9, 7, 8, 6, 7],
      [
        "AI is both the subject under test and the grading mechanism",
        "Runs are scheduled or CI-triggered with no human in the loop",
        "Buyers understand the pain but rarely have a line item for it yet",
        "Judge-model inference is the main cost; caching keeps it bounded",
        "Crowded tooling space; the moat is the corpus and per-vertical rubrics",
        "Developer channels, AI engineering communities, framework integrations",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 28 },
        customerCount: { count: 95, unit: "teams @ $88/mo avg" },
        pricing: {
          model: "Usage-based per evaluation run ($49–$249/mo typical)",
          averageRevenue: 88,
          currency: "USD",
        },
        keyMilestones: [
          "Golden-set regression runner with PR-blocking scorecards",
          "Maintained injection corpus with monthly refresh notes",
          "PII and context-leak detectors with tunable thresholds",
          "Article 50 disclosure checks for chat and generated-content surfaces",
          "First 30 paying teams via AI engineering communities",
        ],
        automationStack: [
          "Webhook or CI trigger → eval runner → scorecard artifact",
          "Cached judge inference with per-tenant spend caps",
          "Corpus versioning with public changelog",
        ],
        risks: [
          "Promptfoo, Braintrust, and LangSmith already own developer mindshare",
          "Model vendors bundle evaluation into their own platforms",
          "Buyers treat assurance as optional until an incident forces it",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 44, pessimistic: 60 },
        customerCount: { count: 420, unit: "teams @ $198/mo avg" },
        pricing: {
          model: "Tiered by features under test plus retained evidence history",
          averageRevenue: 198,
          currency: "USD",
        },
        keyMilestones: [
          "Vertical rubric packs where wrong answers carry real consequences",
          "Evidence retention that survives a customer's own audit",
          "Framework-native integrations that make adoption a one-liner",
          "Continuous production sampling in addition to pre-deploy runs",
        ],
        automationStack: [
          "Scheduled production sampling with cached judge inference",
          "Corpus release pipeline with a public changelog",
          "Per-feature evidence retention store",
        ],
        risks: [
          "Commoditisation by open-source harnesses",
          "Regulatory framing shifts and dates move, as the Digital Omnibus showed",
        ],
        verdict: "viable",
      },
    ],
    competitors: ["Promptfoo", "Braintrust", "LangSmith", "Lakera", "Giskard"],
    moat: "Maintained adversarial corpus plus per-vertical rubrics and retained evidence history",
    firstExperiment:
      "Run the injection corpus against 20 public AI features, report findings privately to each vendor first, then publish only aggregate statistics. Responsible disclosure is the distribution.",
    liability: {
      level: "medium",
      guardrails: [
        "Sell testing, never certification — no claim that a customer is AI Act conformant",
        "Probe only systems the customer owns and has authorised in writing",
        "Report vulnerabilities privately first; never publish a named finding without consent",
        "Detectors are best-effort and labelled as such; no guarantee of leak-free output",
      ],
    },
    sources: [
      {
        label: "EU AI Act Article 50 transparency obligations",
        url: "https://artificialintelligenceact.eu/transparency-rules-article-50/",
      },
      {
        label: "AI Act deadline changes under the Digital Omnibus",
        url: "https://www.lw.com/en/insights/ai-act-update-eu-resolves-to-change-rules-and-extend-deadlines",
      },
      {
        label: "US companies and the AI Act's 2026 obligations",
        url: "https://www.hklaw.com/en/insights/publications/2026/04/us-companies-face-eu-ai-acts-possible-august-2026-compliance-deadline",
      },
    ],
    researched: "2026-08-18",
    rank100k: 9,
    rank1m: 10,
  },
  {
    id: "13",
    slug: "regulatory-deadline-feed",
    name: "Regulatory Deadline Feed",
    tagline: "A machine-readable feed of digital-compliance dates, every entry tied to primary law",
    category: "data-product",
    summary:
      "A curated dataset of digital-regulation obligations — scope, jurisdiction, dates, citation, and change history — delivered as an API, calendar feed, and webhook. Sold to tooling vendors who embed it and to teams who need the dates to move when the law moves.",
    problem:
      "Digital compliance dates are scattered across official journals and stale vendor blog posts, and they move: the Digital Omnibus shifted the AI Act's high-risk deadline from August 2026 to December 2027 after most published guides had already been written. Anyone building compliance features re-derives the same calendar by hand and gets it wrong when it changes.",
    solution:
      "One dataset covering the EU Accessibility Act, Cyber Resilience Act, AI Act, US state privacy laws, and ADA rulemaking. Each obligation carries who is in scope, the effective date, a link to the primary text, and a versioned history of every change. An agent watches official sources and drafts diffs; a human approves before anything publishes.",
    targetCustomer:
      "Compliance and devtool vendors embedding a deadline layer; agencies; in-house platform teams tracking obligations across jurisdictions",
    aiLeverage: [
      "Monitors official sources and extracts obligations into a structured schema",
      "Drafts change diffs when a text is amended, with the citation attached",
      "Normalises scope language across jurisdictions into filterable fields",
      "Flags low-confidence extractions for human review instead of publishing them",
    ],
    zeroEmployeeOps: [
      "Ingestion, extraction, and diffing run on a schedule",
      "Self-serve API keys with Stripe metered billing",
      "Free public calendar page carries the SEO and feeds the paid API",
      "Corrections handled as versioned dataset updates with a public changelog",
    ],
    dimensions: baseDimensions(
      [7, 9, 6, 9, 6, 6],
      [
        "AI does extraction and change detection; the value is the curated result",
        "Near-fully automated with a human approval gate before publishing",
        "Dataset must reach useful coverage before anyone will pay for it",
        "Data products carry almost no marginal cost per customer",
        "Moat is coverage plus change history; the underlying texts are public",
        "Embedding partners and organic search are the channels; no marketplace exists",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 20, pessimistic: 32 },
        customerCount: { count: 55, unit: "accounts @ $152/mo avg" },
        pricing: {
          model: "API tiers ($49–$499/mo) plus embedding licences",
          averageRevenue: 152,
          currency: "USD",
        },
        keyMilestones: [
          "Cover EAA, CRA, and AI Act completely with citations",
          "Free public calendar with ICS export as the distribution wedge",
          "Versioned API with webhooks on obligation changes",
          "First three embedding partners shipping the feed inside their products",
          "Add US state privacy laws and ADA rulemaking",
        ],
        automationStack: [
          "Scheduled source ingestion → extraction → human approval queue → publish",
          "Versioned dataset in object storage; API served from the edge",
          "Stripe metered billing with per-key quotas",
        ],
        risks: [
          "Free trackers cap willingness to pay",
          "Coverage gaps are more damaging here than anywhere else — a missing deadline is the failure mode",
          "Buyers may want interpretation, which is exactly what this must not sell",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 36, realistic: 54, pessimistic: 72 },
        customerCount: { count: 260, unit: "accounts @ $320/mo avg" },
        pricing: {
          model: "API tiers plus per-seat alerting and embedding licences",
          averageRevenue: 320,
          currency: "USD",
        },
        keyMilestones: [
          "Coverage broad enough to be the default embed for compliance tooling",
          "Per-customer scoping so alerts fire only for obligations that apply",
          "Historical change dataset licensed separately",
        ],
        automationStack: [
          "Source ingestion with confidence-scored extraction and a human approval queue",
          "Versioned dataset publishing with webhook fan-out on changes",
          "Per-customer scope filters applied at the edge",
        ],
        risks: [
          "Legal publishers move down-market with the same data",
          "Curation load grows faster than automation can absorb",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Bloomberg Law / Thomson Reuters",
      "Compliance.ai",
      "IAPP trackers",
      "Free vendor deadline pages",
    ],
    moat: "Citation-first coverage with a versioned change history — the part free trackers never keep",
    firstExperiment:
      "Publish a free, citation-linked deadline calendar for the EAA, CRA, and AI Act with ICS export. Measure API waitlist signups and inbound embed requests.",
    liability: {
      level: "medium",
      guardrails: [
        "Information, not legal advice — stated in the product, terms, and every export",
        "Source only official public texts; no paywalled analyst content resold",
        "Public, logged-out sources only, honouring robots directives; never bypass authentication (the hiQ line held, but the fake-account conduct was what lost)",
        "Every entry links its citation so a customer can verify rather than trust",
        "No accuracy warranty beyond a documented correction-turnaround commitment",
      ],
    },
    sources: [
      {
        label: "AI Act deadline changes under the Digital Omnibus",
        url: "https://www.lw.com/en/insights/ai-act-update-eu-resolves-to-change-rules-and-extend-deadlines",
      },
      {
        label: "Scraping legality: hiQ, Meta v. Bright Data, and public data",
        url: "https://www.browserless.io/blog/is-web-scraping-legal",
      },
    ],
    researched: "2026-08-18",
    rank100k: 11,
    rank1m: 13,
  },
  {
    id: "14",
    slug: "agent-ready-commerce",
    name: "Agent-Ready Commerce",
    tagline: "Make a catalog legible to shopping agents — feed hygiene, structured data, visibility tracking",
    category: "vertical-saas",
    summary:
      "A Shopify app that continuously audits catalog data against agentic-commerce feed requirements and schema.org, fixes the mechanical gaps, and tracks whether the store's products actually surface in AI shopping answers. A timing bet on discovery, not checkout.",
    problem:
      "Over a million Shopify merchants are auto-enrolled in ChatGPT Shopping and Google AI Mode, but whether their products get surfaced depends on catalog structure they have never audited. Transactional adoption is genuinely thin — the first version of Instant Checkout was mothballed in March 2026 after roughly 30 Shopify merchants had used it, with OpenAI refocusing on product discovery. Discovery is where the value currently sits, and merchants cannot see how they are represented.",
    solution:
      "Continuously score catalog completeness against agentic-commerce feed specifications and schema.org product markup, auto-fix the mechanical gaps (missing attributes, ambiguous variants, unstructured availability), and run tracked category queries against AI assistants to report where the store appears and where a competitor does instead.",
    targetCustomer:
      "Shopify and BigCommerce merchants doing $1M–$50M GMV in catalog-heavy categories, plus the agencies that manage them",
    aiLeverage: [
      "Generates missing structured attributes from existing copy and images",
      "Normalises variants and taxonomy into agent-legible fields",
      "Runs and grades tracked assistant queries for visibility over time",
      "Explains, per product, which specific gap most likely blocks surfacing",
    ],
    zeroEmployeeOps: [
      "Shopify App Store install and billing — no sales motion",
      "Scheduled audits and visibility runs; the merchant approves bulk fixes",
      "Agency multi-store dashboard replaces account management",
      "Support bot on docs plus a public methodology page",
    ],
    dimensions: baseDimensions(
      [7, 9, 7, 8, 5, 7],
      [
        "AI fills structured gaps and grades assistant answers; the plumbing is ordinary",
        "App Store distribution and billing make this near-fully self-serve",
        "App Store install-to-paid is fast, but the category is still being defined",
        "Recurring visibility runs cost real inference; caching and sampling matter",
        "Weakest dimension — the protocols are young and platforms may absorb this",
        "Shopify App Store plus agency partners is a proven channel",
      ],
    ),
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 17, pessimistic: 30 },
        customerCount: { count: 145, unit: "stores @ $58/mo avg" },
        pricing: {
          model: "Shopify app subscription ($29–$149/mo)",
          averageRevenue: 58,
          currency: "USD",
        },
        keyMilestones: [
          "Catalog completeness scoring against current feed specifications",
          "Bulk attribute fixes with merchant approval and rollback",
          "Tracked visibility runs across the major assistants",
          "Agency multi-store plan",
          "First 60 paying stores through App Store search",
        ],
        automationStack: [
          "Shopify webhooks → audit runner → fix queue with approval",
          "Scheduled visibility sampling with cached results",
          "App Store billing; PostHog activation funnel",
        ],
        risks: [
          "Protocols are unstable — the Instant Checkout retreat is the proof",
          "Shopify ships the audit natively and the app becomes redundant",
          "Visibility cannot be guaranteed, so value must be framed honestly",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 34, realistic: 52, pessimistic: 72 },
        customerCount: { count: 620, unit: "stores @ $134/mo avg" },
        pricing: {
          model: "Tiered by catalog size plus agency plans",
          averageRevenue: 134,
          currency: "USD",
        },
        keyMilestones: [
          "Multi-platform support beyond Shopify",
          "Attribution linking agent-referred sessions to catalog changes",
          "Agency white-label tier",
        ],
        automationStack: [
          "Multi-platform connector layer with per-store audit scheduling",
          "Sampled visibility runs with cached assistant responses",
          "White-label reporting for the agency tier",
        ],
        risks: [
          "Agentic commerce may consolidate into platform-native tooling",
          "Established feed-management vendors extend into the same audit",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Feedonomics",
      "DataFeedWatch",
      "Profound / Peec AI (visibility)",
      "Shopify native feed tooling",
    ],
    moat: "Thin by design — this is a timing bet on discovery mechanics, and it should be judged as one",
    firstExperiment:
      "Audit 50 public storefronts against current feed specifications and send each a free scored report. Measure reply rate and how many ask for the fixes.",
    liability: {
      level: "low",
      guardrails: [
        "Never guarantee placement or ranking in AI assistant answers",
        "No cloaking, no crawler-targeted content, no instructions embedded for agents — manipulation of an assistant's answers is off the table even where it would work",
        "Catalog writes are merchant-approved and reversible",
        "Visibility reports state their sampling method so results are checkable",
      ],
    },
    sources: [
      {
        label: "OpenAI agentic commerce — key concepts",
        url: "https://developers.openai.com/commerce/guides/key-concepts",
      },
      {
        label: "Instant Checkout mothballed; focus shifts to discovery",
        url: "https://explodingtopics.com/blog/agentic-commerce-protocol",
      },
      {
        label: "Preparing product data for agentic commerce",
        url: "https://www.bluestonepim.com/blog/how-to-prepare-for-agentic-commerce",
      },
    ],
    researched: "2026-08-18",
    rank100k: 13,
    rank1m: 14,
  },
];
