# npm reachability triage

**A working probe, not a venture.** It implements the one attribute of
[`cra-evidence-desk`](../../candidates/cra-evidence-desk.md) that has been
measured rather than asserted, and it is the first thing in
`portfolio/pipeline/` that is executable rather than a write-up.

It answers one question about a JavaScript project: **of the advisories that
match your dependencies, which describe code you actually deploy?**

---

## Why this and not the candidate's stated wedge

The `cra-evidence-desk` write-up names its differentiator explicitly — matching
components against the **EU Vulnerability Database**, which Dependency-Track
does not integrate — and calls everything else "crowded and partly free."

That wedge is not reachable from an agent session, and this run confirmed it at
an address no previous pass had tried. Prior passes probed
`euvd.enisa.europa.eu`, the human-facing site. The API is served from a
different host, `euvdservices.enisa.europa.eu` (documented at
`euvd.enisa.europa.eu/apidoc`; base URI `https://euvdservices.enisa.europa.eu`,
endpoints `/api/search`, `/api/enisaid`, `/api/lastvulnerabilities`,
`/api/exploitedvulnerabilities`, `/api/criticalvulnerabilities`,
`/api/advisory`, `/api/dump/cve-euvd-mapping`, `/api/kev/dump`; no
authentication). Applying the rule from
[`feed-reachability`](../../../research/data-reachability/README.md) — *probe
every channel a feed publishes* — that second host is **also denied**
(`connect_rejected`, logged at `$HTTPS_PROXY/__agentproxy/status`). EUVD
publishes to no git or object-storage mirror either. So the wedge is closed at
the right address rather than assumed at the wrong one.

Meanwhile the measurement in
[`portfolio/research/cra-advisory-reachability/`](../../../research/cra-advisory-reachability/README.md)
found something the write-up did not anticipate. Across 9 products and 3,573
components, **64.6–66.0% of version-range findings were false positives**, and
the rate was not an average — it was bimodal:

> The discriminating input is not the advisory feed. It is one fact about how
> the product is deployed — free to the customer, invisible to the scanner.

That research called the triage "the first attribute in this directory that was
measured rather than asserted," and left building it as future work. This is
that build.

## What it does

Three suppression rules. Each requires positive, named evidence; there is no
path through the engine that suppresses a finding because something could not
be determined.

| Rule | Suppresses when | Evidence used |
|---|---|---|
| `dependency-path` | every install location in the advisory's range is dev-only | npm's own per-location `dev` flag in `package-lock.json` |
| `dev-server-surface` | the advisory is scoped to the development server | advisory text names `next dev` / "development server" and never "production" |
| `server-surface:*` | the project ships no server and the advisory describes a server-only surface | `output: "export"` in `next.config.*`, plus a named surface rule |

Everything else is reported as **shipped**, including every finding whose
version match could not be made reliably.

## Validated against the manual review

Run across the same nine products the manual review covered, using the live OSV
npm feed (`storage.googleapis.com/osv-vulnerabilities/npm/all.zip`, fetched
2026-08-20). Raw output: [`validation-2026-08-20.json`](validation-2026-08-20.json).

| Product | Mode | Findings | Deployed | Suppressed | Rate | Manual review |
|---|---|---|---|---|---|---|
| `ai-first-markets` | server | 8 | 8 | 0 | 0.0% | 0% |
| `local-site-studio` | server | 16 | 16 | 0 | 0.0% | 0% |
| `photo-editing/docs-site` | server | 6 | 6 | 0 | 0.0% | 0% |
| `print-atelier` | server | 28 | 26 | 2 | 7.1% | 4% |
| `quick-pick-survey` | server | 1 | 1 | 0 | 0.0% | — |
| `real-estate-agent-photo-app/docs-site` | static-export | 56 | 12 | 44 | **78.6%** | ~98% |
| `real-estate-agent-photo-app/research` | static-export | 38 | 12 | 26 | **68.4%** | ~97% |
| **Total** | | **153** | **81** | **72** | **47.1%** | 64.6–66.0% |

Two results matter more than the headline:

1. **The bimodality reproduces.** Four server-mode products suppress at 0–7%;
   the two static-export products suppress at 68–79%. The automated split lands
   in the same place the manual split did, from the same signal.
