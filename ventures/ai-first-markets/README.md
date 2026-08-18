# AI-First Markets

A market-selection and business-idea evaluation platform for solo founders
targeting **$100k ARR** and **$1M ARR** with zero employees.

This combines the original AI-First Markets opportunity map with the business
idea reports formerly maintained in `Duncan-Haywood/projects`.

Built with Next.js 15, TypeScript, Tailwind CSS, and deployable to **Cloudflare Workers** via OpenNext.

## Features

- **AI-first market map** with ripeness signals, market tiers, and winning patterns
- **14 evaluated business ideas** across devtools, vertical SaaS, AI agents, API infrastructure, data products, and content automation
- **7 analytical reports**: executive summary, $100k path, $1M path, automation playbook, scoring methodology, liability & ethics screen, category analysis
- **Scoring framework** across AI leverage, zero-employee ops, time-to-revenue, margin, defensibility, distribution, and liability containment
- **Screening register** of ideas researched and deliberately declined, each with the condition that would reopen it
- **Whitelist-only access** for `duncan.andrew.haywood@gmail.com`
- **Cloudflare deployment** ready with OpenNext adapter

## Quick start (local)

```bash
npm install
cp .env.example .env.local
# Set AUTH_SECRET and optionally GOOGLE_CLIENT_ID/SECRET for OAuth
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You'll be redirected to `/login`.

### Local auth options

1. **Google OAuth** — Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`. Only the whitelisted email can sign in.
2. **Dev bypass** — For local testing without OAuth, temporarily comment out the middleware redirect (not recommended for production).

## Deploy to Cloudflare

See **[cloudflare/DEPLOY.md](cloudflare/DEPLOY.md)** for full setup (Workers Builds, Wrangler, Access whitelist, GitHub Actions).

### Quick deploy

```bash
npm install
npx wrangler login
npx wrangler secret put AUTH_SECRET
npm run deploy
```

### After deploy — enable Access whitelist

1. **Workers & Pages → ai-first-markets → Settings → Domains & Routes**
2. Click **Enable Cloudflare Access** on `workers.dev`
3. Restrict policy to `duncan.andrew.haywood@gmail.com`
4. Add `TEAM_DOMAIN` and `POLICY_AUD` env vars from the Access modal

### MCP verification

After deployment, use the Cloudflare MCP in Cursor:

- `Cloudflare-bindings` → `workers_list` — confirm worker exists
- `Cloudflare-builds` → `workers_builds_list_builds` — check CI builds

## Project structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── reports/[slug]/     # Analytical reports
│   ├── ideas/[slug]/       # Individual idea deep-dives
│   ├── login/              # Auth page
│   └── api/auth/           # OAuth + session endpoints
├── components/             # UI components (TSX)
├── data/                   # Business ideas + report metadata (TS)
└── lib/                    # Auth, evaluation, types, utils (TS)
```

## Reports

| Report | Description |
|--------|-------------|
| Executive Summary | Portfolio overview and top recommendations |
| Path to $100k ARR | Ranked ideas for first revenue milestone |
| Path to $1M ARR | Scaling analysis and platform distribution patterns |
| AI + Zero-Employee Playbook | Operational stack for solo AI-first SaaS |
| Scoring Methodology | How ideas are evaluated |
| Liability & Ethics Screen | Residual exposure per idea, standing rules, and declined ideas |
| Category Analysis | Comparison across idea categories |

## Top recommendations

**$100k ARR (strong fit):**
1. AI PR Review Agent
2. Accessibility Regression Gate
3. AI Receptionist for Trades — strongest economics, heaviest legal exposure; do not start without its consent and emergency-handling controls in place

**$1M ARR (viable+):**
1. AI QA for E-commerce
2. AI PR Review Agent
3. Accessibility Regression Gate

Ranks account for liability containment, which is why several ideas with
attractive margins sit lower than their revenue case alone would suggest. The
liability screen report explains each one.

## License

Private — authorized access only.
