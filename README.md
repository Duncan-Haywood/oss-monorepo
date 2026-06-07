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
| Tech Strategy | `TechStrategy.tsx` | Architecture, stack, build phases, key decisions |
| Revenue & Profitability | `RevenueModel.tsx` | 70/30 split, unit economics, margin path |
| Financial Model | `FinancialProjections.tsx` | Interactive calculator with scenario comparison |
| AI Operations | `Operations.tsx` | Capture workflow, cataloging, fulfillment |
| Marketing & Sales | `MarketingSales.tsx` | Dual-sided digital acquisition, channel mix |
| Artist Pitch | `ArtistPitch.tsx` | Supply-side sales narrative |
| Market Research | `MarketResearch.tsx` | TAM/SAM/SOM, audiences, competitive landscape |
| GTM Strategy | `GTMStrategy.tsx` | 4-phase go-to-market plan |
| Platform Demo | `PlatformDemo.tsx` | Embedded storefront + artist portal preview |

## Live Demo Pages

| Route | Description |
|-------|-------------|
| `/storefront` | Consumer e-commerce storefront (demand side) |
| `/buyer-portal` | Full buyer shop with filters and AI room visualization |
| `/artist-portal` | Artist dashboard with portfolio, payouts, settings |
| `/designer-portal` | B2B trade portal for interior designers (Phase 4 GTM) |
| `/capture` | Mobile capture app with AI processing pipeline demo |
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
│   ├── designer-portal/      # B2B designer portal demo
│   ├── capture/              # Capture app demo
│   └── ops/                  # Outreach console demo
└── components/
    ├── shared/DemoNav.tsx    # Shared demo navigation
    └── *.tsx                 # Business plan section components
```

## Stack

Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Lucide icons.
