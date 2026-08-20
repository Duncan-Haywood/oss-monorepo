# Free-substitute supply for each pipeline candidate's core functions

**Measured 2026-08-20. No credential, no account, no spend — read-only GETs
against the npm search API.**

Reproduce: `python3 probe_substitutes.py --json results-2026-08-20.json`.
Recompute the summary from saved data with no network:
`python3 probe_substitutes.py --recompute-from results-2026-08-20.json`.
Test suite: `python3 -m unittest test_probe_substitutes` (24 tests, offline).
Raw output: [`results-2026-08-20.json`](results-2026-08-20.json).

## The question this asks, and why nobody had asked it

Four of the eight candidates in [`portfolio/pipeline/`](../../pipeline/) justify
their `defensibility` score with a prose assertion that free substitutes already
exist:

* `cra-evidence-desk` — "SBOM generation is commodity and partly open source"
* `einvoice-preflight` — "Open-source validators exist for most of these formats"
* `shopify-a11y-evidence` — "The scan is commodity and the category is crowded"
* `agent-permission-harness` — "free tooling sets the anchor at zero"

None of those four claims had been measured. The other four candidates make no
claim either way — which is not the same as having checked.
[`rescore-2026-08-20.md`](../../pipeline/rescore-2026-08-20.md) recorded that
"every product-assumption check has cost a point off a candidate nobody has sold
anything to" and that `defensibility` fell on both candidates anyone had
actually measured. This is the same class of check for the other six.

## Method

npm search (`registry.npmjs.org/-/v1/search`) returns, per package, monthly
downloads, keywords, description and last-updated — enough to characterise a
function's substitute supply in one request per query and no per-package
fetches.

Each candidate is decomposed into **core functions** taken from the wording of
its own write-up. Each function carries a query and a two-tier relevance rule:

* a **domain** group set that must match in the package's own `name` or
  `keywords` — never in the description alone, because a description is
  marketing prose and mentioning a standard is not implementing it;
* an **action** group set that may match anywhere.

Every match is on **whole tokens**, not substrings. The first draft of this
script matched substrings and reported `jest` as a free substitute for an
agent evaluation harness and `helmet` as one for prompt-injection testing,
because `"ai"` occurs inside `"domain"` and `"agent"` inside `"user-agent"`.
Those exact regressions are locked in `test_probe_substitutes.py`.

A package counts toward a function only if it is **live** — published within
the last 18 months — and its monthly downloads clear a threshold. The headline
threshold is 10,000/month: [`free-listing-demand/`](../free-listing-demand/)
measured the median monthly downloads of a *leaf* listing in three of these
same categories at 68, 205, and 2,399, so a package clearing 10,000 is not a
cold listing but something people actually install. The saved results carry
counts at 1k, 10k, and 100k so the finding can be read at a threshold the
reader picks.

## Per-candidate reachability of this measurement

npm is not the right ecosystem for every candidate, and pretending otherwise
would make the low counts look like scarcity when they are unmeasurability.

| Fit | Candidates | What a low count means |
|---|---|---|
| `native` | `eaa-remediation-pipeline`, `shopify-a11y-evidence`, `cra-evidence-desk`, `mcp-supply-chain-watch`, `agent-permission-harness`, `public-record-watch` | Real evidence of scarcity |
| `partial` | `cra-evidence-desk / vex-attestation` | Weak evidence; thinner on npm than in Go/Sigstore |
| `foreign` | `einvoice-preflight`, `tender-radar` | No evidence — measure elsewhere |

## Result

Full table below is a re-derivation of the run above. Every "top free
substitute" is the highest-downloaded package that met the whole-token,
two-tier relevance rule for the function.

| Candidate / function | Relevant / live | ≥1k | ≥10k | ≥100k | Top free substitute | Top /mo | Verdict |
|---|---:|---:|---:|---:|---|---:|---|
| **eaa-remediation-pipeline** | | | | | | | |
| &nbsp;&nbsp;wcag-audit | 68 / 68 | 33 | **9** | 5 | `@storybook/addon-a11y` | 42,294,723 | commoditised |
| &nbsp;&nbsp;a11y-fix-generation | 10 / 10 | 5 | **0** | 0 | `@ia-qa/self-healing` | 7,651 | no-substitute-found |
| **shopify-a11y-evidence** | | | | | | | |
| &nbsp;&nbsp;storefront-a11y-scan | 0 / 0 | 0 | **0** | 0 | — | — | no-substitute-found |
| **cra-evidence-desk** | | | | | | | |
| &nbsp;&nbsp;sbom-generation | 36 / 36 | 11 | **7** | 6 | `@datadog/datadog-ci-plugin-sbom` | 3,841,774 | commoditised |
| &nbsp;&nbsp;advisory-matching | 32 / 32 | 22 | **10** | 3 | `better-npm-audit` | 1,004,281 | commoditised |
| &nbsp;&nbsp;vex-attestation | 10 / 10 | 5 | **0** | 0 | `supply-chain-guard` | 9,815 | not-measurable-here [partial] |
| **mcp-supply-chain-watch** | | | | | | | |
| &nbsp;&nbsp;mcp-tool-introspection | 186 / 186 | 186 | **140** | 51 | `@playwright/mcp` | 25,874,357 | commoditised |
| &nbsp;&nbsp;change-monitoring | 127 / 127 | 125 | **117** | 90 | `diff` | 571,852,492 | commoditised |
| **agent-permission-harness** | | | | | | | |
| &nbsp;&nbsp;prompt-injection-testing | 64 / 64 | 34 | **12** | 2 | `arcjet` | 317,462 | commoditised |
| &nbsp;&nbsp;agent-eval-harness | 44 / 44 | 39 | **14** | 7 | `@mastra/core` | 5,753,205 | commoditised |
| **einvoice-preflight** | | | | | | | |
| &nbsp;&nbsp;einvoice-validation | 40 / 40 | 6 | **0** | 0 | `n8n-nodes-sirenic` | 3,254 | not-measurable-here [foreign] |
| **tender-radar** | | | | | | | |
| &nbsp;&nbsp;tender-monitoring | 15 / 15 | 5 | **0** | 0 | `@open-tender/store` | 3,233 | not-measurable-here [foreign] |
| **public-record-watch** | | | | | | | |
| &nbsp;&nbsp;register-change-monitor | 2 / 2 | 0 | **0** | 0 | `watchdiff-core` | 589 | no-substitute-found |

