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
npm feed (`storage.googleapis.com/osv-vulnerabilities/npm/all.zip`, re-fetched
2026-08-21). Raw output:
[`validation-2026-08-21.json`](validation-2026-08-21.json); the previous run is
kept at [`validation-2026-08-20.json`](validation-2026-08-20.json).

| Product | Mode | Findings | Deployed | Suppressed | Rate | Manual review |
|---|---|---|---|---|---|---|
| `ai-first-markets` | server | 7 | 7 | 0 | 0.0% | 0% |
| `local-site-studio` | server | 1 | 1 | 0 | 0.0% | 0% |
| `photo-editing/docs-site` | server | 5 | 5 | 0 | 0.0% | 0% |
| `print-atelier` | server | 27 | 25 | 2 | 7.4% | 4% |
| `quick-pick-survey` | server | 0 | 0 | 0 | — | — |
| `real-estate-agent-photo-app/docs-site` | static-export | 55 | 11 | 44 | **80.0%** | ~98% |
| `real-estate-agent-photo-app/research` | static-export | 37 | 11 | 26 | **70.3%** | ~97% |
| **Total** | | **132** | **60** | **72** | **54.5%** | 64.6–66.0% |

Two independent things moved this table since 2026-08-20, and they are worth
separating because only one of them is a change to this tool:

- **The partial-bound fix below removed exactly 7 findings**, one from every
  product that has `next` installed — measured on a single checkout by running
  the sample with the coercion disabled and again with it enabled, so nothing
  else varies.
- **The rest is `main` drift.** `local-site-studio` fell from 16 findings to 2
  before this fix was applied at all, because its `next` upgrade landed in the
  meantime. Comparing the two dated JSON files without accounting for that will
  attribute the drop to the wrong cause.

Two results matter more than the headline:

1. **The bimodality reproduces.** Four server-mode products suppress at 0–7%;
   the two static-export products suppress at 70–80%. The automated split lands
   in the same place the manual split did, from the same signal.
