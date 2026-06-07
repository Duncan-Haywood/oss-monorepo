# Print Atelier (Business Plan)

Interactive business plan and platform demo for **Print Atelier** — an AI-first, software-driven marketplace that digitizes physical art, sells prints via POD, and pays artists 30% of net profit.

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
| `/storefront` | Consumer e-commerce storefront (demand side) |
| `/buyer-portal` | Full buyer shop with filters and AI room visualization |
| `/artist-portal` | Artist dashboard with portfolio, payouts, settings |
| `/b2b-portal` | B2B trade portal for interior designers |
| `/designer-portal` | Designer portal (Phase 4 GTM) |
| `/capture` | Mobile capture app with AI processing pipeline |
| `/capture-demo` | Interactive AI capture pipeline demo |
| `/sales-portal` | Sales outreach command center |
| `/marketing-portal` | Marketing automation hub |
| `/ops` | Internal outreach CRM for artist acquisition |
| `/admin-portal` | Operations command center for AI pipeline and infrastructure |

All demo pages share navigation via `DemoNav` and link back to the business plan.

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
