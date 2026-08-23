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

## Wrong-suppression rate, hand-verified (2026-08-21)

The validated-against-manual-review table above measures agreement with a
human classification of *deployment mode*. It never answered a narrower,
harder question: of the individual suppressions this run actually produces,
how many are wrong — a real, deployed vulnerability the tool hid? That needs
the actual advisory text and the actual lockfile evidence for each
suppression, not a synthetic fixture corpus, which is why it was left open
through the build-surface pass above.

Method: re-ran the engine against a freshly downloaded OSV npm feed (same
2026-08-21 fetch used above) across the seven npm products in this portfolio's
hand-written sample list — 7 of the 18 npm manifests a repository walk later
found here, and 7 of the 9 this tool can read at all, per [the coverage
section](#half-of-this-repository-was-never-scanned-2026-08-22) — and inspected
every one of the **102 suppressed findings** the run produced by hand. They reduce to **53 distinct `(advisory, rule, package)` claims** — the
same advisory suppressed the same way on more than one product counts once,
since the reasoning is identical. Full detail for all 53 is in
[`wrong-suppression-verification-2026-08-21.json`](wrong-suppression-verification-2026-08-21.json).

| Rule | Distinct claims | Raw findings | Evidence checked |
|---|---|---|---|
| `dependency-path` | 28 | 40 | Every install location's `dev` flag in the lockfile is `true`, every location is non-production, and the project's own source never imports the package directly (cross-checked against `scan_project_imports`, which the rule itself does not consult) |
| `build-surface` | 6 | 24 | The full OSV advisory text (4 PostCSS CVEs, 2 nanoid CVEs) against the specific vendored install location the rule names, not the package in the abstract |
| `server-surface:*` | 19 | 38 | The full OSV advisory text against the confirmed deployment config (`output: "export"` in both static-export products' `next.config.js`) and the absence of `middleware.*` or `'use server'` in either project's source |

**Result: 0 of 53 distinct claims, and therefore 0 of the 102 raw suppressed
findings, suppress a vulnerability that is actually present in what gets
deployed.**

What the verification actually checked, per rule:

- `dependency-path` is the strongest class: npm's per-location `dev` flag is a
  structural fact this tool reads rather than infers, and all 28 claims
  cross-checked clean on both signals a wrong suppression would need —
  production reachability and direct source use.
- `build-surface`'s 6 claims all rest on two named edges, `next → postcss` and,
  transitively, `postcss → nanoid`. Reading the actual advisory text mattered
  here: one of the four PostCSS advisories (`GHSA-qx2v-qp2m-jg93`, XSS via
  unescaped `</style>` in stringified output) describes a *runtime* attack
  scenario — parsing and re-stringifying user-submitted CSS — that sounds like
  it could apply to a live site. It does not apply to *this* install location:
  the vendored copy at `node_modules/next/node_modules/postcss` is invoked
  only by `next build`'s CSS pipeline, which compiles the project's own
  stylesheets, never attacker-submitted CSS at request time. The rule's
  reasoning holds because it is about the specific location, not the
  advisory's hypothetical.
- `server-surface:*`'s 19 claims were checked against real deployment evidence
  rather than assumed: both static-export products' `next.config.js` do say
  `output: "export"`, and neither project's source has a `middleware.*` file
  or a `'use server'` directive — so the surfaces these advisories describe
  (Middleware, Server Actions, the Image Optimizer, request-time caching, SSRF
  via server-originated requests) are confirmed absent, not just assumed
  absent from the mode label.

**One labeling imprecision found, not a wrong suppression — fixed.**
`GHSA-89xv-2m56-2m9x` ("SSRF in Server Actions on custom servers") was tagged
`server-surface:middleware`, not `server-surface:server-actions` or
`server-surface:ssrf`. `surfaces.classify()` matched the first rule in
`SERVER_ONLY_RULES` whose pattern hit anywhere in `summary + details`, and this
advisory's details mentioned "middleware/proxy authorization" alongside its
actual subject. The verdict was correct either way — both the matched surface
and the advisory's real one require a live server — but the label a reviewer
saw did not name the mechanism they would expect. `classify()` now takes
`summary` and `details` separately and matches against `summary` first,
falling back to the combined text only when nothing in the summary matches, so
a rule the details merely mention in passing no longer outranks the one the
advisory's own summary states. This advisory now labels as
`server-surface:server-actions`. Pinned by
`tests/test_surfaces.py::TestSummaryTakesPriorityOverDetails`, including a case
proving the fallback still catches a rule named only in `details`.

**What this measurement does not cover.** It is one portfolio's sample — the
same limit stated above (four of nine products are documentation sites). It
checked that the suppression *reasoning* is sound for the specific advisories
this feed currently carries; it is not a general proof that `dependency-path`,
`build-surface`, or `server-surface:*` can never misfire on a different
project's lockfile shape. The concentration risk the build-surface section
already names — 24 of 102 suppressions here trace to one edge claim,
`next → postcss` — still holds: this pass confirmed that edge is correct
today, not that it always will be.

### A structural cross-check, and a real gap it found (2026-08-21)

The hand review above reads advisory text and reasons about it — the only way
to check a *text-matched* rule (`server-surface:*`, `dev-server-surface`). The
two *structural* rules, `dependency-path` and `build-surface`, rest on a fact
on disk rather than a reading of prose, so that fact can be re-derived a
second way instead of re-read by hand.
[`verify_suppressions.py`](verify_suppressions.py) does that — `json.load`s
`package-lock.json` and `package.json` directly, bypassing `triage.lockfile`
and `triage.sources` entirely, so a bug shared between the engine and the
check would have to be the same bug written twice:

```
python3 verify_suppressions.py <osv-npm-all.zip>   # writes wrong-suppression-structural-check-2026-08-21.json, exits 1 if any problem found
```

Raw output: [`wrong-suppression-structural-check-2026-08-21.json`](wrong-suppression-structural-check-2026-08-21.json).
Same result as the hand review: 0 of 102 raw findings disagree with the raw
lockfile or manifest.

Running it surfaced a real gap, not just a confirmation. `build-surface`
already refused to suppress a package the project imports directly
(`context.uses_directly`, described above). `dependency-path` did not have the
same guard — it suppressed on the lockfile's `dev` flag alone. That flag is a
structural fact about what `npm install` resolves, not about what a bundler
resolves: this portfolio's own deploy workflows run plain `npm ci`, which
installs devDependencies too, so a devDependency the project's *own source*
imports directly would still end up bundled into a server build, and
`dependency-path` would suppress the finding anyway. `build-surface` guards
against exactly this; `dependency-path` did not.

No suppression in this sample was wrong for that reason — every project either
ships no server at all (static export) or the specific devDependency-only
packages here (`eslint`, `glob`) are never imported by the project's own
source, checked directly. But the rule shouldn't have relied on that being
true by chance. `dependency-path` now carries the same `context.uses_directly`
guard `build-surface` does — a package the project declares in `dependencies`
or imports anywhere in its own source is never suppressed by rule 1 either,
however the lockfile marks it. `tests/test_engine.py::TestDependencyPathRule`
pins the three new cases (direct import, declared production dependency, and
the pre-guard behaviour when no context is passed). Re-running the full
sample against the live feed after the fix produced the identical 102/30
split, so the fix closes a real gap without changing this sample's answer.

## Half of this repository was never scanned (2026-08-22)

Every measurement above — the validation table, the bimodality finding, the
102 hand-verified suppressions — was run over a **hand-written list of seven
product directories** in `run_portfolio_sample.py`. That list was assembled by
someone who already knew where the projects were, and it is the reason this
pass exists: a list like that cannot answer the question a reader of a record
actually has, which is *did you look at all of my code*.

`src/triage/discovery.py` walks the repository instead. Run over this one
([`coverage-2026-08-22.json`](coverage-2026-08-22.json), regenerate with
`run_repository_coverage.py`):

| | count |
|---|---:|
| npm manifests found | **18** |
| readable by this tool | **9** |
| refused | **9** |
| in the verification above | **7** |

**Exactly half of this repository's npm projects cannot be read by this tool at
all**, and the refusals are not scattered: **7 of the 9 are one venture**,
`retail-pilot-intel`, and they are refused for a single reason — its lockfile
is pnpm. One venture's choice of package manager removes seven manifests, two
of them deployable Vite apps, from every record this tool has ever produced.
Nothing in any of those records said so.

### Why a coverage rule that already existed did not catch it

`COVERAGE_LIMITS` has carried this line since the record was first written:

> Only npm dependencies declared in package-lock.json (v2/v3) are analysed.
> **Other ecosystems in the same repository are not covered.**

That sentence is true, and it is precisely why the gap survived five passes. It
was written about pip and Go. A reader whose repository holds no Python reads
it, correctly concludes it does not apply to them, and is left believing their
npm code was covered — because **pnpm is npm**. The limit named the wrong axis:
the boundary that matters is not the ecosystem, it is the lockfile format, and
a repository can be entirely npm and still be more than half unreadable.

This is the same failure `evidence.py` already guards one level down, where
every *suppressed* finding is listed on the reasoning that "suppression a user
cannot audit is indistinguishable from a missed finding." A project the tool
was never pointed at is strictly worse: it produces no findings, which is
byte-identical to a project that has none.

### What the walk changes, and what it does not

**It does not change a single number above.** Run against the same feed, the
walk finds the same seven products and reproduces the build-surface run field
for field — 132 findings, 30 deployed, 102 suppressed, every per-product row
identical. That is the point: this is a coverage correction, not a
re-measurement, and a test pins the totals so the two cannot drift apart.

What it adds is the nine it refuses, each with the specific thing that stopped
it and what would clear it (`pnpm-lockfile` → run `npm install
--package-lock-only`), and **two projects that were in neither list**:
`ai-engineering-academy/site` and `real-estate-agent-photo-app/pipeline` are
readable, but their deployment mode resolves to `unknown`, so no finding in
them can be suppressed on the grounds that its surface is not deployed. They
are reported as `analysed-no-deployment-mode` rather than folded into
"analysed", because the reachability narrowing this tool sells is not being
applied to them and that is invisible from a finding count of zero. They are
also the answer to a discrepancy sitting in this README the whole time: the
accuracy note said *nine* products, the validation table showed *seven* rows,
and nothing reconciled them.

### The accuracy note was overstating its own coverage

It read "hand-verified … across **all seven npm products in this portfolio**."
There were 18 npm manifests here and, at the time, 9 this tool could read (now
16 — see [pnpm is now analysed](#pnpm-is-now-analysed-2026-08-23) below). The
verified figure (0 wrong suppressions in 53 distinct claims) is unaffected —
that hand review covered what it covered — but the sentence framing it claimed
the sample was the whole portfolio when it was 7 of 18, which is an error in
the direction that flatters the tool. Corrected, with the three counts pinned
to `coverage-2026-08-23.json` by `tests/test_discovery.py::TestCoverageCitations`
so a stale figure fails the build instead of being quoted at a buyer.

### Limits of the walk itself

- **Refusing loudly is not covering — but pnpm is covered as of 2026-08-23.**
  This paragraph originally read *"This does not read pnpm or yarn lockfiles.
  retail-pilot-intel is still unanalysed; it is now unanalysed in writing."*
  `src/triage/pnpm.py` closes the pnpm half of that: `retail-pilot-intel`'s
  `pnpm-lock.yaml` is `lockfileVersion: '9.0'`, and this tool now reads that
  format — every one of its seven workspace members walks to `ANALYSED`,
  taking this repository's own analysed count from 9/18 to 16/18 (see
  [pnpm is now analysed](#pnpm-is-now-analysed-2026-08-23) below). Yarn
  remains unread; a yarn lockfile is still refused with `yarn-lockfile`.
- **The npm-workspace rule is fixture-tested only.** A member with no lockfile
  of its own counts as covered when an ancestor's lockfile declares it as a
  workspace entry, and deliberately *not* when only the root manifest's
  `workspaces` glob claims it — a stated intention is not a resolved dependency
  set. No npm workspace exists in this repository, so that path has unit tests
  and no out-of-sample evidence.
- **Two of the nine refusals are not products.** `a11y-axe-recall` and
  `a11y-delivered-contrast` are research harnesses with a manifest and no
  lockfile. "Half" is the honest repository-wide number, since a walk cannot
  know which manifests their owner considers products; counting only the 16
  under `ventures/`, 9 are readable and 7 are refused, and the whole of that 7
  is still the one pnpm venture.

## pnpm is now analysed (2026-08-23)

`retail-pilot-intel` was, until this pass, the one venture no record from this
tool had ever said anything about: seven manifests, refused with a single
reason (`pnpm-lockfile`) that meant "this tool cannot read this format at
all". `src/triage/pnpm.py` reads `pnpm-lock.yaml` (major version `9`, the one
this repository's own venture uses) into the same
`InstalledPackage(name, version, path, dev, optional)` shape `lockfile.py`
produces for npm, so nothing downstream — `engine.py`'s suppression rules,
`evidence.py`'s rendering, the CLI — needed a pnpm-specific branch.

The two formats need genuinely different reasoning to get there, not a shared
parser with a format switch. npm keeps a `dev` flag *per install location*,
because the same name+version can sit at more than one path with different
reachability (the `postcss` worked example the build-surface section above is
built on). pnpm de-duplicates globally by content address — one node per
`name@version(peer-suffix)`, called a *snapshot* — so there is no stored `dev`
flag to read; whether a snapshot is production or dev-only is a property of
*which of an importer's own `dependencies`/`devDependencies` roots reach it*,
computed by graph traversal rather than a field lookup. And pnpm's `importers`
map keeps one entry per workspace member with its own `dependencies` and
`devDependencies`, cross-referencing other members with a `link:../other`
version rather than a snapshot key — `retail-pilot-intel`'s `packages/pos`
depends on the local `packages/schemas` this way, and only `schemas`' own
*production* dependencies (it happens to have none; only `devDependencies`)
should propagate to a consumer.

Run against this repository with `--repository .`, the walk now reports **16
of 18** npm projects analysed, up from 9 — every `retail-pilot-intel` importer
(`.`, `apps/docs`, `apps/portal`, `packages/analytics`, `packages/edge`,
`packages/pos`, `packages/schemas`) resolves, each with its own dependency
list rather than one merged report for the whole workspace, which is what
pnpm's per-importer lockfile structure makes possible and npm's flat
`packages` map does not. The two remaining refusals
(`portfolio/research/a11y-axe-recall`, `portfolio/research/a11y-delivered-contrast`)
are unrelated research harnesses with a manifest and no lockfile at all.

That 16/18 figure was, until now, only reproducible by running `--repository`
by hand: `run_repository_coverage.py` — the standalone script that produced
the committed `coverage-*.json` this README's figures cite — dispatched every
lockfile through the npm-only parser regardless of format, so pointing it at
this repository raised `json.decoder.JSONDecodeError` on the first
`pnpm-lock.yaml` it reached rather than reporting the refusal. It duplicated
`cli.py`'s pnpm-or-npm dispatch instead of calling it, and the duplicate
silently fell behind when the pnpm branch was added to one copy and not the
other — the same drift this probe's coverage work exists to catch, here
pointed at its own tooling. Fixed by having both call the same dispatch rather
than maintaining two copies of it (one function, `cli.resolve_project`, since
the pass below); `coverage-2026-08-23.json` is the
first committed measurement taken since, and is what `PORTFOLIO_MANIFESTS_ANALYSABLE`
(now 16) and `tests/test_discovery.py::TestCoverageCitations` are pinned to.
`coverage-2026-08-22.json` is kept as the historical pre-pnpm artifact rather
than deleted.

**What this does not yet do:** there is no pnpm equivalent of `graph.py`'s
build-surface rule (the `next` → `postcss` reasoning). That rule only ever
moves a finding *out of* "shipped", so its absence cannot produce a false
suppression on a pnpm project — it can only under-suppress relative to an
equivalent npm project, which is the safe direction this tool always fails
towards. **Closed the same day — see [the section
below](#what-the-pnpm-reader-was-still-missing-2026-08-23).** And unlike the
npm side, this module's precision has not been
checked against a hand-labelled advisory set the way `eaa-wcag-triage` or the
`wrong-suppression-verification-2026-08-21.json` sample was — its test suite
(`tests/test_pnpm.py`) is structural (synthetic lockfile shapes plus the real
`retail-pilot-intel` lockfile as a smoke test), not an accuracy citation.
Treat pnpm output as sound, not yet validated the way the npm figures above
are. That half stands, and the section below measures how much wider it made
the gap.

## What the pnpm reader was still missing (2026-08-23)

The section above landed the reader and named three things it did not do. Two
of them turned out to be code rather than research, and this pass is those two.
Written by a second session the same hour, which had built its own version of
the same reader before the first one merged — the duplicate-work pattern
`CLAUDE.md` documents, resolved by keeping the merged implementation and
porting onto it rather than opening a rival pull request. A *third* session was
working on the same probe in the same hour; where its work overlaps this one,
the sections below say so and keep its version.

### The build-surface rule now fires on a pnpm project

It needed no pnpm-specific version. `BUILD_ONLY_EDGES` is keyed on package
**names**, so all the rule wanted was a graph — and the reader was already
walking every edge it needed, then discarding them and returning only the
reachable set. `_traverse` now records them, and `next → postcss → nanoid`
suppresses transitively through a pnpm lockfile, with the root-project guard
intact, pinned by tests.

One thing pnpm made awkward, and it is the kind of failure worth naming because
it is silent in the wrong direction. `DependencyGraph.name_of` reads a package
name off the end of an install *path*, which is what npm's locations are.
pnpm's are content identities — `react-dom@19.2.8(react@19.2.8)` — where the
name is not the last segment of anything, so that heuristic returns the whole
key, every `BUILD_ONLY_EDGES` lookup misses, and **the rule stops firing without
failing**. `DependencyGraph` gained a `names` map the builder fills in, so the
name is stated rather than guessed.

On this repository this changes nothing measurable: `retail-pilot-intel` is
Vite, not Next.js, so no named edge applies. It is a capability, not a result,
and the counts below are unmoved by it.

### An edge the reader cannot follow no longer disappears

This is the failure deriving dev-ness introduces and reading npm's stored flag
cannot. If an edge is lost, a package looks **less** reachable than it is —
which is a false suppression, the one outcome this probe exists to avoid.

Two edges could be lost. A `link:` pointing outside the workspace resolved to an
importer key that is not in the map, and the whole subtree behind it silently
vanished. And a dependency resolved through a tarball or git URL named no
snapshot, so nothing behind it could be walked. In both cases the reader carried
on with a quieter answer and said nothing.

Now each forces every install of the package it named onto the production graph,
and the names are printed in the record under *"the dependency graph read here
is incomplete"*. The test that matters is the one that would have gone wrong: a
production dependency resolved through a URL whose only *followable* path runs
through a `devDependency` reads as dev-only under the old behaviour, and every
finding on it is suppressed.

On this repository the guard never fires — all seven importers resolve with zero
unfollowable edges, asserted by a test — so the committed counts are a narrowed
answer rather than a widened one.

### Two defects a third session found first

This session's own pass found the same two things the section above already
records, and got there second: `PORTFOLIO_MANIFESTS_ANALYSABLE` stale at `9`
while the walk returns `16`, and `run_repository_coverage.py` throwing a JSON
decode error on the first pnpm lockfile it reached. **#661 landed both while
this was being written**, which is three sessions on one probe in one hour and
is the pattern `CLAUDE.md` documents rather than a coincidence worth
celebrating. Their fix stands; this pass keeps it and folds the two dispatch
helpers it introduced into the single `cli.resolve_project` the graph work
below needs anyway, so there is still exactly one copy of the dispatch — which
was #661's own point.

What is added on top: the committed measurement now records each project's
`lockfile_format` and its unfollowable edges, and the accuracy note says what
the corrected `16` does *not* mean — see the last section below.

### `--project` could not read a pnpm project at all

`--repository` read pnpm; `--project` looked only for
`<project>/package-lock.json` and exited 2. That is the entry point
[`action.yml`](action.yml) invokes, so the shipped GitHub Action could not
analyse a pnpm project. It now searches the project directory and each parent
for either lockfile, nearest wins — which is also what a workspace member needs
under *either* package manager, since neither puts a lockfile in the member —
and resolves the importer key from the project's path relative to the lockfile,
refusing loudly if that key is not one the lockfile declares. Answering for the
wrong importer would be a wrong record, not a partial one.

`optional` was also hardcoded `False`; pnpm records it per snapshot and the
reader now reads it.

### The numbers, and the one that did not move

| | npm subset | pnpm | total |
|---|---:|---:|---:|
| projects | 9 | 7 | 16 of 18 |
| components | 3,879 | 485 | 4,364 |
| findings | 132 | 2 | 134 |
| deployed | 30 | 0 | 30 |

**The npm subset reproduces the committed 2026-08-22 run field for field**, and
a test asserts that against both files rather than the README claiming it. That
is what makes this a coverage change and not a re-measurement: had a number
moved on a project that was already readable, the two would have to be argued
apart.

One thing does move if you re-run `run_portfolio_sample.py` today, and it is
not either pnpm pass. Against a freshly downloaded feed, one `next` advisory
lands in `server-surface:server-functions` where the 2026-08-21 run had it in
`server-surface:middleware`, on both static-export products. Every total is
unchanged (132/30, per-project rows identical) and every module on that path —
`lockfile.py`, `graph.py`, `surfaces.py`, `advisories.py`, `engine.py` — is
untouched by either pnpm change, so the cause is the advisory's own text being
republished between the two dates. Recorded here because a reader diffing the
two validation files would otherwise have to work that out themselves.

The venture's two findings are both `esbuild` 0.25.12 / `GHSA-gv7w-rqvm-qjhr`,
on `apps/docs` and `apps/portal`, each suppressed `dev-only`. The advisory
describes esbuild's development server; esbuild is here only underneath `vite`,
which both apps declare as a `devDependency`. The suppression and the advisory
agree about the same obvious fact, which is where a suppression is worth least —
so the honest reading of "0 deployed findings across a venture that was
invisible yesterday" is that **this corpus barely exercises the tool**, not that
anything was cleared.

All seven importers land in `analysed-no-deployment-mode`, because deployment
detection is Next.js-specific and these are Vite apps: the `dependency-path`
rule fires, the surface rule cannot. **9 of the 16 readable projects are now in
that weaker state, up from 2 of 9.** Reading a lockfile made the venture
visible, not narrowed.

**And the verified sample did not move with the readable count.** The
wrong-suppression rate this record prints (0 wrong in 53 distinct claims) was
hand-reviewed across npm projects only. Readable went 9 → 16; hand-verified
stayed at 7. **The gap between what this tool reads and what anyone has checked
by hand is wider after this pass than before it**, and the accuracy note now
says so in the record rather than letting 16-of-18 read as 16 verified. The pnpm
dev classification is derived, which is exactly the kind of claim that earns a
hand review and has not had one. A session with a pass to spend on this probe
should spend it there, not on a third lockfile format.

**No score moved.** Nothing here touches `time_to_revenue` or `distribution`,
and closing a gap the previous pass declared, plus fixing two stale figures the
previous pass introduced, is not a result worth a point.

## Usage

```bash
pip install -e .
npm-reachability-triage --project ./my-app --output-dir ./record
```

On a repository with more than one npm project, scan the repository rather than
a project — the record then leads with what it could not read:

```bash
npm-reachability-triage --repository . --output-dir ./record
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

- npm's `package-lock.json` v2/v3, and pnpm's `pnpm-lock.yaml` major version
  `9` — the version this repository's own pnpm venture uses; a different pnpm
  major version is refused (`pnpm-lockfile`) rather than assumed compatible. A
  v1 npm lockfile carries no per-location `dev` flag, so the analysis is
  impossible and the tool refuses rather than degrading to name-level
  matching. A yarn lockfile is not read at all. `--repository` names every
  refusal by reason rather than omitting it silently — see [the coverage
  section](#half-of-this-repository-was-never-scanned-2026-08-22) and [pnpm is
  now analysed](#pnpm-is-now-analysed-2026-08-23).
- ~~The pnpm side has no build-surface rule yet~~ — closed 2026-08-23; a pnpm
  project now gets the same rules an npm one does. What remains is that its
  dev-only classification is *derived* rather than read, so an edge the reader
  cannot follow widens the answer and is named in the record.
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
python3 -m pytest                            # 282 tests, no network required
python3 run_portfolio_sample.py <osv.zip>    # re-run the validation
python3 run_repository_coverage.py <osv.zip> # re-measure repository coverage
```

The test suite is weighted towards proving suppression requires evidence:
`tests/test_engine.py::TestUncertaintyNeverSuppresses` covers every path where
an unparseable version, an undetermined deployment mode, or a low-confidence
signal must fall through to *shipped*.
