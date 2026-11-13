# LLM Spend Guard roadmap

A long-running project. Each milestone lands as its own PR and keeps the
three rules: dependency-free core, fail closed, nothing of ours in the
deployer's request path.

## Where it is (v0, 2026-10-16)

- Policy engine (`guard.mjs`) with worst-case holds, scoped budgets (global,
  user, feature, key, run) over UTC windows, call caps, an output-token
  ceiling, a per-call worst-case limit, repeat, rate and spend-rate
  breakers, alerts, observe mode, and halt/resume.
- Proxy (`proxy.mjs`) for Anthropic Messages and OpenAI Chat Completions,
  streaming included, with provider-shaped 402/429 refusals, a guard against
  exposing a held key, admin endpoints and webhook alerts.
- Log replay (`simulate.mjs`), a CLI, a browser simulator, a Dockerfile.
- Internal use: `platform/llm/byok.mjs` accepts a guard, so every venture
  that uses the shared client can cap its spend.

## Next

1. **More wire formats.** OpenAI Responses API (`/v1/responses`,
   `max_output_tokens`), Gemini `generateContent`, embeddings (input-only
   pricing), batch endpoints (discounted prices as a policy field).
2. **Shared stores.** SQLite (one box, many processes) and Redis or
   Postgres (several proxies). Holds need an atomic compare-and-add, so
   each store gets the same conformance suite as the memory store.
3. **One-click self-deploy.** OpenTofu templates for Cloud Run, Fly.io and
   a small VM, wired into `platform/deploy`. The deployer pastes a policy and
   their keys, and the proxy runs in their account. The proxy is a server,
   not a static page, so it needs a server target the deploy page does not
   have yet.
4. **Status page.** A read-only page served by the proxy at `/guard/` (behind
   the admin token) showing each budget's burn-down, open breakers and the
   last refusals.
5. **Price sheets.** A dated, sourced `prices/*.json` the deployer can opt
   into, with `check-policy` warning when a sheet is older than 90 days.
   Never fetched silently: prices are the deployer's statement.
6. **Policy as code in CI.** `check-policy --fail-on gap` as a PR gate, and
   `simulate` against a committed sample log as a regression test for
   policy changes.
7. **Per-tenant budgets for SaaS builders.** A `tenant` scope and an
   admin API to set a tenant's limit, so a product can sell AI usage tiers
   and enforce them in one place.

## Known gaps (quality audit round 62)

From [`portfolio/quality/audits/2026-11-13-llm-spend-guard.json`](../../portfolio/quality/audits/2026-11-13-llm-spend-guard.json):

- **Media in the hold (high).** The input estimate is the request's JSON bytes / 3, so an image or a document sent by URL or file id is held at a few dozen tokens: 20 concurrent calls with a 100-page PDF by URL passed a $1 budget and spent $15.31. Needs per-media token floors (or refusing URL and file-id sources unless the policy sets a media allowance) and an overshoot event from `settle` when the actual cost passes the hold.
- **Price shape (medium).** One cache-write rate (Anthropic's one-hour cache writes cost more than five-minute ones), no long-context tier, no per-request fees such as web search.
- **Holds lost on restart (medium).** Reservations persist in the store but the holds behind them do not, so a hold in flight at a restart is never charged or released.
- Fixed in round 62: OpenAI `n` above 1 is refused (output is billed per choice); a cut-off stream is tested to be charged its hold.

## Business model

The same as the rest of the portfolio (`prompts/goals.md`, Mission): MIT
code that anyone deploys in their own cloud with their own keys, with a
donate link. A hosted multi-tenant version would put us in the request
path holding customers' keys, which the portfolio does not do. If someone
wants to run it as a service for others, the code allows it, on their
accounts.

## Related work in this repo

- `ventures/llm-call-cost-scan`: the static check before code ships.
- `ventures/liability-audit`: the repo-wide audit, whose `llm-endpoint-no-spend-control`
  rule points here.

## Known gaps (quality audit 2026-11-13)

From [`portfolio/quality/audits/2026-11-13-llm-spend-guard.json`](../../portfolio/quality/audits/2026-11-13-llm-spend-guard.json);
the `n > 1`, snapshot-prefix and missing-end-marker defects were fixed in the same PR.

- One cache-write rate per model: Anthropic's 1-hour cache writes (2x input,
  against 1.25x for 5-minute) settle low; 100K tokens settled at $0.377
  against $0.602. Needs a second rate in the policy schema.
- No long-context tiers: a model whose price rises above a prompt-length
  threshold settles at the base rate (a 150K-token prompt at $0.0155 against
  $0.0775 in the audit's example).
- A call in flight when the proxy restarts leaves its reserve in the state
  file; spend is not exceeded, but the reserve is never released.
