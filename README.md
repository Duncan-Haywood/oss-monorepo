# Listing Lens — Real Estate Agent Photo App

Listing Lens is an AI-first iPhone real estate photography concept: pro-level listing media in 30 minutes, directly from an agent's phone. The product focuses on guided capture, instant AI enhancement, optional cloud polish, MLS-ready delivery, lightweight 3D/video outputs, and agent branding.

**Status:** Concept / market validation

## Thesis

The strongest wedge is mid-market real estate agents who already shoot some of their own listings and lose clicks on mediocre Zillow photos. Airbnb and short-term-rental hosts are a valid secondary market, but they are more episodic unless they manage multiple properties. Listing Lens should lead with agents, expand into brokerage marketing teams, and use host packs as a product-led funnel rather than the core subscription business.

## Repository structure

```text
real-estate-agent-photo-app/
├── README.md
├── STRATEGY.md
├── .gitignore
├── docs/
│   └── REPLICATION_PROMPT.md
├── docs-site/
│   ├── content/
│   ├── infra/access-policy.json
│   ├── scripts/setup-cloudflare-access.sh
│   └── wrangler.toml
├── process/
│   ├── prompt_process.tsx      # start here — agent playbook + live dashboard
│   ├── roadmap.ts               # phases/tasks with status + owner
│   ├── decisions-log.ts         # append-only business decisions
│   ├── progress-log.ts          # append-only per-session log
│   ├── interview-script.ts      # Phase 1 problem-interview script + rubric
│   ├── capture-checklist.ts     # Phase 2 concierge-MVP shoot checklist
│   ├── pricing-one-pager.tsx    # $19/listing concierge offer
│   └── outreach-templates.ts    # manual outreach copy + booking intake
├── pipeline/
│   ├── package.json
│   └── src/
│       ├── enhance.ts           # batch photo enhancement (sharp)
│       ├── coverage.ts          # checks output vs. capture-checklist.ts
│       ├── cli.ts                # npm run enhance -- --in --out --listing
│       └── enhance.test.ts      # npm test — synthetic-image self-test
├── scripts/
│   └── push-to-github.sh
└── research/
    ├── package.json
    ├── tsconfig.json
    ├── next.config.js
    ├── postcss.config.js
    ├── tailwind.config.ts
    ├── next-env.d.ts
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   ├── page.tsx
        │   └── globals.css
        ├── components/
        │   ├── Hero.tsx
        │   ├── AudienceComparison.tsx
        │   ├── MarketAnalysis.tsx
        │   ├── BusinessPlan.tsx
        │   └── ui.tsx
        └── lib/
            └── data.ts
```

## Process

Multiple agents work this repo independently. `process/prompt_process.tsx`
is the shared playbook and the source of truth for what's done, what's
blocked on a human, and what to do next — see `AGENTS.md` for the read/write
convention. It's also rendered live at `/process/` on the private docs site.

## Docs site (private)

The documentation site is a **Next.js** app in `docs-site/`. It deploys to **Cloudflare Pages** and is protected by **Cloudflare Access** with a single-email allowlist (`duncan.andrew.haywood@gmail.com`).

**Live:** https://listing-lens-docs.pages.dev

```bash
cd docs-site
npm install
npm run dev
```

Build and deploy:

```bash
cd docs-site
npm run build          # static export → docs-site/out/
npm run pages:deploy   # requires CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

After deploy, apply Access:

```bash
export DOCS_HOSTNAME=listing-lens-docs.pages.dev
./docs-site/scripts/setup-cloudflare-access.sh
```

See `docs-site/content/deployment.md` for full setup details.

## Enhancement pipeline (concierge MVP)

`pipeline/` is the automated "Enhance" step for concierge deliveries: a
local CLI that batch-processes a folder of raw shoot photos into resized,
contrast/white-balance-normalized, sharpened, MLS-ready JPEGs, and checks
the output count against `process/capture-checklist.ts`.

```bash
cd pipeline
npm install
npm test    # synthetic-image self-test, no real listing photos needed
npm run enhance -- --in ./raw-photos --out ./delivery --listing "123 Main St"
```

## Research report commands

```bash
cd research
npm install
npm run dev
```

Build the static export with:

```bash
cd research
npm run build
```

The static export is generated in `research/out/`.

## Verdict

| Dimension | Recommendation |
| --- | --- |
| Market realism | Realistic idea with a crowded but fragmented market |
| Primary wedge | Mid-market agents and brokerage marketing assistants |
| Pricing | $49-99/mo agent subscription or $8-15/listing validation pricing |
| Next step | Concierge MVP with 15-25 mid-volume agents in one metro |

**Verdict:** PURSUE — agent-first wedge (confidence: medium-high).

## Links

- Repository: https://github.com/Duncan-Haywood/real-estate-agent-photo-app

## License

Private / proprietary.
