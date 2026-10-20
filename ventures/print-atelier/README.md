# Print Atelier (Business Plan)

Interactive business plan and platform demo for **Print Atelier** — an AI-first, software-driven marketplace that digitizes physical art, sells prints via POD, and pays artists 30% of net profit.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/print-atelier/

Artists preparing a print master can run a private, no-upload [print-file preflight](https://duncan-haywood.github.io/monorepo-projects/print-atelier/), compare up to five exports at a chosen print size, and download a dated technical record before ordering a paid proof.

**No warranty.** This tool is provided free and as-is, without warranty of any kind, express or implied. It is not printing, production, legal, or professional advice, and it does not replace a qualified printer or color manager. **You are responsible for reviewing and verifying its output before relying on it**, and for meeting any obligation it helps you prepare for. To the maximum extent permitted by law, the authors accept no liability for any loss or damage arising from its use.

**Privacy.** The preflight reads files in your browser. Artwork is never uploaded. We count anonymous events (page viewed, check completed, files compared, record exported) — never filenames, images, IPs, or people. Honour Do Not Track / Global Privacy Control, or use the on-page opt-out.

## Strategy Pillars

- **Software-first:** Every operational bottleneck solved with code before headcount
- **AI-first:** Capture pipeline, cataloging, marketing copy, and outreach automation
- **Digital-first:** Automated artist prospecting, personalized outreach, programmatic SEO, dynamic ads
- **Dual-sided growth:** Supply (artists) and demand (buyers) acquired through software channels

## Running the App

```bash
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) for the business plan dashboard.

## Business Plan Sections

| Tab | Component | Content |
|-----|-----------|---------|
| Business Overview | `BusinessOverview.tsx` | Visual product map, launch scores, portal links |
| Strategy & Vision | `Strategy.tsx` | Problem, AI-first solution, positioning, dual-sided tracks |
| Sales & Outreach | `SalesOutreach.tsx` | Digital-first dual-sided outreach, channel mix |
| Tech Strategy | `TechStrategy.tsx` | Architecture, stack, build phases, infra costs |
| Revenue & Profitability | `RevenueModel.tsx` | 70/30 split, interactive unit economics, monthly P&L |
| Financial Model | `FinancialProjections.tsx` | Scenario calculator with artist/ad spend inputs |
| AI Operations | `Operations.tsx` | Capture workflow, cataloging, fulfillment |
| Marketing & Sales | `MarketingSales.tsx` | Dual-sided digital acquisition, retention |
| Artist Pitch | `ArtistPitch.tsx` | Supply-side sales narrative |
| Market Research | `MarketResearch.tsx` | TAM/SAM/SOM, SWOT, audiences, competitors |
| GTM Strategy | `GTMStrategy.tsx` | 4-phase plan with KPIs and launch calendar |
| Platform Demo | `PlatformDemo.tsx` | Embedded storefront, artist portal, capture preview |

## Live Demo Pages

| Route | Description |
|-------|-------------|
| `/docs` | Visual docs hub — investor, battlecards, SEO lab, catalog AI, payout sim, sitemap |
| `/investor` | Condensed owner/investor dashboard — unit economics, pipeline, partner readiness |
| `/battlecards` | Competitive positioning vs Society6, Redbubble, Saatchi, Artfinder |
| `/seo-lab` | Programmatic SEO page generator with publish blockers |
| `/prints/[slug]` | Static long-tail print landing pages (consent-gated indexing) |
| `/catalog-intelligence` | AI metadata confidence dashboard (tags, SEO, mockups, proof) |
| `/payout-simulator` | Stripe Connect payout waterfall, transfer timing, and webhook env status |
| `/api/stripe/webhook` | Stripe Connect webhook endpoint (configure via `.env.example`) |
| `/storefront` | Consumer e-commerce storefront (demand side) |
| `/print-file-preflight` | Private JPEG/PNG print-master check, size compare for up to five files, and a dated downloadable record |
| `/buyer-portal` | Full buyer shop with filters and AI room visualization |
| `/artist-portal` | Artist dashboard with portfolio, payouts, settings |
| `/b2b-portal` | B2B trade portal for interior designers |
| `/designer-portal` | Designer portal (Phase 4 GTM) |
| `/capture` | Mobile capture app with AI processing pipeline |
| `/capture-demo` | Interactive AI capture pipeline demo |
| `/sales-portal` | Sales outreach command center |
| `/marketing-portal` | Marketing automation hub |
| `/ops` | Internal outreach CRM for artist acquisition |
| `/admin-portal` | Operations command center for AI pipeline, infrastructure, and payout promise guardrails |
| `/sitemap.xml` | Consent-gated sitemap (publishable print pages + market routes) |
| `/robots.txt` | Crawler rules referencing sitemap; ops routes disallowed |

All demo pages share navigation via `DemoNav` and link back to the business plan.

Optional: set `NEXT_PUBLIC_SITE_URL` for production sitemap/robots absolute URLs (defaults to `https://printatelier.com`).

## Architecture

```
src/
├── app/
│   ├── page.tsx              # Main business plan dashboard
│   ├── artist-portal/        # Full artist portal demo
│   ├── storefront/           # Full storefront demo
│   ├── buyer-portal/         # Buyer shop demo
│   ├── b2b-portal/           # B2B designer trade portal
│   ├── designer-portal/      # Designer portal demo
│   ├── capture/              # Capture app demo
│   ├── capture-demo/         # Interactive capture pipeline
│   ├── sales-portal/         # Sales outreach hub
│   ├── marketing-portal/     # Marketing automation hub
│   ├── admin-portal/         # Admin operations console
│   └── ops/                  # Outreach console demo
└── components/
    ├── shared/DemoNav.tsx    # Shared demo navigation
    └── *.tsx                 # Business plan section components
```

## Stack

Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide icons.

## Autonomous orchestrator

**[Cursor Automation](https://cursor.com/automations)** runs **hourly** for the full business + product dev cycle (see [ORCHESTRATOR.md](ORCHESTRATOR.md)).

| Component | Location |
|-----------|----------|
| Agent prompt | `.cursor/automations/print-atelier-orchestrator.md` |
| Dashboard setup | `.cursor/automations/README.md` |
| Setup guide | [docs/AUTOMATION_SETUP.md](docs/AUTOMATION_SETUP.md) |

**One-time setup:** [cursor.com/automations](https://cursor.com/automations) → scheduled `0 * * * *` → attach this repo → paste the prompt file → enable Open pull request.