2. **It errs towards reporting.** 80.0% against a manual 98%, and 70.3% against
   ~97%. The gap is findings left in front of the user. That is the direction
   the error has to point, and the gap is the honest measure of how much of
   this is still manual judgement. It is no longer unexplained, though — see
   [what the residual actually is](#what-the-residual-actually-is) below.

Counts differ slightly from the manual review because this uses the complete
OSV feed rather than the npm bulk endpoint, and runs against a feed that
updates daily.

All 16 `server-surface` suppressions on `docs-site` were inspected by hand:
Middleware, Server Actions, the Image Optimizer, rewrites, SSRF, cache
poisoning and request smuggling — none of which exists in a statically exported
site. No suppression in the sample was wrong.

## A false positive on every Next.js product in the portfolio (2026-08-21)

The 2026-08-20 run reported `GHSA-3h52-269p-cp9r` — *"Information exposure in
Next.js dev server"* — as shipped code on **all seven** products that have
`next` installed. Every one of them was already patched. It was a false
positive in each case, and on `quick-pick-survey` it was the *only* finding the
tool produced.

The cause is one character-level detail in the advisory. Its affected set has
two ranges:

```
introduced 15.0.0  → fixed 15.2.2
introduced 13.0    → fixed 14.2.30      ← two components, not three
```

`13.0` is not valid semver, so `semver.parse` raised `UnparseableRange`, and by
this tool's own central rule an unreadable range is *not* evidence of safety —
`_matches_range` returns "affected" with a caveat. That rule is right. What was
wrong is that the finding then also skipped the suppression stage entirely
("suppression rules are not applied to uncertain matches"), so the
`dev-server-surface` rule that exists precisely for this advisory never got to
fire.

Two properties made it worse than a single bad row:

- **It is not proportional to distance from the vulnerable range.** One
  malformed bound anywhere in the advisory makes *every* version of that
  package report as affected. `local-site-studio` and `quick-pick-survey` are
  on `next@16.3.1` — three majors past anything the advisory describes — and
  were still flagged.
- **It never ages out.** Upgrading cannot clear it, because the comparison that
  would clear it is the one that fails to parse. It would have sat in the
  evidence record indefinitely.

### The fix, and why it is scoped the way it is

`semver.parse_bound` now applies two lossless numeric readings to OSV event
bounds: zero-fill missing components (`13.0` → `13.0.0`) and strip leading
zeros (`2026.05.1` → `2026.5.1`).

It is deliberately **not** applied to npm range strings. The same text means
different things in the two dialects: an OSV bound is a single point on a
version timeline, so `13.0` denotes exactly `13.0.0`; in an npm range `1.2` is
the X-range `>=1.2.0 <1.3.0`. Coercing a point in one dialect is lossless,
coercing a range in the other would be a silent semantic change.
`tests/test_semver.py::TestBoundCoercionIsScopedToOsv` pins that split so a
later refactor cannot quietly merge the two paths.

Anything that is *not* an unambiguous numeric reading still raises, and that
boundary was checked against the whole feed rather than asserted:

| | Advisories |
|---|---|
| npm advisories in the 2026-08-21 feed | 227,147 |
| carrying ≥1 bound this tool could not parse | 40 (0.02%) |
| **resolved by the coercion** | **32** |
| still unparseable, still reported | 8 |

The eight refusals are the check that the scoping is right: every one is a
**cross-ecosystem advisory** where another language's version grammar leaked
into an npm record — Ruby (`7.0.0.alpha1`, `3.5.0.pre0`), Python
(`2.0.0b14`, `0.30.0b3`), and raw git SHAs. None has an unambiguous semver
point, so guessing one could silently drop a real finding, which is the failure
mode this tool exists to avoid.

**Feed-level rarity is not product-level rarity.** 0.02% of advisories sounds
negligible until you notice which packages they land on: `next`, `directus`,
`nocodb`, `handlebars`, `@solana/web3.js`, `nodebb`, `ckeditor4`. Advisory
prevalence is uniform across the feed; *exposure* is weighted by how popular the
package is. That is why a 0.02% feed defect produced a 100% product hit rate
here.

## What the residual actually is

The 2026-08-20 write-up called the remaining gap "noise the rule table cannot
yet recognise." It is not noise, and leaving it described that way invites the
next session to re-derive it. Both static-export products carry the **same 11
residual findings**, in four groups:

| Group | Count | What it is | Suppressible? |
|---|---|---|---|
| `postcss` sourceMappingURL / stringify | 4 | Build-time CSS toolchain; the vulnerable code runs during `next build`, never in the deployed artifact | Needs a **build-surface** rule — the largest single win left |
| `next` Server Components / RSC / CSP nonce | 4 | Surfaces a static export does not emit; the existing table has no pattern for "Server Components" or per-request CSP nonces | Yes, by extending `SERVER_ONLY_RULES` |
| `nanoid` infinite loop on negative/zero size | 2 | Requires the *caller* to pass an attacker-controlled size, which is a property of application code, not of the dependency | Not without call-graph analysis; correctly reported |
| `next` `beforeInteractive` script XSS | 1 | Genuinely client-side — it does ship in a static export | **No. This is the true positive** |

That last row is the useful one. Manual review put these products at ~97–98%
suppressible, and this decomposition says the honest ceiling is **10 of 11**,
because one finding in the residual is real. A rule table that suppressed all
11 would be wrong, not better.

The `postcss` and Server Components groups are the specified next step for this
probe. Both need positive evidence in the same style as the existing rules — a
named build-toolchain classification for the first, new surface patterns for the
second — and neither should fire when the project's own source imports the
package directly.

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
- An advisory bound that is neither valid semver nor an unambiguous numeric
  reading still makes its whole range unreadable, and the finding is reported.
  Eight advisories in the current feed are in that state, all of them
  cross-ecosystem records. This is the intended behaviour, but it means a
  *reported* finding on a package with a Ruby- or Python-shaped version bound
  may be a parse artefact rather than a real exposure — check the caveat before
  acting on one.
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
python3 -m pytest                            # 133 tests, no network required
python3 run_portfolio_sample.py <osv.zip>    # re-run the validation
```

The test suite is weighted towards proving suppression requires evidence:
`tests/test_engine.py::TestUncertaintyNeverSuppresses` covers every path where
an unparseable version, an undetermined deployment mode, or a low-confidence
signal must fall through to *shipped*.
