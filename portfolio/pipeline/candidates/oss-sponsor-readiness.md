# Candidate: OSS sponsor readiness checklist

**One line.** A free, client-side tool that scores a public GitHub repo
against the signals that correlate with attracting GitHub Sponsors —
funding config present, community-health files, activity recency,
discoverability — and returns a ranked "fix this first" checklist. No
account, no server, no stored data.

**Verdict: build now, as a new venture (`sponsor-ready`).** No existing
venture sells to open-source maintainers; the closest cousins
(`ai-first-markets`, the EAA/accessibility line) target solo founders and
site owners, not repo maintainers. Zero infrastructure cost — every check
runs in the visitor's browser directly against GitHub's public REST API —
so there is no reason to wait for a probe before shipping the free tier.

Scored 2026-08-24. Composite 6.5 · floor 3 (ai_leverage, time_to_revenue,
defensibility).

| Dimension | Score | Why |
|---|---|---|
| AI leverage | 3 | v1 is deterministic: GitHub's own `community/profile` endpoint plus a few content checks (`FUNDING.yml`, README keywords). No model call. A v2 "explain this in plain English for my repo" pass is the natural AI add, deferred to keep the free tier's marginal cost at zero |
| Autonomous ops | 10 | Static page; every request goes browser → `api.github.com` directly. Nothing to operate, no queue, no account to drain |
| Time to revenue | 3 | Free indefinitely by design — this is the portfolio's current "abundant free value" phase, not a paid product. Any revenue is indirect (traffic to the portfolio's own Sponsors link, or a later paid "continuous monitor" GitHub App tier) |
| Gross margin | 10 | No backend. Marginal cost per visitor is GitHub's own rate limit, not ours |
| Defensibility | 3 | The checklist logic is copyable in an afternoon, and GitHub already ships a generic `community/profile` health score for free. The durable asset, if any, is a sponsor-conversion-specific checklist (not generic community health) plus whatever audience trust and SEO the content earns — not a technical moat |
| Distribution | 6 | The audience (OSS maintainers who want Sponsors) is exactly GitHub's own userbase, reachable via GitHub Topics/search, "awesome-lists," Show HN, r/opensource, r/github — and the query itself ("how to get more GitHub Sponsors") is organic-search-shaped |
| Liability containment | 9 | Read-only, informational heuristic, explicit "not a guarantee of sponsorship outcomes" disclaimer. A wrong score costs nothing — there is no advice-of-record and no filing on anyone's behalf |
| Ethical robustness | 8 | Reads only what the repo owner already published publicly; no scraping of personal data, no dark patterns, gets more useful as more sponsor-correlated signals are added |

## What this is not

- **Not GitHub's own community-health score**, restated. `community/profile`
  reports generic OSS hygiene (contributing guide, code of conduct, issue
  templates). This tool is scoped specifically to *sponsorship* signals —
  a valid `FUNDING.yml`, a visible funding ask, activity recency, and
  discoverability — and treats the generic health score as one input among
  several, not the product.
- **Not GEO / AI-visibility monitoring** (screened out) — this reads GitHub's
  own API for one specific repo the visitor supplies, not general brand
  mentions across AI search surfaces.
- **Not `docs-debt-service`** (screened out) — it does not track documentation
  staleness as its own subscription; funding-readiness is a narrower,
  action-oriented slice.
- **Not advice-of-record.** "Your `FUNDING.yml` is missing" is a fact about a
  public file. "You will get sponsors if you fix this" is a warranty this
  tool does not make and the copy says so.

## Why now

`session_gate.py` on 2026-08-24 reported BUILD with no unbuilt `build-now`
candidate in the pipeline (both prior ones — `eaa-remediation-pipeline` and
`mls-photo-spec-preflight` — already graduated as product lines). The brief
also explicitly authorizes inventing a new niche not in `screened-out.md`.
This one costs nothing to ship: no account, no domain, no payment surface,
and it is buildable and testable entirely inside this session.

## What is delivered

1. A single input (owner/repo or a GitHub URL).
2. Client-side fetches against `api.github.com`'s public, unauthenticated,
   CORS-enabled endpoints — repo metadata, `community/profile`, and a
   `FUNDING.yml` / README content check.
3. A 0–100 readiness score plus a ranked checklist: which sponsor-correlated
   signal is missing, why it matters, and the one file/PR that would fix it.
4. Disclaimers: not affiliated with GitHub; informational heuristic only;
   no data is stored or transmitted anywhere by this tool.

Indicative future monetization (not built now, payment rails stay off per
`DIRECTION.md`): a paid GitHub App tier that re-checks on every push and
opens a PR for the mechanical fixes (missing `FUNDING.yml`, missing topics).
The free scorer is also the funnel for that, if usage shows anyone returns.

## Liability and ethics

- **Never scores private repos or non-owner-supplied data.** The visitor
  supplies the repo; nothing is scraped in bulk or cached server-side
  because there is no server.
- **Never claims a sponsorship outcome.** The copy states this is a
  heuristic checklist against publicly documented signals, not a guarantee.
- **No data collection beyond anonymous, aggregate usage counts** (page
  views / scans run) — never the repo name scanned, per `DIRECTION.md`'s
  privacy-conscious analytics standard.

## First experiment

Three days, $0 spend, ships inside this session:

1. Build the scorer and the static UI (this pass).
2. Add a small pure-function test suite for the scoring logic (fixtures:
   a well-configured repo, a repo with nothing configured, edge cases like
   a missing `community/profile` on a brand-new repo).
3. Measure return usage and organic referrers once a URL exists — that step
   needs a public deploy, which is owner-gated per `DIRECTION.md` ("publishing
   under the portfolio's public name" / production domain cutover). Until
   then this ships built, tested, and ready to deploy on the owner's say-so.

Kill it if, once live, 30 days of usage shows single-digit unique scans with
no organic referrer and no repeat visits — the signal that the "sponsor
readiness" framing doesn't actually match what maintainers search for.

## Sources

- [GitHub REST API — community profile](https://docs.github.com/en/rest/metrics/community) — the `health_percentage` and per-file booleans this tool builds on
- [GitHub Docs — displaying a sponsor button](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository) — `FUNDING.yml` schema and validation rules

Desk research, gathered 2026-08-24. Same confidence bar as the rest of this
directory: good enough to rank and build against, not a substitute for
measuring real maintainer response once deployed.
