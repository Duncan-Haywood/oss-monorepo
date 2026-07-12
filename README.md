# Listing Lens — Real Estate Agent Photo App

Listing Lens is an AI-first iPhone real estate photography concept: pro-level listing media in 30 minutes, directly from an agent's phone. The product focuses on guided capture, instant AI enhancement, optional cloud polish, MLS-ready delivery, lightweight 3D/video outputs, and agent branding.

**Status:** Concept / market validation

## ⚠ Human action needed to unblock the next stage

As of 2026-07-12, every agent-doable task in `process/roadmap.ts` is done. All remaining
roadmap tasks are `owner: "human"` (or gated on one). Dozens of agent sessions since
2026-06-13 have kept re-confirming this same state — the prep work (checklist, pricing,
outreach copy, enhancement pipeline, lead-intake CLI, listing-audit rubric, interview
script) is ready and waiting. Nothing else agent-side moves the business forward until one
of these happens:

1. **Book and shoot one real concierge listing** (`process/capture-checklist.ts` +
   `pipeline/` + `process/outreach-templates.ts`) — the single highest-leverage next step;
   unblocks `p2-first-deliveries` and, eventually, `p3-app-scope`.
2. **Run the Phase 1 interviews** (`process/interview-script.ts`, 10 agents + 5 STR hosts)
   — unblocks `p1-run-interviews`.
3. **Score 20 Zillow listings** in a chosen metro against `process/listing-audit-rubric.ts`
   — unblocks `p1-listing-audit`.
4. **Flip the Cloudflare Access policy on** for the docs site in the Cloudflare dashboard
   — merges PR #4 (`cursor/fix-pages-access-4a7e`), unblocks `p0-docs-site`.
5. **Delete the ~12 confirmed-stale, fully-merged branches** — agent sessions get a hard
   `HTTP 403` trying to delete refs on this repo (confirmed across multiple sessions, not a
   transient error); this needs a token/permission fix or manual deletion from
   github.com.

See `process/prompt_process.tsx` → `AGENT_PROCESS_INSTRUCTIONS` for the full agent process,
and `process/progress-log.ts` for what every session has tried.

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
