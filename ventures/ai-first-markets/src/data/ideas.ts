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
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "No sector regulation; the exposure is contractual, over customer source code held in confidence",
        "Enterprise buyers impose SOC2 and DPA obligations well before the first six-figure deal",
      ],
      dataSensitivity:
        "Reads diffs and repository context through least-privilege app scopes. Only review metadata and feedback signals are retained — no full-repo mirroring, no training on customer code.",
      entityAndInsurance:
        "LLC plus tech E&O. Terms cap liability at fees paid and state that review output is advisory and does not replace human review.",
      mitigations: [
        "Read and comment scopes only: never merge, never write to a protected branch",
        "Diff retention measured in days, with deletion on request",
        "Publish false-positive rates alongside catch rates so buyers can calibrate trust",
        "No security guarantee language — a missed vulnerability must never be a contractual breach",
      ],
      ethicalGuardrails: [
        "No training on customer code without explicit opt-in",
        "Label AI-authored review comments as machine-generated",
        "Never soften a severity rating to keep a customer's dashboard green",
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
    rank100k: 2,
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
    riskProfile: {
      liabilityTier: "elevated",
      regulatoryExposure: [
        "State call-recording consent statutes, including two-party consent jurisdictions",
        "TCPA and state analogues for any SMS follow-up or callback",
        "2026 state chatbot and AI-disclosure statutes apply to voice assistants, not just chat",
        "PCI scope the moment a card number is spoken on a call — which is why it must never be accepted",
      ],
      dataSensitivity:
        "Handles end-user phone numbers, addresses, and call audio: the most sensitive data anywhere in this portfolio. Audio is transcribed and discarded on a short clock, and card details are never accepted on the line.",
      entityAndInsurance:
        "LLC plus tech E&O and cyber cover before the first live phone line. Written authorization to answer as the customer's business, and a DPA covering call data.",
      mitigations: [
        "Disclose that the assistant is not human at the start of every call and whenever asked",
        "Announce recording where consent is required and route to voicemail if the caller declines",
        "SMS only to numbers that just called in, with opt-out honoured on the first request",
        "Hard escalation to a human number for emergencies — gas smell, flooding, no heat in winter",
      ],
      ethicalGuardrails: [
        "The assistant never claims to be a person, under any prompt",
        "It never takes payment details or quotes a binding price on the customer's behalf",
        "Emergency calls escalate to a human rather than being booked into a queue",
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
    rank1m: 2,
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
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "Customer frameworks (SOC2, ISO 27001, HIPAA) define the content; we are not an auditor and cannot issue an opinion",
        "Misrepresentation exposure if generated documents are marketed as certification rather than drafts",
      ],
      dataSensitivity:
        "Ingests policy inputs and configuration summaries, not production systems. No PHI and no cardholder data ever enters the product — those stay in the customer's environment.",
      entityAndInsurance:
        "LLC plus tech E&O. Terms disclaim audit and legal opinion and cap liability at fees paid.",
      mitigations: [
        "Never describe output as certification: auditors certify, generators draft",
        "Every generated control claim cites the evidence the customer actually supplied",
        "Refuse to generate evidence the customer has not produced — no synthetic audit trails",
        "Version and date every template so a customer knows which framework revision applies",
      ],
      ethicalGuardrails: [
        "No fabricated evidence and no backdated policies, at any price",
        "No implied partnership with an audit firm that does not exist",
        "Flag controls the customer plainly does not operate instead of papering over them",
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
    rank100k: 8,
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
    riskProfile: {
      liabilityTier: "contained",
      regulatoryExposure: [
        "No statutory regime; monitoring third-party APIs raises terms-of-service and rate-limit questions instead",
        "Publishing comparative reliability data invites disparagement complaints when the method is not transparent",
      ],
      dataSensitivity:
        "Synthetic probe traffic and public endpoint metadata. No customer production traffic, and no credentials beyond scoped test keys the customer issues.",
      entityAndInsurance:
        "LLC plus modest tech E&O. Alerting terms disclaim any guarantee that an outage will be detected.",
      mitigations: [
        "Probe at documented, polite rates and honour each provider's published terms",
        "Publish the measurement method with every comparative claim so a vendor can reproduce it",
        "Never report a gap in our own monitoring as a vendor outage",
        "Customer-issued scoped keys only, encrypted per tenant",
      ],
      ethicalGuardrails: [
        "No load or stress testing dressed up as monitoring",
        "Correct a published reliability figure promptly when a vendor shows it is wrong",
        "No vendor can pay for a better score",
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
    rank100k: 9,
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
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "Platform terms govern automation more tightly than any statute; account-level enforcement is the real risk",
        "FTC endorsement and disclosure rules where content promotes a paying party",
      ],
      dataSensitivity:
        "Stores voice samples, drafts, and OAuth tokens for posting. No audience personal data beyond what the platform API returns.",
      entityAndInsurance:
        "LLC plus tech E&O. Single-platform concentration is a financial exposure rather than a legal one, priced in by keeping contracts month-to-month.",
      mitigations: [
        "Publish through official APIs only — never headless-browser automation of a logged-in account",
        "Human approval before anything posts, as the default setting",
        "Token scopes limited to posting and analytics, with revocation honoured immediately",
        "Second platform supported early so one policy change is not an extinction event",
      ],
      ethicalGuardrails: [
        "No purchased engagement, follower pods, or comment rings",
        "No impersonation: the account owner reviews and owns every post",
        "Refuse content that fabricates credentials, results, or client names",
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
    rank100k: 1,
    rank1m: 4,
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
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "Data-processor obligations under GDPR and CCPA for whatever customers upload",
        "Customer sector rules travel with their data; decline HIPAA and financial-records workloads until matching controls exist",
      ],
      dataSensitivity:
        "Stores customer documents and embeddings — the highest-value breach target in this portfolio. Per-tenant isolation and encryption at rest are table stakes, not roadmap items.",
      entityAndInsurance:
        "LLC, tech E&O, and cyber cover before the first production tenant. Published DPA, sub-processor list, and breach-notification commitment.",
      mitigations: [
        "Per-tenant encryption keys with hard isolation between tenants",
        "Deletion that removes embeddings and derived indexes, verified by an automated test",
        "No cross-tenant training or evaluation on customer content",
        "Refuse regulated-data workloads until the controls and agreements to match them exist",
      ],
      ethicalGuardrails: [
        "Never mine customer corpora for product insight",
        "Disclose retrieval sources so a customer can audit any answer",
        "Notify affected customers of a security incident before it is convenient to do so",
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
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "No sector regulation; exposure is contractual and governed by platform terms",
        "Test transactions must stay in sandbox or test mode to avoid payment-network problems",
      ],
      dataSensitivity:
        "Runs synthetic sessions against customer storefronts using test accounts. No real shopper data and no live card details.",
      entityAndInsurance:
        "LLC plus tech E&O. Terms state plainly that passing tests are not a warranty against production defects.",
      mitigations: [
        "Written authorization to test each storefront, captured at onboarding",
        "Sandbox or test-mode payments only; never a live charge",
        "Rate-limited synthetic traffic that cannot distort the customer's analytics or inventory",
        "Test data tagged so the customer can exclude it from their own reporting",
      ],
      ethicalGuardrails: [
        "Never test a storefront the customer does not own",
        "Defects go to the customer, never to their competitors and never into marketing",
        "Do not inflate a pass rate by silently skipping flaky checks",
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
    rank100k: 6,
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
    riskProfile: {
      liabilityTier: "elevated",
      regulatoryExposure: [
        "Unauthorized practice of law if output reaches an end user as advice rather than a platform as a tool",
        "State bar rules vary, and the platform customer's own posture matters as much as ours",
        "Data-processor role for contracts, which routinely carry personal and confidential commercial data",
      ],
      dataSensitivity:
        "Processes customer contracts: confidential commercial terms and often personal data of signatories. Default retention measured in hours, with anything longer requiring explicit opt-in.",
      entityAndInsurance:
        "LLC, tech E&O sized to the missed-clause scenario, and cyber cover — all before the first production customer. Terms disclaim legal advice, cap liability at fees paid, and require the platform customer to present output as a tool rather than counsel.",
      mitigations: [
        "Sell B2B to platforms, never advice direct to consumers: the API boundary is also the liability boundary",
        "Return confidence scores and explicit needs-human-review flags rather than a clean verdict",
        "Do not retain contract text beyond the request unless the customer opts in",
        "Publish accuracy benchmarks together with their failure modes, not just headline numbers",
      ],
      ethicalGuardrails: [
        "Never present output as a lawyer's review",
        "Escalate rather than guess on clauses the model scores as low confidence",
        "Decline redlining designed to disadvantage an unrepresented consumer party",
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
    rank1m: 8,
  },
  {
    id: "09",
    slug: "a11y-conformance-ci",
    name: "Accessibility Conformance CI",
    tagline: "WCAG 2.2 / EN 301 549 checks in CI, plus the evidence buyers ask for",
    category: "devtools",
    summary:
      "A GitHub/GitLab app that tests every PR against WCAG 2.2 AA and EN 301 549, tracks conformance over time, and generates the artifacts procurement and regulators ask for: an accessibility statement, a conformance report, and a dated remediation roadmap. Explicitly not an overlay widget.",
    problem:
      "The European Accessibility Act has been enforceable since June 2025 and member-state enforcement stepped up through 2026; only firms under 10 staff and €2M revenue are exempt. Enterprise and public-sector buyers now request conformance documentation at procurement and renewal. Most teams have a linter rule at best, nothing that produces documentation, and the overlay widgets sold as a shortcut keep losing in court.",
    solution:
      "Per-PR scanning of rendered pages and components with axe-core in a headless browser, then an AI pass that turns raw rule violations into a component-level fix and a plain-language impact note. Conformance history accumulates into evidence documents regenerated on each release tag.",
    targetCustomer:
      "20–500 person product teams shipping EU-facing web apps and e-commerce, plus agencies maintaining client sites under the same deadline",
    aiLeverage: [
      "Turns a rule violation into a specific fix in the component that caused it, not a rule ID",
      "Triages likely false positives by reading the component source and its call sites",
      "Drafts accessibility statements and conformance reports from measured results only",
      "Simulates screen-reader flows to surface failures automated rules cannot see, marked as advisory",
    ],
    zeroEmployeeOps: [
      "Self-serve marketplace install with Stripe billing by page volume",
      "Evidence documents generate on release tags as drafts the customer signs off",
      "Docs-trained support agent; no professional-services attach by design",
      "Scan cost tracked per customer so pricing tiers stay ahead of compute",
    ],
    dimensions: baseDimensions(
      [6, 9, 8, 8, 5, 7],
      [
        "Scanning core is deterministic (axe-core); AI does triage, fixes, and drafting",
        "CI-native with no human in the delivery path",
        "The compliance deadline is already live and the buyer is already looking",
        "Headless browser compute is the only real COGS; ~80% at volume",
        "axe-core is open source and incumbents are entrenched; the wedge is evidence plus price",
        "Marketplace listing, agency channel, and a deadline that generates its own search traffic",
      ],
    ),
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "European Accessibility Act / EN 301 549 — the customer's obligation, which we measure and document",
        "ADA Title II/III expectations surface in US public-sector deals",
        "No regulated personal data processed; account records only",
      ],
      dataSensitivity:
        "Renders customer web pages and stores violation records and screenshots. Public and staging URLs by default; authenticated-page screenshots are redacted unless the customer opts in. No end-user personal data.",
      entityAndInsurance:
        "US LLC from the start (~$500 with registered agent), tech E&O once revenue passes roughly $50k ARR. Terms cap liability at fees paid and state that automated testing covers a subset of WCAG success criteria.",
      mitigations: [
        "Sell measurement and evidence, never a compliance guarantee — no 'certified compliant' badge, ever",
        "Report coverage honestly: name the success criteria automation cannot decide and route them to a manual checklist",
        "Never inject a runtime overlay; nothing we ship executes in an end user's browser",
        "Scan artifacts expire after 90 days by default, with customer-triggered deletion",
      ],
      ethicalGuardrails: [
        "No overlay or one-line 'instant compliance' widget — they mask failures and have repeatedly lost in litigation",
        "No marketing built on invented fine amounts or a named lawsuit as a scare tactic",
        "Publish the product's own conformance report and treat its gaps as bugs",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 7, realistic: 12, pessimistic: 20 },
        customerCount: { count: 70, unit: "teams @ $119/mo avg" },
        pricing: {
          model: "Per-repo subscription ($49–$249/mo by page volume)",
          averageRevenue: 119,
          currency: "USD",
        },
        keyMilestones: [
          "PR scanner with fix suggestions for the 20 most common failure types",
          "Evidence pack generator: accessibility statement plus conformance report",
          "10 design partners through the agency channel",
          "Free public URL scanner as the top-of-funnel",
          "Marketplace listing and an agency reseller tier",
        ],
        automationStack: [
          "Headless Chromium workers → axe-core → LLM triage",
          "GitHub App webhooks; evidence regenerated on release tags",
          "Stripe usage tiers; docs-trained support agent",
        ],
        risks: [
          "axe-core commoditizes the scanning layer and price follows",
          "Enterprise accessibility vendors bundle CI scanning for free",
          "A wrong AI fix suggestion costs trust faster than a missed violation",
          "Enforcement intensity varies by member state, so urgency is uneven",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 42, pessimistic: 60 },
        customerCount: { count: 300, unit: "teams @ $278/mo avg" },
        pricing: {
          model: "Tiered per-repo plus org-wide conformance program",
          averageRevenue: 278,
          currency: "USD",
        },
        keyMilestones: [
          "Component-library rules for the major frameworks",
          "Reporting templates for EU public-sector procurement",
          "Partner program with 25 agencies",
          "Localized reporting (DE, FR, NL)",
        ],
        automationStack: [
          "Multi-tenant conformance ledger with per-release snapshots",
          "Automated regression budgets per repo",
        ],
        risks: [
          "Enterprise deals demand a manual audit attach, which breaks zero-employee",
          "Incumbents undercut by bundling into an existing platform",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Deque axe DevTools",
      "Level Access",
      "UsableNet",
      "Siteimprove",
      "Pa11y CI (open source)",
    ],
    moat: "Evidence artifacts anchored to a dated CI history — a conformance trail a customer cannot reconstruct after switching vendors.",
    firstExperiment:
      "Free scanner that returns a one-page EAA readiness summary for any URL. Measure how many EU e-commerce domains then request the evidence pack.",
    rank100k: 4,
    rank1m: 12,
  },
  {
    id: "10",
    slug: "upgrade-migration-agent",
    name: "Upgrade Agent",
    tagline: "Agent-authored upgrade PRs that pass your CI, not just version bumps",
    category: "devtools",
    summary:
      "Version bots open the bump and leave the breakage. This agent does the migration: runs codemods, repairs failing tests and type errors inside a sandbox running the repo's own suite, and opens a PR only when CI is green. Priced per repo, with fixed-price jobs for major migrations.",
    problem:
      "Dependency bots created a backlog rather than a solution. Small teams sit on end-of-life runtimes because each upgrade is days of unglamorous repair work with no visible payoff — until an EOL runtime fails a customer's security questionnaire and blocks a deal.",
    solution:
      "A GitHub App with least-privilege scopes. For each upgrade it plans the migration, applies published codemods, iterates on failures in an ephemeral sandbox against the repo's own tests, and opens a PR with the diff, a behavior-change note, and the CI evidence. It never merges.",
    targetCustomer:
      "5–100 engineer teams carrying EOL runtimes, and agencies maintaining ten or more client repos",
    aiLeverage: [
      "Iterative repair loop: read the failure, patch, re-run, until the suite is green",
      "Selects codemods and writes the migration steps no codemod covers",
      "Reads changelogs and breaking-change notes across the transitive tree",
      "Writes the PR narrative explaining behavior changes to a human reviewer",
    ],
    zeroEmployeeOps: [
      "Marketplace install plus Stripe subscription and one-time job billing",
      "Sandboxed runners scale on demand and are destroyed after each job",
      "Per-(framework, version) success rate measured; the agent declines job types below threshold",
      "Support agent trained on the migration playbooks",
    ],
    dimensions: baseDimensions(
      [9, 8, 7, 6, 6, 7],
      [
        "The product is the agent loop; nothing else performs the repair",
        "Fully automated up to the customer's merge, but token spend needs active ceilings",
        "The pain is concrete and demoable, though proof requires a real customer repo",
        "Sandbox compute plus long agent loops are genuine COGS; 55–70% before tuning",
        "Verified migration recipes and per-upgrade success telemetry accumulate",
        "Marketplace, EOL calendars as a content hook, and the agency channel",
      ],
    ),
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "No sector regulation; exposure is contractual, over customer source code held in confidence",
        "Open-source licence obligations when a generated patch carries upstream code",
      ],
      dataSensitivity:
        "Clones customer source into an ephemeral sandbox destroyed after the run. Nothing is retained beyond the diff and logs the customer can already see. No training on customer code.",
      entityAndInsurance:
        "LLC plus tech E&O before the first paid migration job. Contract caps liability at fees paid, disclaims warranty on generated code, and names the customer's review and CI as the acceptance gate.",
      mitigations: [
        "PR-only: no merge rights, no default-branch write access, no deploy or production credentials",
        "Sandbox egress limited to the package registry; customer secrets are never mounted",
        "Refuse repos whose tests do not run — without a verification oracle the patch is unverifiable, and that is the entire liability",
        "Per-job token and wall-clock ceilings so a pathological repo cannot run up an unbounded bill",
      ],
      ethicalGuardrails: [
        "Never pin around or silently downgrade a vulnerable dependency to make CI pass",
        "Disclose in the PR body that the patch is model-generated, so reviewers know what they are reading",
        "Flag copied upstream code and its licence in the diff rather than laundering it",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 12, realistic: 18, pessimistic: 28 },
        customerCount: { count: 60, unit: "teams @ $139/mo avg plus job revenue" },
        pricing: {
          model: "Per-repo subscription ($29–$99/repo/mo) plus fixed-price migration jobs ($300–$1,500)",
          averageRevenue: 139,
          currency: "USD",
        },
        keyMilestones: [
          "Green-CI-or-no-PR guarantee across Node/TypeScript, Python, and Ruby",
          "Published success rate per upgrade type, including the failures",
          "10 design partners sourced from EOL-runtime outreach",
          "Fixed-price migration jobs as the cash-flow bridge to subscriptions",
          "Marketplace listing",
        ],
        automationStack: [
          "Ephemeral container runners with the repo's CI as the correctness oracle",
          "Token and time budgets enforced per job",
          "Stripe subscriptions plus one-time invoices",
        ],
        risks: [
          "Cost per successful PR can exceed price on messy repos — the core unit-economics risk",
          "GitHub, Copilot, or Renovate ships equivalent autofix",
          "One bad merged patch becomes the reference anecdote against the product",
          "Teams with the worst upgrade debt often have no tests, and are unservable by design",
        ],
        verdict: "strong",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 42, pessimistic: 60 },
        customerCount: { count: 340, unit: "teams @ $245/mo avg" },
        pricing: {
          model: "Per-repo tiers, org-wide upgrade programs, priority job queue",
          averageRevenue: 245,
          currency: "USD",
        },
        keyMilestones: [
          "Six ecosystems covered",
          "Org-level fleet view: which repos are on EOL runtimes and what the fix costs",
          "Monorepo and private-registry support",
          "SOC2 Type I to clear security review at larger customers",
        ],
        automationStack: [
          "Fleet scheduler that sequences upgrades across a repo estate",
          "Cost-per-job telemetry driving automated pricing tiers",
        ],
        risks: [
          "Enterprise wants self-hosted runners, which is a support burden for a solo operator",
          "Model price changes move COGS directly",
        ],
        verdict: "viable",
      },
    ],
    competitors: [
      "Renovate / Dependabot",
      "GitHub Copilot autofix",
      "Moderne / OpenRewrite",
      "Sourcegraph Batch Changes",
      "codemod.com",
    ],
    moat: "Verified migration recipes plus per-(framework, version) success telemetry — the pass/fail record that says which upgrades can be sold at a fixed price.",
    firstExperiment:
      "Offer 20 teams on EOL runtimes a $500 fixed-price migration, green CI or no charge. Measure true agent cost per completed migration against the price.",
    rank100k: 5,
    rank1m: 6,
  },
  {
    id: "11",
    slug: "mcp-supply-chain-scanner",
    name: "MCP Supply-Chain Scanner",
    tagline: "Know what the agent tools installed across your org can actually do",
    category: "devtools",
    summary:
      "Continuous review of the MCP servers a company's developers and agents have installed: which tools each exposes, what scopes and network reach it takes, what changed in the last release, and where its instruction text could steer an agent. Org allowlist plus change alerting, sold per developer seat.",
    problem:
      "There are more than ten thousand public MCP servers and enterprises install them faster than anyone reviews them. The ecosystem's own stated gaps are trust at the server boundary and visibility into what agents can do. A server can rewrite its tool descriptions in a patch release and quietly redirect an agent — a supply-chain surface with no scanner pointed at it.",
    solution:
      "Point it at a config or registry. It inventories servers, diffs tool schemas and instruction text version over version, flags injection-shaped instructions, over-broad scopes, and unpinned installs, and enforces an org allowlist in CI. Findings are advisory and come with reproduction steps.",
    targetCustomer:
      "20–500 person engineering orgs running agents in production, platform and security teams, and AI-forward consultancies",
    aiLeverage: [
      "Classifies tool descriptions and instruction text for injection-shaped content",
      "Summarizes behavioral diffs between versions in language a reviewer can act on",
      "Correlates declared scopes against what the server's code actually calls",
      "Derives org policy rules from the team's own approval history",
    ],
    zeroEmployeeOps: [
      "Open-source CLI plus hosted dashboard, both self-serve",
      "Scheduled scans run unattended; findings open issues in the customer's tracker",
      "Per-seat Stripe billing with an org minimum",
      "Docs agent handles integration questions",
    ],
    dimensions: baseDimensions(
      [7, 9, 6, 9, 5, 6],
      [
        "Classification and diff summarization are AI; the inventory and diff engine are deterministic",
        "Static analysis service with no human in the loop",
        "Security budget exists but the category is young — some buyers do not yet know they need it",
        "Static analysis is cheap to run; ~90% gross margin",
        "New category, absorbable by registries themselves or by existing SCA vendors",
        "Open-source CLI as the wedge; no marketplace with billing exists yet for this surface",
      ],
    ),
    riskProfile: {
      liabilityTier: "contained",
      regulatoryExposure: [
        "None directly; security findings follow coordinated-disclosure norms",
        "Care required when publishing findings that name a third-party server or maintainer",
      ],
      dataSensitivity:
        "Reads MCP configuration and public server source. Never proxies agent traffic, so it never sees customer prompts or tool payloads — deliberately, because that is where the sensitive data lives.",
      entityAndInsurance:
        "LLC plus tech E&O. Terms state findings are advisory, not a security guarantee. No penetration testing of third-party systems, so no computer-misuse authorization question ever arises.",
      mitigations: [
        "Static analysis only — never exercise a third-party server against its owner's systems",
        "Stay outside the data path: no traffic proxying, no prompt retention",
        "Coordinated disclosure — notify a maintainer before a finding about their server becomes public",
        "Publish the rule logic so customers audit a finding instead of trusting a score",
      ],
      ethicalGuardrails: [
        "No exploit code published against a live third-party server",
        "No 'N servers are dangerous' fear marketing built on uncounted claims",
        "Findings about open-source maintainers are written as bug reports, not accusations",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 26 },
        customerCount: { count: 55, unit: "orgs @ $152/mo avg" },
        pricing: {
          model: "Per-seat ($8–$15/developer/mo) with an org minimum",
          averageRevenue: 152,
          currency: "USD",
        },
        keyMilestones: [
          "Open-source CLI with the version-diff engine as the distribution wedge",
          "Hosted org dashboard with scheduled scans and change alerts",
          "Published review of the 200 most-installed public servers as the credibility artifact",
          "10 design partners from agent-heavy startups",
          "SOC2 Type I when the first security-team deal requires it",
        ],
        automationStack: [
          "Registry watchers plus scheduled scanners",
          "CI action for allowlist enforcement",
          "Stripe per-seat billing; docs agent for support",
        ],
        risks: [
          "Registries or model vendors ship signing and verification, shrinking the problem",
          "Transport changes on the MCP roadmap churn the analysis surface",
          "Buyers treat it as a feature their SCA vendor should ship",
          "The category may stay pre-budget for another year",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 42, pessimistic: 66 },
        customerCount: { count: 330, unit: "orgs @ $253/mo avg" },
        pricing: {
          model: "Per-seat tiers plus a policy-enforcement add-on",
          averageRevenue: 253,
          currency: "USD",
        },
        keyMilestones: [
          "Policy-as-code enforcement in CI",
          "Vetted server catalog with version attestations",
          "Integrations with the major agent platforms",
          "Mapping findings to AI-governance questionnaire items",
        ],
        automationStack: [
          "Continuous corpus scanning of the public registry",
          "Attestation store with per-version signatures",
        ],
        risks: [
          "Consolidation into platform vendors erases the standalone market",
          "Standard churn forces repeated rewrites of the analysis engine",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Snyk / Socket and other SCA incumbents",
      "Registry verification programs",
      "Invariant Labs and agent-security startups",
      "Platform teams' own review scripts",
    ],
    moat: "A longitudinal record of how public servers' tool surfaces changed over time — a corpus nobody can backfill after the fact.",
    firstExperiment:
      "Publish a review of the 200 most-installed public MCP servers with the diff engine's raw output. Count inbound requests to scan a private registry.",
    rank100k: 11,
    rank1m: 10,
  },
  {
    id: "12",
    slug: "chatbot-disclosure-monitor",
    name: "Chatbot Disclosure Monitor",
    tagline: "Continuous proof your assistant discloses, escalates, and logs what the law now requires",
    category: "vertical-saas",
    summary:
      "Scheduled adversarial testing of a company's own customer-facing assistant against the disclosure and safety rules that took effect across US states through 2026, producing a dated evidence archive and an alert when the bot's behavior or the statute changes. Sold per bot per month, and to the agencies that deploy bots for many clients.",
    problem:
      "By April 2026 twenty-seven states were legislating chatbot disclosure; several enacted laws carry per-violation statutory damages and at least one creates a private right of action, so exposure is aggregate rather than a single fine. Assistants deployed in 2023–2025 were built with none of this in mind, and nobody re-tests a bot after a prompt change.",
    solution:
      "Probe conversations run against the customer's live bot on a schedule: does it disclose it is not human at session start and when asked, does the disclosure hold under pressure, does it follow the escalation and crisis-referral path the applicable state requires, is the exchange logged. Every run writes a timestamped evidence record, with a diff when behavior drifts.",
    targetCustomer:
      "Mid-market companies running consumer-facing assistants, and the agencies and platforms that deploy assistants on their behalf",
    aiLeverage: [
      "Adversarial probe generation — an agent that tries to make the bot deny being a bot",
      "Grades transcripts against a versioned rule matrix",
      "Turns statutory text into machine-checkable probes for review",
      "Writes plain-language remediation notes for the team that owns the bot",
    ],
    zeroEmployeeOps: [
      "Probes run on a schedule with no operator present",
      "Statute-feed monitoring proposes rule updates; a contracted attorney approves before release",
      "Self-serve onboarding by pointing at a widget or endpoint the customer owns",
      "Per-bot Stripe billing",
    ],
    dimensions: baseDimensions(
      [8, 8, 7, 8, 6, 6],
      [
        "Adversarial probing and transcript grading are the product itself",
        "Unattended except for legal review of rule changes — the one standing human task",
        "Live statutory deadlines with named damages create urgency; the legal buyer moves slower",
        "Probe conversations are cheap; the cost line is contracted legal review, not compute",
        "A maintained rule library against a moving statutory target, plus the customer's evidence history",
        "Agency and platform channel plus legal-ops audiences; no marketplace to ride",
      ],
    ),
    riskProfile: {
      liabilityTier: "elevated",
      regulatoryExposure: [
        "State chatbot and companion-AI statutes define what is tested — the duty is the customer's, not ours",
        "Unauthorized practice of law if the product is framed as a legal opinion rather than testing",
        "EU AI Act Article 50 transparency duties for EU-facing customers",
      ],
      dataSensitivity:
        "Runs synthetic conversations against the customer's bot. Real end-user conversations are never ingested, so the archive contains only our own probe traffic and no end-user personal data.",
      entityAndInsurance:
        "LLC plus tech E&O sized against statutory-damages exposure before the first paying customer — the one idea here where insurance precedes revenue. Terms cap liability at fees paid and disclaim legal advice. A licensed attorney reviews rule content, a real recurring cost of roughly $1–2k per quarter.",
      mitigations: [
        "Sell testing and evidence, never a compliance opinion — reflected in the product's substance, not just a footer",
        "Version and date every rule so a customer can see which standard a past run was graded against",
        "Probe only bots the customer owns, with written authorization captured at onboarding",
        "Never ingest end-user conversations, so a breach here exposes nothing about the customer's users",
      ],
      ethicalGuardrails: [
        "Crisis-referral paths are exercised only with the customer's explicit informed consent and a test channel — never by simulating a person in crisis against a live production bot unannounced",
        "Cite the statute and its actual damages provision; no invented penalty math in sales material",
        "Decline customers whose bot is designed to pass as human — preventing that is the point of the product",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 9, realistic: 15, pessimistic: 24 },
        customerCount: { count: 42, unit: "bots @ $198/mo avg" },
        pricing: {
          model: "Per-bot subscription ($99–$499/bot/mo by traffic and jurisdiction count)",
          averageRevenue: 198,
          currency: "USD",
        },
        keyMilestones: [
          "Probe suites for the enacted state regimes plus EU Article 50",
          "Evidence archive with immutable timestamps and per-run rule versions",
          "Attorney-reviewed rule library v1",
          "10 pilots sourced through agencies that deploy bots",
          "Statute-change alerting as the retention hook",
        ],
        automationStack: [
          "Scheduled probe runners and transcript grader",
          "Statute feed monitoring with contracted legal review before release",
          "Write-once evidence store; Stripe per-bot billing",
        ],
        risks: [
          "A miss on our side sits next to the customer's statutory damages — E&O is not optional",
          "Statutes keep moving; rule maintenance is permanent work that scales with jurisdictions",
          "Buyers may decide this is their bot vendor's job",
          "Federal preemption could flatten the state patchwork and the urgency with it",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 30, realistic: 44, pessimistic: 66 },
        customerCount: { count: 210, unit: "accounts @ $397/mo avg" },
        pricing: {
          model: "Multi-bot enterprise tiers plus platform OEM licensing",
          averageRevenue: 397,
          currency: "USD",
        },
        keyMilestones: [
          "OEM with two chatbot platforms so their customers inherit the checks",
          "Per-jurisdiction reporting across all enacted regimes",
          "EU and UK coverage",
          "Audit-ready export for third-party assurance",
        ],
        automationStack: [
          "Multi-tenant probe scheduling with per-jurisdiction matrices",
          "Rule library versioning with published diffs",
        ],
        risks: [
          "Chatbot platforms bundle disclosure checks natively",
          "Legal-content maintenance scales with jurisdictions rather than revenue",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Native compliance features in chatbot platforms",
      "GRC suites extending into AI governance",
      "Law-firm advisory engagements",
      "The customer's own manual QA",
    ],
    moat: "A dated, per-jurisdiction evidence trail that cannot be reconstructed after the fact, backed by attorney-reviewed rule versions.",
    firstExperiment:
      "Run the probe suite against 50 public consumer assistants, report each result privately to its operator, and measure how many ask for continuous monitoring. Publish nothing.",
    rank100k: 10,
    rank1m: 9,
  },
  {
    id: "13",
    slug: "api-to-mcp-gateway",
    name: "API-to-MCP Gateway",
    tagline: "An agent-ready, metered MCP surface for your existing API in a day",
    category: "api-infrastructure",
    summary:
      "Hosted service that turns an existing REST or GraphQL API into an authenticated, rate-limited, metered MCP server, with per-tool analytics and usage records the API owner can bill against. Sold to API-first companies that want agent distribution without operating a new protocol surface.",
    problem:
      "MCP became the default integration layer for agents, yet under 5% of servers are monetized and most API companies either have no MCP surface or a hand-rolled one with no auth story, no metering, and no view of what agents actually called. Doing it properly means scoped auth, transport work still in flux, and per-tool observability — weeks of work outside the roadmap.",
    solution:
      "Point it at an OpenAPI or GraphQL schema. It generates a tool surface written for agent consumption, hosts it, enforces scoped tokens and per-tool limits, and emits usage events the customer can meter or bill on. Their auth model stays theirs: credentials pass through and are never stored.",
    targetCustomer:
      "Seed to Series B API-first SaaS and developer-tools companies, plus platform teams exposing internal services to their own agents",
    aiLeverage: [
      "Writes and continuously tunes the tool descriptions that decide whether an agent calls correctly",
      "Collapses two hundred endpoints into a coherent twenty-tool surface",
      "Detects tool-call failure patterns and proposes schema fixes",
      "Replays real call traces as regression tests when the API changes",
    ],
    zeroEmployeeOps: [
      "Self-serve onboarding from a schema URL",
      "Usage-based Stripe billing",
      "Serverless runtime with synthetic uptime probes and automated incident comms",
      "Support agent trained on the generated documentation",
    ],
    dimensions: baseDimensions(
      [6, 8, 7, 6, 5, 7],
      [
        "The durable AI work is tool-surface design and failure analysis; the gateway is plumbing",
        "Self-serve, but a data-path service means real on-call — reduced by serverless, not removed",
        "Current, concrete pain with a developer buyer who adopts quickly at low price points",
        "Proxying traffic is genuine COGS; 60–75% until volume tiers",
        "Gateway incumbents are adding MCP natively — the principal risk to the whole idea",
        "Open-source generator as the wedge, plus registry and developer channels",
      ],
    ),
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "Data-processor role under GDPR/CCPA for traffic in transit — the reason payload retention is off by default",
        "No sector-specific regulation of its own",
      ],
      dataSensitivity:
        "Sits in the request path. Payloads are proxied and not retained by default; only metadata is stored — tool name, latency, status, token count. End-user credentials pass through to the customer's API and are never stored.",
      entityAndInsurance:
        "LLC, tech E&O, and cyber cover before the first production customer, because an outage or leak here is the customer's outage. Published DPA and sub-processor list from day one.",
      mitigations: [
        "Payload-blind by default, with opt-in capture the customer controls per tool",
        "Pass-through auth: never mint or hold credentials for the customer's end users",
        "Publish a status page and commit to an SLA a solo operator can actually meet",
        "Ship a self-host escape hatch — the generated server is exportable, so no customer is trapped by our uptime",
      ],
      ethicalGuardrails: [
        "No lock-in by omission: export on request, documented in the terms",
        "Never read customer payloads for product improvement",
        "Do not resell aggregate traffic data as market intelligence",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 10, realistic: 16, pessimistic: 26 },
        customerCount: { count: 45, unit: "APIs @ $185/mo avg" },
        pricing: {
          model: "Usage-based ($49 base plus per-million tool calls)",
          averageRevenue: 185,
          currency: "USD",
        },
        keyMilestones: [
          "Open-source OpenAPI-to-MCP generator as the wedge",
          "Hosted gateway with scoped tokens and metering",
          "10 design-partner APIs live in production",
          "Listings in the MCP registries",
          "Stateless transport support ahead of the ecosystem migration",
        ],
        automationStack: [
          "Serverless edge runtime with schema watchers that regenerate on API change",
          "Stripe metered billing",
          "Synthetic probes and automated incident communication",
        ],
        risks: [
          "Gateway incumbents ship MCP natively and bundle it at zero marginal price",
          "Being in the data path means real on-call for a solo operator",
          "Transport churn forces re-platforming mid-flight",
          "The open-source wedge can cannibalize the hosted product",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 32, realistic: 48, pessimistic: 72 },
        customerCount: { count: 260, unit: "APIs @ $321/mo avg" },
        pricing: {
          model: "Volume tiers plus a private-deployment licence",
          averageRevenue: 321,
          currency: "USD",
        },
        keyMilestones: [
          "Private/VPC deployment licence, which raises price and removes our data-path risk",
          "Agent-side analytics for API product managers",
          "Billing integration so customers can monetize their own tools",
          "Multi-region routing",
        ],
        automationStack: [
          "Per-tenant isolation with automated region failover",
          "Licence-key issuance and telemetry for self-hosted deployments",
        ],
        risks: [
          "Cloud vendors consolidate the category",
          "Price compression as MCP hosting commoditizes",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "Cloudflare, Kong, and Zuplo MCP features",
      "SDK generators moving into MCP (Speakeasy, Stainless)",
      "Composio and similar integration layers",
      "Hand-rolled internal servers",
    ],
    moat: "Cross-customer telemetry on which tool-surface shapes agents actually call successfully — a design dataset no single API owner can assemble.",
    firstExperiment:
      "Publish the open-source generator and measure how many teams that generate a server ask for hosting, auth, and metering within 30 days.",
    rank100k: 12,
    rank1m: 14,
  },
  {
    id: "14",
    slug: "public-record-signal-feed",
    name: "Public-Record Signal Feed",
    tagline: "Official permit, licence, and registration filings as one clean daily API",
    category: "data-product",
    summary:
      "A normalized, deduplicated feed of business-entity signals — building permits, trade licences, food and beverage registrations, new-entity filings — ingested from official open-data portals under their published terms and sold as an API, webhook, and daily digest to suppliers, trade services, and vertical SaaS vendors that need to know when a business enters a buying window.",
    problem:
      "The data is public and nearly unusable: hundreds of municipal portals, each with its own schema, refresh cadence, and address format. Buyers either pay enterprise lead-data prices for stale coverage or have someone pulling CSVs by hand. Vertical SaaS vendors want it as an enrichment feed and have no supplier at their price point.",
    solution:
      "Ingest official portals, resolve entities and addresses, deduplicate across sources, classify filing descriptions into buying signals, and publish as an API, webhook, and digest — with coverage and freshness stated per jurisdiction, gaps included.",
    targetCustomer:
      "Building-material and equipment suppliers, trade-service franchises, commercial insurance distribution teams, and vertical SaaS vendors reselling enrichment",
    aiLeverage: [
      "Entity resolution and address normalization across inconsistent sources",
      "Classification of free-text filing descriptions into signal types",
      "Automated repair when a portal changes schema — the maintenance cost that kills these products",
      "Anomaly detection that catches a silent coverage gap before a customer does",
    ],
    zeroEmployeeOps: [
      "Ingestion runs unattended with self-healing parsers",
      "Coverage and freshness dashboards published rather than reported by a human",
      "Self-serve API keys with Stripe metered billing",
      "Docs agent handles integration support",
    ],
    dimensions: baseDimensions(
      [6, 8, 6, 9, 6, 5],
      [
        "AI does entity resolution, classification, and parser repair; the value is coverage and pipeline",
        "The pipeline runs itself; portal drift is the recurring chore and is mostly absorbed by AI repair",
        "Nothing is sellable until one metro has credible coverage — two to three months before the first invoice",
        "Storage and compute only; ~90% once ingestion exists",
        "History accumulates: a competitor can get today's filings but not three years of normalized history",
        "Outbound to a non-technical buyer plus API resale partners; the weakest dimension here by far",
      ],
    ),
    riskProfile: {
      liabilityTier: "moderate",
      regulatoryExposure: [
        "Source-portal terms of use govern reuse; only portals with permissive published terms are ingested",
        "GDPR/CCPA largely designed out by staying at business-entity level",
        "State data-broker registration statutes attach to personal-data brokers — staying business-only keeps this out of scope, a position to re-verify with counsel before adding any person-level field",
      ],
      dataSensitivity:
        "Official business-entity records only. Sole-proprietor filings can carry a person's name and home address, so those fields are suppressed rather than published — the one place this dataset could become personal data.",
      entityAndInsurance:
        "LLC plus tech E&O. A written record of each source's licence terms and ingestion date, and a takedown-and-correction process live before launch, because a fast correction is the cheapest possible response to a data complaint.",
      mitigations: [
        "Official open-data portals and licensed sources only — never scrape around a paywall, a robots directive, or a terms restriction",
        "Business-entity fields only; suppress person-level fields even where the source publishes them",
        "Per-record provenance (source, URL, retrieval date) so any disputed record is traceable and correctable",
        "Publish coverage and freshness per jurisdiction including gaps — overstated coverage is the fraud risk in this category",
      ],
      ethicalGuardrails: [
        "No consumer lead lists, no phone or email appends for individuals, and no resale into robocall or SMS blast channels",
        "Honour correction and opt-out requests even where no statute compels it",
        "Decline buyers whose stated use is harassment-adjacent, such as doorstep debt collection",
      ],
    },
    plans: [
      {
        milestone: "100k",
        targetArr: 100_000,
        timelineMonths: { optimistic: 8, realistic: 14, pessimistic: 22 },
        customerCount: { count: 30, unit: "accounts @ $278/mo avg" },
        pricing: {
          model: "API subscription by jurisdiction and volume ($99–$999/mo), annual prepay for resellers",
          averageRevenue: 278,
          currency: "USD",
        },
        keyMilestones: [
          "Three metros ingested with published freshness numbers",
          "One defensible signal type first — new commercial build permits — rather than everything",
          "5 design partners inside a single supplier vertical",
          "Webhook and CSV delivery for non-technical buyers",
          "One reseller agreement with a vertical SaaS vendor",
        ],
        automationStack: [
          "Scheduled ingestion workers with schema-drift detection and AI-assisted parser repair",
          "Entity-resolution pipeline with provenance on every record",
          "Publicly published coverage dashboards; Stripe metered billing",
        ],
        risks: [
          "The first metro takes longer than planned and there is nothing to sell until it lands",
          "A source portal changes its terms or goes dark",
          "Incumbent lead-data vendors bundle the same signal for free",
          "Non-technical buyers want a UI, which is effectively a second product",
        ],
        verdict: "viable",
      },
      {
        milestone: "1m",
        targetArr: 1_000_000,
        timelineMonths: { optimistic: 36, realistic: 54, pessimistic: 72 },
        customerCount: { count: 180, unit: "accounts @ $463/mo avg" },
        pricing: {
          model: "Multi-jurisdiction tiers plus reseller and OEM licensing",
          averageRevenue: 463,
          currency: "USD",
        },
        keyMilestones: [
          "25+ metros with published freshness",
          "Historical archive sold as a separate product",
          "OEM into three vertical SaaS platforms",
          "Additional signal types beyond construction permits",
        ],
        automationStack: [
          "Fleet of ingestion workers with per-source health scoring",
          "Automated coverage regression alerts before customers notice",
        ],
        risks: [
          "Coverage expansion is linear work with sub-linear pricing power",
          "OEM buyers negotiate hard at renewal and can become concentration risk",
        ],
        verdict: "stretch",
      },
    ],
    competitors: [
      "ConstructConnect / Dodge",
      "BuildZoom data products",
      "Enterprise lead-data vendors",
      "An analyst pulling CSVs in-house",
    ],
    moat: "Multi-year normalized history with per-record provenance, and coverage published honestly enough that buyers trust the stated gaps.",
    firstExperiment:
      "Ingest one metro's commercial building permits and send a free weekly digest to 100 suppliers there. Measure replies, not opens, before building the API.",
    rank100k: 13,
    rank1m: 13,
  },
];
