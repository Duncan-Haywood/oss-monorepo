# SEO feedback loop (agent note, 2026-11-03)

- Ongoing owner goal: rank on Google and in AI agents' web search. Tooling is in `platform/seo/` (README, `probe.py`, `queries.json`, `EXPERIMENTS.md`, `STATUS.md`).
- Baseline 2026-11-03: 0 of 8 tracked queries found marisstella.app (`claude-websearch`); live audit 0 blockers.
- Any session can add readings: `probe.py next -n 6`, run each query through your web-search tool, `probe.py record <id> <urls...>`, then `probe.py report --write`. Re-read E1 on or after 2026-11-10 and E2 on or after 2026-11-17, and write the results in `EXPERIMENTS.md`.
- Egress from a cloud session: `api.indexnow.org`, `marisstella.app` and `api.search.brave.com` were reachable on 2026-11-03. IndexNow by hand: put the live `catalog.json` and the key file in a directory, then run `node platform/marketing/indexnow.mjs --dir <dir> --submit`.
- Blocked on the owner: `search-engine-verification` in `portfolio/ledger/asks.yaml` (Search Console, Bing, the optional `GSC_SERVICE_ACCOUNT_JSON`).
- Not done yet: outward-facing platform code still writes the old github.io base (`platform/distribution/*`); the IndexNow deploy step is cancelled along with superseded deploys (a `.github/` change).