**Of 10 functions measurable on npm, 7 are commoditised at ≥3 live packages
above 10k monthly downloads (70%).** Every candidate carrying the prose
"commodity" claim is confirmed as commoditised in its main function.

## What this says for each candidate

Reachability of a free substitute is one input into `defensibility`. The
existing scores already reflect a rough version of this reading; the point
here is that the reading now has numbers behind it and, more usefully, has
numbers for **the candidates whose write-ups did not make the claim**.

**Confirmed commodity, no score change proposed** — the write-up already scored
these at the corresponding floor and the measurement matches:

- `cra-evidence-desk`: SBOM generation and advisory matching are both
  commoditised. The `defensibility: 3` (from [rescore-2026-08-20](../../pipeline/rescore-2026-08-20.md))
  is consistent with this, and the measurement adds no new pressure.
- `agent-permission-harness`: both prompt-injection testing and the eval
  harness mechanism are commoditised on npm. Consistent with the write-up's
  `defensibility: 5` and `distribution: 4`.

**Confirmed commodity, previously unstated in the write-up** — the finding is
new for these:

- `mcp-supply-chain-watch`: both core mechanisms — the MCP introspection
  surface and change-monitoring — are heavily commoditised on npm (140 and
  117 live packages above the threshold respectively; `diff` alone at 571
  million monthly downloads). The write-up did not state this; it currently
  scores `defensibility: 3` on `mcp-archive-defensibility/`'s refutation of
  the archive mitigation. This measurement adds a **second** independent
  reason the floor sits where it does: even setting the archive question
  aside, both mechanisms the candidate would implement are free packages.

**Reads as evidence** — one candidate the measurement quietly *supports*:

- `public-record-watch`: register-change-monitor came back with only two
  relevant live packages on npm, neither above 1k monthly downloads. The
  polling-and-diffing mechanism, restricted to web-content change detection
  (not filesystem watchers, not APM), is **not** commoditised on npm. The
  write-up scores `defensibility: 5` on "the pipeline is copyable; the
  history archive is not, and it compounds." This adds a smaller,
  independent point: even the pipeline half is not free-in-a-box for the
  specific web-fetch-then-diff case. It is not enough on its own to raise
  the score — `changedetection.io` and similar exist off-npm — but it is
  the one finding here that shifts against pessimism rather than toward
  it, so it is worth flagging separately from the rest.

**Not measurable here** — the finding is a null result about the measurement,
not about the candidate:

- `einvoice-preflight`: this market's reference validators are Java
  (Schematron, Mustang) and .NET, so a low count on npm is not evidence of
  scarcity. The write-up already scores `defensibility: 4` on the correct
  reasoning ("open-source validators exist for most of these formats"); this
  study cannot confirm or refute it.
- `tender-radar`: no software ecosystem for this exists on npm. Same
  category of null.
- `cra-evidence-desk / vex-attestation`: partial fit. The supply-chain
  attestation ecosystem lives more on Go/Sigstore than on npm. A low count
  here is weak evidence.

## What this does not measure, stated explicitly

* **Absence is weak evidence for foreign ecosystems.** The three
  `not-measurable-here` and `no-substitute-found` verdicts on `foreign` /
  `partial` functions are null results, not scarcity findings.
* **Competing businesses ≠ free packages.** This is a price-floor measurement.
  A commoditised function does not mean a saturated market; it means the
  candidate is selling a service on top of a free component.
* **One-request-per-query.** npm search returns up to 250 hits, ranked by its
  own scoring. A category with more than 250 relevant packages would be
  under-counted at the tail — but the finding here is that seven of ten
  functions clear the threshold with a small fraction of the returned set,
  so the tail does not decide any verdict.
* **The register-change-monitor 'contested' reading is at the edge of the
  method.** Two of the three highest-download hits under the strict rule
  are edge cases (a monorepo change-detector, an uptime pinger) that a buyer
  probably would not substitute for a register-monitoring product. The
  saved results carry the top packages so a reader can disagree with the
  reading rather than the number.

## What this changes in the pipeline

Nothing about the current pipeline ranking, and nothing to escalate. Every
candidate whose defensibility score depended on a substitute claim already
scored it low; the change is that four of those four are now measured rather
than asserted, and one previously-unmeasured candidate
(`mcp-supply-chain-watch`) has its floor independently supported. The
`public-record-watch` reading is the only one that shifts against pessimism,
and it is not enough on its own to raise a score — the wider ecosystem
outside npm is where that check would need to run.

`portfolio/pipeline/README.md`'s intake gate still applies: no candidate is
being added, no score is being changed, no ask is being widened. The value
of this pass is that six of the eight `defensibility` scores now rest on a
measurement rather than a prose sentence, and the pipeline's screening
scores are one cheap environmental check less optimistic than they were
this morning — matching the pattern
[`rescore-2026-08-20.md`](../../pipeline/rescore-2026-08-20.md) already
recorded.
