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

Four suppression rules. Each requires positive, named evidence; there is no
path through the engine that suppresses a finding because something could not
be determined.

| Rule | Suppresses when | Evidence used |
|---|---|---|
| `dependency-path` | every install location in the advisory's range is dev-only | npm's own per-location `dev` flag in `package-lock.json` |
| `dev-server-surface` | the advisory is scoped to the development server | advisory text names `next dev` / "development server" and never "production" |
| `build-surface` | every production install location is reached only through the build toolchain | the lockfile's own production dependency edges, plus a named `(dependent, package)` claim |
| `server-surface:*` | the project ships no server and the advisory describes a server-only surface | `output: "export"` in `next.config.*`, plus a named surface rule |

Everything else is reported as **shipped**, including every finding whose
version match could not be made reliably.

`build-surface` is the only rule that reads **no advisory text at all**. Its
evidence is structural, which is why it is also the only rule that fires on
server-rendered projects: a package the deployed artifact never loads is absent
whether that artifact is a CDN directory or a running Node server. It is
described in full under [the build surface](#the-build-surface-2026-08-21)
below.

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

**Superseded by the build-surface run below**, on the same checkout and the
same feed file, so the two tables are a clean A/B rather than two dates:
[`validation-2026-08-21-build-surface.json`](validation-2026-08-21-build-surface.json).

| Product | Mode | Findings | Deployed | Suppressed | Rate | Manual review |
|---|---|---|---|---|---|---|
| `ai-first-markets` | server | 7 | 3 | 4 | 57.1% | 0% |
| `local-site-studio` | server | 1 | 1 | 0 | 0.0% | 0% |
| `photo-editing/docs-site` | server | 5 | 1 | 4 | 80.0% | 0% |
| `print-atelier` | server | 27 | 21 | 6 | 22.2% | 4% |
| `quick-pick-survey` | server | 0 | 0 | 0 | — | — |
| `real-estate-agent-photo-app/docs-site` | static-export | 55 | 2 | 53 | **96.4%** | ~98% |
| `real-estate-agent-photo-app/research` | static-export | 37 | 2 | 35 | **94.6%** | ~97% |
| **Total** | | **132** | **30** | **102** | **77.3%** | 64.6–66.0% |

Two things about that table need saying before it is read as an improvement.

- **The static-export rows are now at the manual review's number**, and the
  residual is no longer unexplained noise — it is two named findings, one of
  which is the true positive the decomposition below already identified. That
  is the result the previous run projected and it landed where it projected.
- **The server rows moved for the first time, and they moved past the manual
  review.** The manual review put the server-rendered products at 0–4%
  suppressible; this run says 22–80%. That is not the automated pass beating
  the human one. It is the two of them answering different questions: the
  manual review classified by *deployment mode*, which is the only axis
  `cra-advisory-reachability` measured, and it never asked whether a
  production-path package runs after the build at all. Every server-row
  suppression here is the same four PostCSS advisories, reached through the
  same single named edge. Treat the server numbers as a new claim carrying one
  point of failure, not as corroborated by the review.

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

## The build surface (2026-08-21)

That specified next step, built. It closes three of the four residual groups and
**refutes the fourth row of the table above** — the one that called the `nanoid`
findings un-suppressible without call-graph analysis. They are suppressible
without it. The residual falls from 11 to 2 on both static-export products.

| Group | Was | Now | By what |
|---|---|---|---|
| `postcss` sourceMappingURL / stringify | 4 | 0 | `build-surface`, edge `next → postcss` |
| `next` Server Components / RSC | 3 | 0 | `server-surface:server-functions` |
| `nanoid` infinite loop | 2 | 0 | `build-surface`, edge `postcss → nanoid`, transitively |
| `next` CSP nonce XSS | 1 | 1 | deliberately not suppressed — see below |
| `next` `beforeInteractive` XSS | 1 | 1 | **the true positive** |

### Why the graph, and not the advisory text

The four PostCSS advisories survived every text rule because nothing in their
text is wrong. `postcss.process()` really does dereference an attacker-controlled
`sourceMappingURL`. The reason they do not describe deployed code is not in the
advisory at all — it is in the lockfile, and it is invisible unless you look at
which install location keeps the finding alive:

```
node_modules/postcss                    8.5.15  dev: true    ← the project's own, for Tailwind
node_modules/next/node_modules/postcss  8.4.31  dev: false   ← this one keeps it shipped
```

`dependency-path` needs *every* location to be dev-only, so the nested copy —
vendored inside `next`, invoked by `next build`, never by `next start` — held
four advisories open on all seven Next.js products here.

So `build-surface` reasons over the lockfile's production dependency edges,
reimplementing Node's nearest-ancestor resolution so an edge points at the
location actually loaded rather than at every same-named install. A production
location is build-only when every production dependent of it is build-only,
bottoming out at a **named `(dependent, package)` edge** in
`graph.BUILD_ONLY_EDGES`.

Edges are pairs rather than a package allowlist on purpose. `("next",
"postcss")` asserts one specific, falsifiable thing — *Next.js invokes PostCSS
during the build and never afterwards* — and a reviewer can reject that one
claim. A bare `postcss` allowlist would also fire when a runtime CSS-in-JS
library pulls PostCSS onto the request path, which is exactly the case that must
not be suppressed. `tests/test_graph.py::test_a_runtime_dependent_defeats_the_transitive_claim`
pins it.

### The `nanoid` correction

The residual table above recorded the two `nanoid` advisories as needing
call-graph analysis. Checking the graph rather than reasoning about the package
shows why that was wrong:

```
node_modules/nanoid  production dependents: ['postcss']
next@14.2.35 dependencies: @next/env, @swc/helpers, busboy, caniuse-lite,
                           graceful-fs, postcss, styled-jsx    ← no nanoid
```

`next` does not depend on `nanoid`. Its only production dependent in these
lockfiles is the vendored PostCSS above, which is itself build-only — so
`nanoid` is reachable in production *solely* through a build-time toolchain, and
transitivity settles it. The earlier note reasoned about what the advisory
requires of the caller; the answer was in what the lockfile says about who the
caller is.

### What is deliberately still reported

**`GHSA-ffhc-5mcf-pf4q` — XSS in App Router applications using CSP nonces.** A
Next.js CSP nonce is derived per request from an inbound header, and a static
export derives nothing from request headers, so this advisory almost certainly
does not describe these two products. It is still reported, because suppressing
it would mean letting a `server-surface` match override the `xss` veto in
`CLIENT_OR_BUILD_RULES`, and that veto is a load-bearing safety property: it is
what stops a server-sounding phrase in a mixed-surface advisory from suppressing
a real client-side finding. Buying one correct suppression by adding a
precedence mechanism to the one rule that protects against the tool's worst
failure mode is a bad trade. The finding stays in front of the user with this
paragraph as its explanation.

**There is no `server-components` rule, and that is not an oversight.** The
obvious pattern for the RSC advisories is `\bserver components?\b`. It is wrong:
a statically exported build *does* execute Server Components, at build time, to
produce the pre-rendered HTML. What it lacks is the request-handling half — and
all three advisories say so themselves, describing "a specially crafted HTTP
request sent to any App Router **Server Function endpoint**". The rule therefore
matches the endpoint, as `server-actions` already does for the other name of the
same thing. An RSC advisory about build-time rendering is not suppressed, which
is correct. `tests/test_surfaces.py::test_there_is_no_server_components_rule`
pins the decision so a later pass has to argue with it before widening it.

### What this rule can get wrong

The honest failure modes, stated because a suppression nobody can audit is the
thing this probe exists not to be:

- **A wrong edge suppresses everywhere at once.** Of the 30 findings this change
  newly suppresses across five products, 24 rest on the single claim
  `next → postcss`: 20 of them directly, and the 4 `nanoid` ones transitively,
  since the only thing making `nanoid` build-only is that its one production
  dependent is that same PostCSS. If Next.js ever invokes PostCSS at request
  time, this rule is wrong on every Next.js product at once. That is the
  concentration risk of a structural rule, and it is why the edges are named and
  individually reviewable rather than folded into a package allowlist.
- **Vendored copies are invisible.** The rule reasons over lockfile components.
  A dependency that bundles a copy of another library into its own published
  files is one lockfile entry, so this record says nothing either way about the
  bundled copy. Now stated in `COVERAGE_LIMITS`.
- **The build machine is still exposed.** "Not in the deployed artifact" is not
  "harmless" — the machine running `next build` executes this code on whatever
  CSS the repository contains. The suppression reason says so in every record,
  and so does a coverage limit.
- **Dynamic `require(someVariable)` defeats the source scan.** The scan covers
  static import shapes; a project that loads packages by computed name gets no
  protection from it and relies on the declaration guard alone.

Both guards are independent and either one blocks the rule: a package the
project declares in its own `dependencies`, or imports anywhere in its own
source, is never build-only however the graph resolves. The root project is a
dependent like any other and is never itself build-only, which is the structural
half of the same protection.

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
