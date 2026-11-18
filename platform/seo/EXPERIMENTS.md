# SEO / AEO experiments

One entry per change made to move rankings, newest last. Each entry gives the
date, the change, the queries or metric it should move, the earliest date a
move could show, and later the result. Log "no change" results too: a lever
that did nothing is worth knowing. Readings are in
`history/observations.jsonl`; `probe.py report` summarises them.

## Baseline, 2026-11-03

- `claude-websearch`: 8 of 23 tracked queries run (2 brand, 3 name, 3
  intent), and **0 found any marisstella.app page**. `site:marisstella.app`
  also returned nothing from the domain (not a tracked query, so it isn't in
  the history).
- Competing free calculators on `*.pages.dev` (Cloudflare Pages) rank for the
  wall-framing and round-robin intent queries. A new Cloudflare-hosted
  calculator site can be indexed; the host is not the obstacle.
- `audit`: 0 blockers; warnings are long titles and no verification token.

## E1. IndexNow, submitted by hand (2026-11-03)

- **Change:** `node platform/marketing/indexnow.mjs --dir <live catalog.json + key> --submit`
  sent the 1,343 catalogue URLs on marisstella.app. The answer was `POST
  https://api.indexnow.org/indexnow -> 200`, so the key was verified. The
  deploy workflow does the same on every finished deploy, but its last ten runs
  had been cancelled by newer merges.
- **Should move:** `brand` and `name` queries on Bing-backed engines. A plain
  web-search tool sample may not show it if its backend isn't Bing.
- **Earliest read:** 2026-11-10.
- **Result:** pending.

## E2. GitHub links repointed to marisstella.app (2026-11-03)

- **Change:** every `duncan-haywood.github.io/oss-monorepo/` (and older
  `/monorepo-projects/`) URL in `ventures/*/README.md`, `ventures/*/VENTURE.yaml`
  and `research/**/README.md` now names `https://marisstella.app/` at the same
  path. That is 3,655 files. 2,423 of the 2,429 distinct URLs answered 200 on
  the new host before the rewrite; the rest were 307s to pretty URLs and one
  product (`retail-pilot-intel/`) that 404s on both hosts. The generators and
  checks (`platform/pages/readme-live-link.mjs`,
  `platform/ci/venture_live_links.py`, `platform/ci/research_live_links.py`)
  now write and require the new base.
- **Should move:** `name` queries first, since GitHub READMEs are crawled
  often and now link straight to the product pages, then `brand`.
- **Earliest read:** 2026-11-17 (GitHub recrawl plus a crawl of ours).
- **Result:** pending.

## Next candidates (not done)

- Owner verification in Search Console and Bing (`search-engine-verification`
  in `asks.yaml`). This is the largest remaining lever, and the only route to
  Google's own numbers.
- Platform code that still writes the old base into outward-facing text:
  `platform/distribution/{mcp,bluesky,citation}.mjs`,
  `platform/distribution/hub/compose.mjs`,
  `platform/distribution/actions/*/README.md`. These links land in registries
  and posts that AI assistants read.
- Shorten the 70+ character titles the audit lists, starting with flagship
  pages (`sales-agent`, `merchant-feed-check`).
- Make the deploy's IndexNow step survive cancellation, for example by running
  it from the scheduled three-hourly deploy only. That is a control-plane
  edit (`.github/`) and needs its own PR.