2. **It errs towards reporting.** 78.6% against a manual 98%, and 68.4% against
   ~97%. The gap is noise the rule table cannot yet recognise — findings left
   in front of the user. That is the direction the error has to point, and the
   gap is the honest measure of how much of this is still manual judgement.

Counts differ slightly from the manual review (56 findings vs 55, 38 vs 39)
because this uses the complete OSV feed rather than the npm bulk endpoint, and
runs a day later against a feed that updates daily.

All 16 `server-surface` suppressions on `docs-site` were inspected by hand:
Middleware, Server Actions, the Image Optimizer, rewrites, SSRF, cache
poisoning and request smuggling — none of which exists in a statically exported
site. No suppression in the sample was wrong.

## Usage

```bash
pip install -e .
npm-reachability-triage --project ./my-app --output-dir ./record
```

Or as a GitHub Action — see [`examples/workflow.yml`](examples/workflow.yml):

```yaml
- uses: your-org/npm-reachability-triage@v0
  with:
    project: .
    fail-on: never
```

`fail-on` defaults to `never`, so adding it cannot break an existing pipeline. A
scanner that breaks the build by default gets disabled, and a disabled scanner
records nothing.

Offline or air-gapped runners can pass a pre-downloaded feed:

```bash
npm-reachability-triage --advisories ./osv-npm-all.zip
```

## What it deliberately does not do

- **It makes no compliance claim.** The record says what was checked, when, and
  what was found. `to_markdown()` is tested to never emit the words "compliant"
  or "compliance" about the scanned project, because that assertion is a
  warranty and this portfolio does not sell warranties.
- **It never hides a suppression.** Every suppressed finding is listed with the
  rule that suppressed it and the reason. Suppression a user cannot audit is
  indistinguishable from a missed finding — which is precisely the failure mode
  that got the accessibility-overlay vendors an FTC order, and the reason
  [`distribution-first.md`](../../distribution-first.md) treats dishonest
  incumbents as a wedge.
- **It collects nothing.** No telemetry, no network calls except fetching the
  public advisory feed, no personal data, no payment.

## Limits

- npm only, `package-lock.json` v2/v3 only. A v1 lockfile carries no
  per-location `dev` flag, so the analysis is impossible and the tool refuses
  rather than degrading to name-level matching.
- Deployment detection is Next.js-specific and textual. It does not execute the
  config, so a computed `output` value resolves to `unknown` and suppresses
  nothing. Other frameworks always resolve to `unknown`.
- "Reachable" means the vulnerable package is on a production dependency path
  and its affected surface is deployed. It is not call-graph analysis and does
  not mean an exploit exists.
- The surface rules are a hand-written table checked against one sample of nine
  products, four of which are documentation sites. A customer sample would skew
  less static, so expect lower suppression rates in the field.
- CRA obligation dates are still unverified from here: `eur-lex.europa.eu` is
  egress-blocked to both `curl` and `WebFetch`. Nothing in this tool depends on
  those dates, which is deliberate — it describes dependencies, not obligations.

## Status

**Built and tested. Not published.**

Per [`channel-inventory.md`](../../channel-inventory.md), building a free
listing is licensed for an agent session; the decision to publish under this
portfolio's name is not. GitHub Marketplace's free tier is the mapped channel
for this candidate, and the platform's own 100-install threshold before a
listing may charge doubles as the go/no-go number.

**Correction — it is not waiting on one approval.** This section previously read
"built and waiting on one approval rather than on a payout rail." That is the
same error `channel-inventory.md` records against its own earlier table:
Marketplace listing creation measures `SCOPE_DENIED`, because this session's
GitHub app scope is bound to `duncan-haywood/monorepo-projects` and refuses the
route. Publish approval alone would grant nothing. The blocker is **Ask 1** (the
GitHub App permission change), and approval to publish is only useful after it —
not instead of it. Do not plan work on the premise that this probe is one
decision away from a live listing.

## Development

```bash
python3 -m pytest                            # 112 tests, no network required
python3 run_portfolio_sample.py <osv.zip>    # re-run the validation
```

The test suite is weighted towards proving suppression requires evidence:
`tests/test_engine.py::TestUncertaintyNeverSuppresses` covers every path where
an unparseable version, an undetermined deployment mode, or a low-confidence
signal must fall through to *shipped*.
