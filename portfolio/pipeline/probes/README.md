# Probes

Executable probes for candidates in [`portfolio/pipeline/`](../README.md).

A candidate write-up is an argument. A probe is the smallest working thing that
tests the argument's weakest claim. Neither is a venture: a candidate still
graduates only by someone writing `ventures/<name>/VENTURE.yaml`, and nothing in
this directory changes a score or creates a `ventures/` entry.

This directory exists because the pipeline had accumulated eight scored
candidates, ~20 research write-ups, and **no executable artifact for any of
them**. [`distribution-first.md`](../distribution-first.md) asked four times
over for "one probe to a real buyer," and
[`channel-inventory.md`](../channel-inventory.md) established that building a
free listing needs no credential and no capital — only publishing does. The gap
was therefore never permission or budget. Nobody had built one.

That last sentence is right about why this directory exists and wrong about what
happens next. `channel-inventory.md`'s own refutation table measures every
mapped channel as `EGRESS_DENIED` or `SCOPE_DENIED`, so a built probe is not one
approval away from a listing — publishing is blocked by network policy and app
scope, which approval does not change. Build probes here because they make a
candidate's weakest claim testable, not because a listing follows.

## What is here

| Probe | Candidate | Status |
|---|---|---|
| [`npm-reachability-triage`](npm-reachability-triage/) | [`cra-evidence-desk`](../candidates/cra-evidence-desk.md) | Built, tested (197 tests), validated against the manual review. **Gained a `build-surface` rule on 2026-08-21**, the step its own README specified and had left unbuilt, and in doing so **refuted that README's claim** that the `nanoid` findings needed call-graph analysis. The four surviving PostCSS advisories were never a text problem: the install location keeping them alive is a copy vendored *inside* `next`, invoked by `next build` and never by `next start`, and nothing in an advisory says that — the lockfile's production dependency edges do. Reasoning over those edges (with Node's nearest-ancestor resolution reimplemented so an edge names the copy actually loaded) suppresses on **named `(dependent, package)` claims** a reviewer can reject one at a time, propagates transitively — which is what settles `nanoid`, whose only production dependent turns out to be that PostCSS and not `next` — and is guarded twice over: a package the project declares or imports itself is never build-only. Residual on the static-export products falls **11 → 2**, reaching the manual review's ~98%, and the two that remain are the known true positive plus one advisory left reported on purpose rather than override the `xss` veto. It is also the first rule that moves the **server-rendered** products (0% → 22–80%), because a package the artifact never loads is absent from a running server too — a claim the manual review never tested, so it is new rather than corroborated. Not published, and not publishable on approval alone: its mapped channel (GitHub Marketplace) measures `SCOPE_DENIED`, so it is blocked on Ask 1 (app scope), not on publish approval. |
| [`eaa-wcag-triage`](eaa-wcag-triage/) | [`eaa-remediation-pipeline`](../candidates/eaa-remediation-pipeline.md) | Built, tested (112 tests), validated against a hand-labeled fixture set (precision/recall 1.0). **Reconciled 2026-08-21 against the portfolio's other WCAG engine** (`portfolio/research/a11y-evidence-record/audit.py`), which had never been run on the same input: each engine was silently blind to two checks the other had. This probe gained 1.4.2 and 1.4.4, dropped a false-positive class on `aria-hidden` controls, and gained a coverage-catalog invariant; fixture validation is byte-identical. See [`a11y-engine-agreement`](../../research/a11y-engine-agreement/). **Run out of sample for the first time on 2026-08-21**, over 118 pages of this portfolio's own built venture output: precision **0.821–0.881** against 1.0 on the fixtures it was written beside, with every false positive traced to markup the *build tool* emitted rather than a venture — see [`a11y-own-sites`](../../research/a11y-own-sites/), which also fixed the 30 blocking defects it found in venture source. Implements the candidate's blocking-vs-degrading triage and its own coverage statement. **Gained an `<iframe>` naming rule on 2026-08-21** (7 tests; fixture validation byte-identical): it had no frame rule at all, while the sibling engine has flagged untitled frames since it was written. The gap survived four measurement passes because the repository's only `<iframe>` is the map `local-site-studio` puts on every page it *delivers*, and that route appears in no build — so no build-directory corpus could reach it. Found by [`a11y-generated-sites`](../../research/a11y-generated-sites/), which rendered the delivered product for the first time, found it clean under both engines, and found a detection gap in each of them. **Gained colour contrast (1.4.3) on 2026-08-21**, the criterion this probe — and every other accessibility pass in the repository — had recorded as `manual` since it was written, with the note *"needs computed colour, which needs CSS and rendering."* The second half of that was never tested, and it is false: a delivered page ships the stylesheet that names its colours, and the arithmetic to a contrast ratio is exact. What the note really described was **the corpus**, not the criterion — every accessibility corpus this portfolio had ever measured was HTML-only, so no engine had ever been handed a stylesheet, and a property of the sampling read for five passes as a property of the standard. Measured over 85 built pages and 10,657 text elements: **98.76% decidable from the artifact alone**, with the 1.24% residue reported per element under a named reason (`conditional-background`, `opacity-in-chain`, `conditional-color`) rather than the whole criterion being declined. Two further findings fell out. `prefers-color-scheme` has two states and the stylesheet spells out both, so the page owes 1.4.3 in each: scoring the light scheme alone finds 581 failures on these pages and scoring both finds **965** — the 384-element gap is `text-gray-500` with no `dark:` counterpart inside a `dark:bg-gray-800` container, which every single-pass checker reports clean. And a gradient background, the canonical reason a static checker gives up, is decidable exactly: CSS interpolates each channel linearly and luminance is monotonic in each, so the ratio is bracketed by the stops and only a straddling bracket is undecidable. The scan found this portfolio shipping the defect it plans to bill for finding — 965 decided AA failures, **all still open on `main`** and recorded shape by shape. The remediations are diagnosed but held: `local-site-studio`'s 21 and `ai-first-markets`' 333 are written and rebuild-verified but are venture source, so they wait on the account owner in [#523](https://github.com/Duncan-Haywood/monorepo-projects/pull/523); `print-atelier`'s 611 are 73 component-level colour decisions rather than a substitution, and are unwritten. The committed results file measures `main` — regenerated against its own build rather than inheriting the post-fix copy, which re-derived the whole measurement from a second checkout. See [`a11y-contrast-decidability`](../../research/a11y-contrast-decidability/). Not published; not a graduation — the candidate's real experiment needs live shop themes and a contractor. |
| [`agent-permission-harness`](agent-permission-harness/) | [`agent-permission-harness`](../candidates/agent-permission-harness.md) | Built, tested (61 tests), run over all 31 workflow files in this repository. **The only probe here written against the portfolio's own infrastructure rather than an external corpus**, because that candidate's own mitigation prescribes exactly that ("build internally for this portfolio's own agents") and no pass had taken it literally. **Refutes the shape of the product the candidate describes.** The candidate sells attack replay in CI — fire injection and tool-permission attacks at a running agent, fail the build when a tool fires that should not have — and scores `ai_leverage: 9` on "attack generation, mutation, and verdicting are model work end to end". The build that resulted contains **no model call at all**, and it found everything there was to find here: 13 findings across 3 of 31 files, every one decided from the artifact with nothing running, none requiring a running agent. The canonical GitHub Actions script-injection class found **zero** — the fleet workflow passes its one dispatch input through `env:` and regex-validates it, which is correct — so the finding that mattered could not be the famous one. It is this: **an agent's instruction set is not its `prompt:` input**, it is the closure of what that prompt directs it to read. The fleet's prompt is 52 fixed lines whose content is mostly reading orders (`CLAUDE.md`, every `ventures/*/VENTURE.yaml`, each venture's `AGENTS.md`, "heed them"), which resolve to **21 repository files**, every one `REPO_WRITE` and one merged pull request from saying something else, all read while the agent holds `contents: write`, `pull-requests: write` and two secrets. Replay tests 1 of those 21, and it is the one an attacker has least reason to write to; the closure takes ~60 lines of regex and glob and is invisible to replay by construction. Also found, and reported rather than fixed: the fleet workflow calls `.github/scripts/prepare-agent-prompt.sh`, which **is not in the repository** — guarded by a `-f` test, so the fallback runs, the job goes green, and what executes is not what the file reads as executing; the prompt is piped into `$GITHUB_OUTPUT` behind the fixed delimiter `PROMPT_EOF`; and three third-party actions receiving deploy secrets sit on mutable tags while the agent action itself is SHA-pinned. `ai_leverage` 9 → 8 (composite 7.0 → 6.875); verdict stays **park**, since nothing here touches time-to-revenue or distribution. Defensibility is argued down and deliberately **not** scored — three of the seven rules are covered by published open-source scanners, but confirming that R7 is not is a substitute-supply measurement whose egress is denied. Not published; the candidate's channel is developer tooling, which `channel-inventory.md` measures as denied in any case. |
| [`source-silence-detector`](source-silence-detector/) | [`public-record-watch`](../candidates/public-record-watch.md) | Built, tested (57 tests), backtested against [`register-change-rate`](../../research/register-change-rate/README.md)'s saved records and against the nine mirrors' full commit history. **Refutes the build requirement it was written to implement, then refutes its own first fix.** A per-source cadence threshold catches 0 of the 2 registers that went quiet. The first pass blamed thin history and prescribed a fallback (2 of 2, 11d, 10 nuisance alarm-days); fetching full history shows that was right by accident — the real defect is that a worst-gap anchor only ever loosens, so the same configuration on full history catches **0 of 2** with a 5.6-year threshold. A p99 quantile anchor is the fix: 1 of 2 at 8d latency and 1 nuisance alarm-day, with the miss shown to be undetectable rather than mistuned (14 of that source's 37 historical gaps are ≥ the silence it is asked to flag). **Then refutes that fix's setting too, on 2026-08-21**, via the held-out validation its own caveat asked for: replaying every historical gap gives 17 dormancy episodes instead of 2, and leave-one-source-out cross-validation keeps the anchor *family* (8 of 9 folds pick p99 under a tight nuisance budget; stable across every dormancy label from 60 to 365 days) while breaking the operating point — held-out recall is 6/17 (0.35) against 8/17 in sample, and reaching 14/17 costs 43 nuisance alarm-days per source-year. The sharp finding is arithmetic, not sampling: nearest-rank p99 **is** the maximum for any source with fewer than 100 closed gaps, so on `FDA/openfda` (37 gaps, 9 of the 17 episodes) the recommended anchor and the rejected one are the same integer — a 5.6-year threshold under a new name. No score moved. |

## The rules a probe here follows

Taken from [`channel-inventory.md`](../channel-inventory.md)'s "what this does
and does not license", and from the positioning constraints in
[`README.md`](../README.md):

- **No compliance claim.** Evidence, records and drafts. Never "you are
  compliant" — that is a warranty, and this portfolio does not sell warranties.
- **No payment, no personal data, no account requiring an identity artifact.**
- **Coverage limits stated in the product**, not buried in terms. A customer who
  believes coverage is total is the one who gets hurt.
- **Publishing is a separate decision from building.** A probe may be built and
  committed here freely; putting this portfolio's name on a public listing is
  the account owner's call.

## A note recorded here because it closes a standing question

`cra-evidence-desk` names EUVD integration as its wedge, and four passes
recorded that wedge as blocked after probing `euvd.enisa.europa.eu`.

That is the site host. The **API** is served from
`euvdservices.enisa.europa.eu` — documented at `euvd.enisa.europa.eu/apidoc`,
no authentication, endpoints `/api/search`, `/api/enisaid`,
`/api/lastvulnerabilities`, `/api/exploitedvulnerabilities`,
`/api/criticalvulnerabilities`, `/api/advisory`, `/api/dump/cve-euvd-mapping`
and `/api/kev/dump`.

Applying the rule from
[`feed-reachability`](../../research/data-reachability/README.md) — *probe every
channel a feed publishes, not just its canonical host* — this run probed that
second host for the first time. It is **also denied** (`connect_rejected` at
`$HTTPS_PROXY/__agentproxy/status`), and EUVD mirrors to no git or
object-storage channel.

The conclusion does not change, but its basis does: the wedge is now closed at
the address that actually serves the data, rather than assumed from the one that
serves the website. That is worth recording because the same class of error —
probing a canonical host and concluding "unreachable" — is what
`feed-reachability` was written to stop, and EUVD was the one feed nobody had
re-probed under the new rule.
