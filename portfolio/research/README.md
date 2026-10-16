# Research

Measurements, not proposals. Each subdirectory answers one question with data,
carries the script that produced it, and saves the raw results so the finding can
be re-derived without trusting the prose.

`portfolio/pipeline/` ranks candidate businesses. This directory tests the
factual premises those rankings rest on. The split matters because the pipeline's
write-ups are explicitly labelled *"secondary sources, unverified against primary
ones"* — good enough to rank candidates against each other, not good enough to
spend against. Everything here is the primary check.

> **Direction update, 2026-08-24.** Per [`../DIRECTION.md`](../DIRECTION.md), a
> new measurement earns a session's time only when its answer changes what gets
> *built* this week — and then the build is the session's output, not the
> write-up. This index has 30-odd directories and the portfolio has zero users;
> that ratio is the problem, not the answer to it. Read what is here (it is
> good, and re-deriving it is waste), then go ship a product
> ([`PRODUCT_PLAYBOOK.md`](../../PRODUCT_PLAYBOOK.md)). Usage data from a live
> product now outranks any probe you could write about a hypothetical one.

## House rules

Every script in this directory is read-only, standard-library only, takes no
credentials, publishes nothing, registers nothing, and cannot spend money. Most
support `--recompute-from <results.json>` so the summary can be re-derived from
saved data with no network access at all — which is how a reviewer checks a
claim without re-running the probe.

Findings are recorded at the confidence they were gathered at. A measurement
taken from this environment is a fact about *this environment* on the date
stamped in the filename; several of the findings below are network-policy
verdicts that the account owner can change with a settings toggle, and they say
so where that is true.

**Before adding a directory, read the one that already covers your question.**
The whole reason this index exists is that fourteen measurement passes over two
days re-derived each other's work, because each one's results were sitting in an
unmerged branch where the next one could not see them.

That failure is not only historical, and this index alone does not catch it.
`portfolio/research/a11y-evidence-record/audit.py` and
`portfolio/pipeline/probes/eaa-wcag-triage/` are two independent
accessibility-audit engines built for the same candidate, with overlapping check
IDs, and until this note neither referenced the other. Measurements here and
executable probes under [`portfolio/pipeline/probes/`](../pipeline/probes/) are
separate directories that answer overlapping questions — read both indexes
before building either.

**Amended 2026-08-21: that warning was right, and the cost was already on the
books.** Run on the same input for the first time, the two engines disagreed —
each was silently blind to two checks the other had, in opposite directions,
and neither listed the other's checks in its own coverage statement. Against
the only hand-labeled ground truth either has, `audit.py` scored recall 0.857
to the probe's 1.0. Closed, with the invariant that makes the next such gap
fail a test, in [`a11y-engine-agreement/`](a11y-engine-agreement/). The general
lesson is the one this section already states, now with a number attached:
duplicated tooling does not stay in agreement on its own.

**Amended again 2026-08-21: two engines agreeing is not the same as two engines
being right.** Both were reconciled against each other and against fixtures
written in this repository, and neither had ever been compared to anything
outside it. Compared to `axe-core` — a reference reachable the whole time, from
a host already measured reachable — **8 of 22 automatable A/AA criteria were in
neither engine's checked list nor its not-tested list**, six of them Level A,
including 2.4.1 Bypass Blocks. See
[`a11y-external-coverage-reference/`](a11y-external-coverage-reference/), which
also carries this pipeline's **first gate measurement**
(`liability_containment` 6 → 5 on `eaa-remediation-pipeline`). The lesson the
agreement work could not reach: a shared blind spot is invisible to
cross-checking between siblings, and only an outside reference finds it.

## 1. Is there demand, and does the product premise hold?

| Directory | Question | Finding |
|---|---|---|
| [`mcp-tool-drift/`](mcp-tool-drift/) | Do third-party MCP servers change their declared tool surface often enough to be worth monitoring? | **Yes, and not marginally.** 69% of sampled adjacent releases changed the declared tool surface, 29% removed a tool outright, ≥33% changed a tool description. De-risks the premise of pipeline candidate #3. **Amended 2026-08-22**, from two held-out corpora built by [`mcp-drift-watch`](../pipeline/probes/mcp-drift-watch/): the *rates* here survive, the classifier behind them does not. Its instruction-bearing share reads 7.2% / 7.4% / **5.4%** across three corpora and its precision 0.40 / **0.625** across the two that were scored — so the first held-out run's headline (a rate that reproduced while the labels did not) was itself only half right, and **a reproduced rate is not evidence of anything about the alerts**. Two of the five signal alternatives are also *dead patterns* rather than judgement calls: `\b( … \|important:\| … \|\.env\b\| … )\b` cannot close a word boundary after `: ` or open one before `.`, so `important:` has never fired on ordinary prose and `\.env` has never fired at all. Repairing the `important` alternative alone moves this corpus 7.2% → 7.9%; all three edits move it to 6.6%. The rules were deliberately not changed |
| [`free-listing-demand/`](free-listing-demand/) | What does a cold free listing actually get? | Median monthly npm downloads for a leaf listing: **68** (SBOM/CRA evidence), **205** (accessibility evidence), **2,399** (MCP supply chain). The median cold listing is close to invisible, and these are an upper bound on human adoption rather than an estimate of it |
| [`free-listing-demand/cross-registry-replication.md`](free-listing-demand/cross-registry-replication.md) | Is that concentration an npm artifact? | **No — it replicates on Packagist and RubyGems, and npm was the optimistic case.** Changing registry does not improve the discovery term, so "different channel, different regime" is tested and false in its general form |
| [`publisher-audience/`](publisher-audience/) | Does the audience have to precede the listing? | **Mostly, but not absolutely.** A cold publisher's odds of a category top-decile listing are **4.9%**, against **16.2%** for a publisher with existing usage — a 3.3× handicap, not a closed door. 27% of top-decile listings came from publishers with no other audience |
| [`free-listing-economics/`](free-listing-economics/) | What is a free listing worth, not just whether it is found? | Central-case revenue for a cold free listing is **$16–$145/month**, on an assumed ~2% conversion the study names as its own weakest input. Reports the revenue-per-download each percentile would need to clear a bar, so the claim is falsifiable by inspection |
| [`listing-monetization/`](listing-monetization/) | Do the listings that *win* discovery have any way to get paid? | **~92% have no price at all.** Of the monetised winners, roughly eleven of fifteen are organisations that arrived with their own distribution, and every observed price is charged somewhere other than the registry |
| [`mcp-archive-defensibility/`](mcp-archive-defensibility/) | Is `mcp-supply-chain-watch`'s pinned archive a scarce accruing asset, or public data? | **Public data on the half this environment can build.** The candidate's only named mitigation for its `defensibility: 4` floor is refuted, with no replacement found — which under `pipeline/README.md` rule 2 blocks it at the rubric level rather than merely scoring it low |
| [`cra-advisory-reachability/`](cra-advisory-reachability/) | Does `cra-evidence-desk`'s triage produce a signal a customer would pay for? | **64.6–66.0% false positives**, bimodal by deployment mode: ~0–4% on server-rendered apps, ~98% on static exports, which never ship the request-handling code most advisories describe |
| [`a11y-evidence-record/`](a11y-evidence-record/) | How much of the `eaa-remediation-pipeline` audit is automatable from templates alone? | **63.2% is undecidable without rendering or store data**; **70.4%** on the four checks where "undecidable" is even a possible answer. Two defect classes (unnamed buttons, unlabelled controls) carry **71% of blocking findings**; missing image alt is 5.6%. **Amended 2026-08-21:** ported `a11y-contrast-decidability`'s colour-contrast resolver to this engine's templates (finding 5), superseding a concurrent session's conclusion that the port "is not proposed here." Only **5.7%** decides — not the sibling engine's 98.76%, because only **9 of the same 22 pinned npm packages (41%) ship a `.css` file in the same tarball as their templates at all** (independently confirmed by both sessions' measurements); restricted to the ones that do, **10.5%** decides, one package at 100%, one at 69.4%. A corpus-coverage gap, not a resolver gap — closing it needs a render step feeding the sibling engine, named as a follow-up rather than built here |
| [`a11y-render-recovery/`](a11y-render-recovery/) | What does rendering actually recover from that undecidable share? | **50.5% is theme-recoverable** at build time with no store data; **11.0% requires per-store merchant data** (where empty alts become real blocking failures at that store); **38.5% is context-dependent** — undecidable even as to provenance from the template alone. "Almost all" splits into three shares, only one of which is a build step |
| [`a11y-theme-resolution/`](a11y-theme-resolution/) | The theme-recoverable share is a *ceiling*. What does it recover **to** — a pass, or a defect? | **A pass, overwhelmingly.** 68.5% of the 248 theme-recoverable undecidables resolve to a name that is present; **2.0% (5 of 248) are real blocking failures**. The build step is a coverage step, not a finding-generator. All five defects are one mechanically-detectable class (a `<label for>` whose target id the theme builds from an expression), and 64 of the 69 "cross-partial label" cases were in the same file all along — a fix both audit engines can adopt |
| [`a11y-engine-agreement/`](a11y-engine-agreement/) | This portfolio has **two** WCAG engines for the same candidate. Run on the same input, do they agree? | **No, and each was silent about it.** Each engine was blind to two checks the other had, in opposite directions, and neither listed the other's in its own coverage statement — so a record could not distinguish "checked and passed" from "never looked at". Against the only hand-labeled ground truth, `audit.py` scored recall **0.857** to the probe's 1.0, missing captions (1.2.2) and `aria-hidden` on a focusable control (4.1.2); the probe missed 1.4.2 and 1.4.4. All four closed, with a coverage-boundary invariant in each engine. The residual disagreement is **attribution** — two defects both engines catch but cite under different criteria — left open because settling it is a normative WCAG reading and the spec hosts are egress-denied |
| [`a11y-own-sites/`](a11y-own-sites/) | Both engines had only ever seen hand-written fixtures and npm theme tarballs. Run them on **this portfolio's own built pages** — do the ventures pass, and does the engine hold up out of sample? | **Out-of-sample precision is 0.821–0.881, against 1.0 on the fixture set**, and every false positive is markup the *build tool* emitted rather than a venture: 7 of 8 are Next.js's internal error shell (`quick-pick-survey` ships a correct `global-error.tsx` with `lang="en"` and is flagged anyway), 1 is a `display:none` control. A free qualification audit therefore needs a build-artifact filter before a stranger reads it. Engine agreement also falls from 2/3 fixtures to **91/118 real pages** (89/118 in the original snapshot; 2 pages relabelled to agreement by an unrelated venture-source fix), all 27 disagreements pure relabellings rather than missed defects — so `a11y-engine-agreement`'s "residual attribution divergence" in fact decides the criterion cited on **22.9%** of real pages. Of 55 confirmed defects, the 30 blocking ones in venture source are fixed in the same pass (8 unnamed icon buttons and 12 unlabelled controls in `print-atelier`, 10 pages pinned at 1× zoom in `quick-pick-survey`); 25 heading-order defects are recorded, not fixed. **Amended 2026-08-21:** this directory's own adapters never passed either engine a stylesheet, so 1.4.3 (contrast) was structurally incapable of firing on 115 of the 118 pages — the precision figure above describes only the 67 findings that bug left visible, not the corpus. Fixed and rebuilt: the same 118 pages now carry **780** findings, 743 of them 1.4.3 — 354 already known and pending a fix in #523, 611 already fixed same-day in #542, and **389 on `real-estate-agent-photo-app` and `photo-editing/docs-site`, corroborated by independent ratio recomputation, with no fix in progress anywhere in this repository**. See the directory's own README and `eaa-remediation-pipeline.md`'s amendment. **Amended 2026-08-22 (Finding 5): the build-artifact filter Finding 1 prescribed is built and measured.** The corpus was rebuilt from all 7 apps; it removes **exactly the 7 framework findings** the hand review identified (all 3.1.1) and keeps the **7 project `_not-found.html` pages** a filename-shaped filter would have deleted silently. Two obvious designs died in the building: one framework needs **two** markers (Next 16's `<html id="__next_error__">` vs Next 14/15's bare-`<html>` Pages Router document — the single-marker version passed its tests and caught 2 of 7), and the second shell's obvious marker `next-error-h1` is in **106 of 138** documents as inlined CSS, in 16 as a real element, of which 11 are the projects' own 404s. Record precision on the hand-reviewed denominator rises to **0.917–0.983** and the printed figure was deliberately left at 0.821–0.881. No score moved. The rebuild also reproduced the committed 2026-08-21 run field for field |
| [`a11y-generated-sites/`](a11y-generated-sites/) | Every corpus so far came from a build directory. `local-site-studio`'s *product* — the customer sites it generates — is rendered per request and appears in no build, so no audit had ever seen the thing being sold. Audit it. | **The delivered pages are clean (0 findings on 14 pages, both engines agreeing), and the defects were in the engines.** A mutation-based positive control — edit the customer's own page, check the rule fires — separates "your site is clean" from "our scanner could not read it": **7 of 8 removal mutations are exercised by this corpus and all 7 are caught**, the other 4 reported as *not exercised* rather than as passing. It found **a detection gap in each engine**, where `a11y-own-sites` found none in 118 pages: the probe had no `<iframe>` rule at all (and the repository's **only** frame is the map on every delivered page — the one element on the one route no build corpus can reach), and `audit.py` accepted a control wrapped in a text-less `<label>`. Both fixed here. It also gives both known relabellings a named cause: a skipped heading is 2.4.6 vs 1.3.1, an unnamed control is 1.3.1 vs 3.3.2, and those two account for all three rows of `a11y-own-sites`'s divergence table. The engines' out-of-sample failure mode is therefore **silent misses as well as false positives** — and unlike a false positive, nobody reading the record can tell |
| [`a11y-contrast-decidability/`](a11y-contrast-decidability/) | Both engines record colour contrast (1.4.3) as `manual` — *"needs computed colour, which needs CSS and rendering."* Five passes repeat it as settled. Is it true? | **No, and the reason nobody could tell is that every accessibility corpus in this repository was HTML-only** — no engine had ever been handed a stylesheet, so a property of the sampling read as a property of the criterion. Handed the CSS its own build emits, **98.76% of 10,657 text elements across 85 built pages decide from the artifact alone**, with the 1.24% residue named per element rather than the whole criterion declined. Two consequences. `prefers-color-scheme` has two states and the sheet spells out both, so a page owes 1.4.3 in each: the light scheme alone finds 581 failures here and both find **965** — the 384 dark-only ones are `text-gray-500` with no `dark:` counterpart inside a `dark:bg-gray-800` container, which every single-pass checker calls clean. And a gradient is decidable *exactly*, since channel-linear interpolation plus monotonic luminance brackets the ratio by its stops. The pass also found this portfolio shipping the defect it plans to bill for: 965 real AA failures, recorded shape by shape. `print-atelier`'s 611 (internal-only, no deploy workflow) were fixed and merged the same day (#542); `local-site-studio`'s 21 and `ai-first-markets`' 333 have rebuild-verified colour-token fixes waiting on the account owner in #523/#531, because they are venture source — **354 remain open on `main`**, not 965. The committed results file was regenerated against `main`'s own build rather than inheriting the post-fix copy, and in doing so re-derived the whole measurement from a second checkout |
| [`a11y-external-coverage-reference/`](a11y-external-coverage-reference/) | Both engines had only ever been checked against each other and against fixtures written here. Against an **outside** reference, what do they miss — and does that move a gate score? | **The pipeline's first gate measurement: `liability_containment` 6 → 5 on `eaa-remediation-pipeline`, composite 7.25 → 7.125, now sitting *on* the gate.** `pipeline/README.md` had recorded a gate measurement as blocked because the WCAG normative index needs `www.w3.org`, which is egress-denied. True, and beside the point: `axe-core` publishes its success-criterion tags to `registry.npmjs.org`, measured reachable twice — the denominator had a distribution channel nobody probed. Measured against axe-core 4.13.0's 22 automatable A/AA criteria: **8 were in neither engine's checked list nor its not-tested list** (6 Level A, including **2.4.1 Bypass Blocks**), confirmed by running defect markup through both engines rather than by diffing tables. The deeper finding is structural and is what moved the score: criterion-level disclosure hides most of the gap — **4.1.2, disclosed as `partial`, stands for 3 rules against the reference's 29**, and 1.1.1, disclosed as `automated`, for one family against 7. The 8 are now disclosed in both engines under a new `unimplemented` label, kept distinct from `manual` because they are decidable and the paid contractor step does not cover them — filing them as `manual` would have repeated the error 1.4.3 sat inside for five passes. No rule was implemented, and a test pins that separation. Also finds 4 criteria declined as needing a human that axe automates (costs margin, not accuracy). **Amended 2026-08-22 (Findings 5-6):** the catalog was built from `axe.getRules()`, which lists every rule axe *ships*, and the extraction dropped `enabled`/`experimental` — so a rule a default `axe.run()` never executes counted as evidence that an independent engine automates a criterion. Measured by running axe in Chromium rather than reading its rule list: **the denominator is 18, not 22**, and three of the eight (1.2.1, 1.3.4, 2.5.3) plus one of the four over-declined (2.5.8) rest on rules that ship disabled or experimental. Worse, **the 2.4.1 fixture was not a 2.4.1 failure** — it contained a `<main>`, which axe's `bypass` rule accepts, so the subtest proving the gap was real on the criterion the write-up singled out could not have failed. Finding 1 stands (the eight rows were genuinely absent from both catalogs); its severity was overstated, and the honest residue is **one** criterion axe reports by default that neither engine looks for: **1.4.1 Use of Color**. Four of the eight — the four axe does report — are now rules in `eaa-wcag-triage`. **Amended again 2026-08-22 (Finding 7):** for a few hours the implemented set was exactly "what a default axe run reports", and that coincidence was read as the rule deciding what to build. It is not — what the reference executes is evidence about the reference. **2.5.3 Label in Name is now a rule**, the first criterion either engine here decides that a default axe run does not report at all, built on its own catalog note ("decidable from the markup") rather than on axe's coverage. `STILL_UNIMPLEMENTED` is down to 1.2.1 and 1.3.4, and only 1.2.1 is there because the artifact cannot answer it. The test pinning the old two-way split is replaced by one asserting the direction that still holds and one asserting that the reverse containment is now false |
| [`a11y-axe-recall/`](a11y-axe-recall/) | `a11y-external-coverage-reference/` closed on the one number nothing here had ever measured: out-of-sample **recall** — the only figure on record was 1.0, on the three-page fixture set. Run axe-core itself, live, against the 118-page corpus. | **0.975** (39 of 40 axe-flagged, checked-criterion instances corroborated by at least one in-house engine), and the one miss is the same normatively-contested disabled checkbox `a11y-own-sites/` already recorded — not a fresh detection gap. Getting there required finding and fixing two measurement bugs first, the more consequential of which is a standing bug in a *merged* directory: loaded via bare `file://`, a prerendered page's linked CSS never resolves, so **`a11y-own-sites/`'s adapters call both engines with no stylesheet at all — 1.4.3 (contrast) was structurally incapable of firing across all 118 of that study's pages.** A naive first run, before either fix, measured recall at **0.200** — evidence for how easy a misleadingly bad recall number is to produce by accident, not evidence about either engine. **Re-run 2026-08-22** after four criteria became rules: universe 13 → 17, **recall unchanged at 0.975** — axe reports none of the four anywhere in the corpus, so widening the claim brought no new instances with it. The raw axe output reproduced the earlier run field for field across all 118 pages |
| [`a11y-delivered-contrast/`](a11y-delivered-contrast/) | `a11y-generated-sites/` audited the pages `local-site-studio` actually sells and reported 0 findings, validated by 14 mutations. Every mutation edits markup and contrast needs CSS — so was that zero a clean product, or a check that never ran? | **A check that never ran, over a product that turns out to be clean anyway.** Both engines were called with no stylesheet on a corpus that links none, and said so: their contrast tally read **1018 of 1018 elements undecidable**, in a field the harness never read, while its README published "clean under everything both engines can statically see". Given the stylesheet the pages are really served with: **0 failures over 1018 elements**, so the conclusion stands and now rests on a check. axe-core agrees at 0 violations and that is much weaker than it looks — it **declined 73.8%** of the same checks (772 of them "background could not be determined due to a background gradient"), which only the `incomplete` bucket reveals. The engines decided all 1018 not by the documented gradient bracketing but because **they could not see the gradient**: the shared CSS reader split selector lists on every comma, including the escaped commas inside Tailwind arbitrary-value class names, dropping those rules entirely — so backgrounds, the half of a ratio an element does not declare for itself, were the concentrated loss. Fixed; decidability falls **100% → 98.43%** as the engine gets honestly less confident, committed portfolio numbers unmoved |
| [`error-rate-disclosure/`](error-rate-disclosure/) | Every probe now has a measured accuracy number and renders something a customer reads. Does the second contain the first — and does that decide the `ethical_robustness` gate? | **No, four times out of four — the pipeline's second gate measurement, and the first time that gate has been anything but an estimate.** `eaa-remediation-pipeline` 9 → 6, `public-record-watch` 9 → 6, `cra-evidence-desk` 8 → 6, `agent-permission-harness` 9 → 7; none crosses the gate. Two probes have a committed error rate and neither prints it (precision 0.821–0.881; held-out recall 0.35), two have no customer-facing record module at all, and the one artifact that names the direction it errs in — *"a suppressed finding that should not have been is the failure this tool is built to avoid"* — has never measured the rate for that direction. The sharp finding is that **scope disclosure is not accuracy disclosure**: the most careful record in this repository labels every criterion, names every undecidable element by reason, and never says a finding in the list can be wrong, when 12–18% of them are not defects. And in three of four the undisclosed direction is the one that pays the operator, read off each candidate's own stated pricing. The detector for the fourth prints `MISSED` beside a source it failed to catch, in a table no subscriber sees. Mitigations are one line of rendering each, so the gap is disclosure rather than a business model that has to harm someone. **Amended 2026-08-21, in three later passes:** `eaa-wcag-triage` now prints both committed figures (precision 0.821–0.881, recall 0.975) with corpus, date, derivation and the direction that pays the operator — `eaa-remediation-pipeline` 6 → 9. `source-silence-detector` gained `subscriber_record.py`, the customer-facing surface it never had, printing held-out recall (6/17) and refusing to render an absent alert as health — `public-record-watch` 6 → 9. A rubric bug charging the alignment deduction regardless of disclosure was fixed — `cra-evidence-desk` 6 → 7. `agent-permission-harness` gained `validate_accuracy.py`, a labeled 34-case fixture corpus run through `harness.analyse()` (0 false positives, 0 false negatives on the 16/34 positive-rule opportunities it covers), and a "How this can be wrong" section stating that figure and its limits — `ethical_robustness` 7 → 9. **A fourth pass, same day, closed the last gap: `npm-reachability-triage`.** Its adverse direction was already named but never measured; 102 suppressed findings from a live run across the portfolio's seven npm products reduce to 53 distinct `(advisory, rule, package)` claims, each hand-checked against real advisory text and lockfile evidence — 0 of 53 (0 of 102 raw findings) wrong. `triage/evidence.py` now renders the figure the same way `harness.py` does — `ethical_robustness` 7 → 8. All four probes now carry both a committed rate and a rendering that prints it |
| [`register-change-rate/`](register-change-rate/) | `public-record-watch`'s kill criterion — how often does a public register actually change? | **Weekly or better for six of nine git-mirrored registers**, and the software-security ones change on 85–180 of 180 days. But cheap-to-monitor and expensive-to-miss are anti-correlated: none of the candidate's three named verticals has a usable mirror, and for the ones that do, the "archive a new entrant cannot fetch" moat is one clone (388 commits of CISA KEV history, in seconds). Also retires the €150/two-week budget for step 1 of that candidate's experiment, for any mirrored source |
| [`substitute-supply/`](substitute-supply/) | For each pipeline candidate's core function, does a live, adopted, free implementation already exist on npm? | **7 of 10 measurable functions are commoditised.** Four candidates' prose "commodity" claims are confirmed with numbers; `mcp-supply-chain-watch` gets an independent second reason its `defensibility: 3` floor sits where it does (both mechanisms are free); `public-record-watch`'s polling-and-diffing engine is the one function that is **not** commoditised on npm (2 relevant packages, none above 1k/mo) |

## 2. Can this portfolio reach a buyer from where the agent actually lives?

**Start here: [`egress-reachability/`](egress-reachability/).** It folds all nine
reachability passes into one verified 98-host table, re-measured first-hand on
2026-08-20 and again on 2026-08-23, and it carries the script that regenerates
it. **If your pass measures a host that table does not carry, fold it in** —
`consolidate.py --probe` iterates the committed table, so a host missing from it
is never re-measured, and CI now fails when the table lags a fresh ingest. The rows below are
what each pass established and are kept for provenance; where they disagree with
`egress-reachability/`, that directory is current.

| Directory | Established |
|---|---|
| [`agent-reachability/`](agent-reachability/) | 33 targets: 24 denied, 8 reachable, 1 scope-denied. All four merchant-of-record rails denied, so "one payout rail, established once" is **under-specified** — the credential alone buys nothing without a paired egress change |
| [`monetization-reachability/`](monetization-reachability/) | Extends four rails to thirteen: **0 usable.** 11 egress-denied, 2 (GitHub Sponsors, Marketplace billing) scope-denied. Two different switches, and the GitHub one is the cheaper, narrower permission |
| [`publish-reachability/`](publish-reachability/) | **Every channel `channel-inventory.md` called "free and agent-listable" is denied** — WordPress.org, Open VSX, VS Code Marketplace, GitHub Marketplace, PyPI publish. Eight other channels *are* publishable. Proposes **Ask 0**: one account on an already-reachable registry, no egress change |
| [`demand-signal-reachability/`](demand-signal-reachability/) | **Publishing is not measuring.** 3 of Ask 0's 8 channels cannot produce an install count at all — NuGet's stats host is denied while its publish host is fine; ghcr.io and the Go module proxy publish no count at any permission level. **Amended 2026-08-24**: PyPI, put through the same gate after [`artifact-channel-match`](artifact-channel-match/) promoted it onto the board, **fails at both** — `upload.pypi.org` denied, and every zero-credential count surface either returns the sentinel `-1` (Warehouse's own API, two projects, two windows) or is egress-denied (pypistats.org, pepy.tech, clickpy, piwheels); the one route that answers, BigQuery, needs a billing-enabled cloud account. So yesterday's cost correction was one-sided: it priced Ask 0's missing port and not the PyPI route's two missing gates, and **neither route is one action away**. Re-running the 2026-08-19 targets in the same pass reproduced **all 27 verdicts with zero drift**, a fourth independent confirmation of this environment's egress posture. Rule added: *a reachable statistics host is not a readable number* — a sentinel, a top-N page, and a billing-gated endpoint all pass a naive reachability check and none of them measures anything |
| [`registry-audience-match/`](registry-audience-match/) | **Ask 0's registries are not interchangeable.** 98.2% of Docker Hub's `mcp` category pulls sit in Docker's own closed verified-publisher namespace, so an outside listing measures namespace obscurity, not demand — **Docker Hub off the menu** |
| [`publish-endpoint-reachability/`](publish-endpoint-reachability/) | Ask 0's "no egress change needed" measured **at the publish endpoint** rather than the read endpoint, where every earlier pass had stopped. Holds. Also found the second denial signature (an in-band HTTP 403 carrying `x-deny-reason: host_not_allowed`) and corrected two readings that rested on mistaking it for an origin answer |
| [`primary-source-egress/`](primary-source-egress/) | **Nobody had run a control.** `example.com` produces a byte-identical denial to `api.wordpress.org`, so the WordPress denial is not evidence about WordPress — it is evidence of a general policy, and Asks 3 and 7 are therefore one decision rather than several |
| [`runtime-data-reachability/`](runtime-data-reachability/) | A third question the other two do not answer: can a product **fetch its own input data**? For only one of eight candidates. A candidate can be publishable and still impossible to develop |
| [`data-reachability/`](data-reachability/) | Probe every distribution channel a feed publishes, not just its canonical one. Under that rule the policy is not "registries only" but **general-web hosts denied, code/package/object-storage infrastructure allowed** — OSV's bulk export and the CISA KEV git mirror both answer while their APIs do not |
| [`forge-surface-reachability/`](forge-surface-reachability/) | The git-surface amendment below was measured on **one forge**. Asked of twenty: **git is allowlisted host-by-host, exactly like HTTP — 4 reachable, 16 egress-denied**, with four of five GitLab CE instances denied while `gitlab.com` answers, so the allowance tracks the host, not the protocol. `gitlab.com` is the **only forge reachable on every surface** (git, `/api/v4/` anonymously, raw), and its project search is the "repository search" [`register-change-rate/`](register-change-rate/) named as scope-denied — run, with working controls, it finds **no live register mirror** in any of `public-record-watch`'s verticals, strengthening that directory's self-declared weakest claim |
| [`artifact-channel-match/`](artifact-channel-match/) | **The other half of the join, asked for the first time: does this portfolio own anything it could publish to the channel it is asking for?** No. Ask 0's four registries (Packagist, RubyGems, crates.io, Hex) have **zero manifests** in this repository, so granting it produces a token and a porting project, not a listing. The only two publishable packages here are Python probes, and PyPI's upload host is the one endpoint denied by name; all 18 `package.json` files set `"private": true`, so npm's open write path has nothing to publish either. **Publishable today: none.** Also corrects `publish-endpoint-reachability`'s "strictly worse than Ask 0" ranking of the PyPI route, which counted credentials but omitted the port |
| [`egress-reachability/`](egress-reachability/) | **Current.** All nine passes reconciled: 98 hosts, **26 reachable, 69 egress-denied, 3 GitHub-scope-denied**. Establishes that this environment denies egress in *three* signatures, one of which fires intermittently on ~6% of requests and is indistinguishable from an origin 403 by status code — enough on its own to generate ~4 spurious "reachable" verdicts per pass, a different four each time. **Amended 2026-08-20:** the three GitHub scope-denials are verdicts about the *HTTP* surface. Git's smart-HTTP transport is a fourth surface and is not scoped — full-history `git clone` of repositories this session has no scope over succeeds, on `github.com` and `codeload.github.com` alike (`consolidate.py --git-surface`). **Amended 2026-08-24:** the table had drifted six hosts -- four measured by a sibling pass and never folded in, two the ingest structurally could not see (a prose-only pass, and one living outside `portfolio/research/`), one of which the owner was being asked to allowlist. The ingest-equality check and the ask-host checker now run in CI |

### The bottom line these converge on

> **Ask 0, amended.** One free account signup and a scoped publish token on
> **Packagist or RubyGems** (preferred), or crates.io / Hex. Not Docker Hub, not
> NuGet, not the Go-module route, not PyPI (its upload host is denied even
> though its read host is not). No egress change, no payment rail, no card, no
> domain, no company.

**Amended 2026-08-24 — that ask is necessary but not sufficient, and the gap is
on the artifact side.** This repository contains no `composer.json`, `Gemfile`,
`*.gemspec`, `Cargo.toml` or `mix.exs` — nothing in any of the four languages
those registries distribute. Granting Ask 0 as written yields a live token with
an empty shelf; a port has to be paid for before any listing exists. That cost
was never in the comparison, and with it included the ranking of Ask 0 against
the `upload.pypi.org` allowlist route (which would publish two already-built,
already-green Python probes) is **no longer settled** — see
[`artifact-channel-match/`](artifact-channel-match/). Ask 0 is still cheap and
still a real option; it is just not, on its own, a listing.

That is the cheapest action that produces the demand number this portfolio has
been asking for since its sixth screening cycle. It is tracked, with the other
independent asks and their costs, in
[issue #139](https://github.com/Duncan-Haywood/monorepo-projects/issues/139) —
the account owner's decision queue. **None of these is a decision an unattended
session should make**, and nothing in this directory published, registered,
submitted, or signed up for anything.

Section 1 is the counterweight to reading that ask as promising. The demand
studies say a cold listing in these categories is close to invisible, that
changing registry does not fix it, that ~92% of the listings which *do* win
discovery have no price, and that the ones with a price are companies that
arrived with an audience. Ask 0 is cheap and worth doing precisely because it is
cheap — not because the measurements so far suggest it will pay.

## 3. Does the code do what it says?

| Study | Question | Finding |
|---|---|---|
| [`js-typecheck/`](js-typecheck/) | What would TypeScript's checker (`tsc --checkJs`, non-strict) find in the ventures' plain JavaScript? | **One user-visible bug in 3,911 diagnostics** across 3,410 product files: a duplicate object key that blanked the transaction count in two BAI2 tools (fixed, with regression tests). 80% of files pass once two browser privacy globals are declared, including two thirds of `calc.mjs`. Result: `PRODUCT_PLAYBOOK.md` §4 opts files in with `// @ts-check` one at a time, enforced in `ventures-tests`, rather than a tree-wide flag |

## Two methodological results worth keeping

Each pass above corrected its predecessor on the same two classes of mistake.
Stated once here so a tenth pass does not rediscover them:

> **1. A channel has three surfaces, and they fail independently.** Score the
> `publish` surface, not the `read` surface — a registry that answers a metadata
> query is not a channel, and the upload host and account-creation host
> routinely differ in verdict. Then score the `stats` surface, and check the
> count exists *at all* — a channel you can publish to but cannot measure is a
> distribution channel, not a probe.
>
> **Amended 2026-08-20: three was the count, not the rule.** GitHub is
> scope-denied on its web, REST and archive surfaces and *reachable* over git's
> smart-HTTP transport, which is a fourth surface nobody had asked. The general
> form is that a verdict belongs to a surface and never to a host, and a
> recorded denial is only as broad as the surface it was measured on
> ([`egress-reachability/`](egress-reachability/)).
>
> **Amended 2026-08-21: the rule cuts both ways, and the second edge is easier
> to miss.** A verdict does not generalise across surfaces — *and it does not
> generalise across hosts either.* The git-surface amendment was measured on
> `github.com` alone; asked of twenty forges, git is allowlisted host-by-host
> exactly like HTTP (4 reachable, 16 denied at CONNECT, control denied). "Git is
> a fourth surface and is not scoped" is true of GitHub's **scope** gate and
> says nothing about the **egress** gate, which is what denies the other
> sixteen. Do not read it as licence to reach an arbitrary git host — measure
> the host ([`forge-surface-reachability/`](forge-surface-reachability/)).

> **2. A status code is not evidence about reachability in this environment.**
> Denials arrive in three signatures, two of which are ordinary-looking HTTP
> 403s, and which one a given host produces is not stable between attempts.
> Classify on the response body; treat `Tunnel connection failed`,
> `Host not in allowlist`, and `no rule allows host` as one verdict; re-probe
> anything that would overturn a recorded verdict.
> `egress-reachability/consolidate.py` does all three.

> **3. A reachable channel is half a join, and this chain only ever measured
> that half.** Added 2026-08-24. Every directory above scores *channels*; none
> asked whether this portfolio holds an artifact that could be published to the
> channel it is asking for. Made, the join comes out disjoint: the only two
> publishable packages here are Python, and PyPI's upload host is the one
> endpoint the filter refuses by name, while all four registries on Ask 0's menu
> have **zero** manifests in this repository. Before pricing a channel ask, check
> the artifact side — an open endpoint with nothing to publish to it is a
> porting project wearing a credential's clothes
> ([`artifact-channel-match/`](artifact-channel-match/)).

## Why these landed together

The first five reachability directories were opened as five separate pull
requests (#126, #130, #137, #150, #155) over about four hours and none merged.
Meanwhile `portfolio/pipeline/channel-inventory.md` — whose central
recommendation they had jointly refuted — *did* merge, so `main` carried the
version that does not work while every correction sat in a branch.

Consolidating them into one content-only change with no `portfolio/ledger/` hunk
was proposed as the fix. That consolidation (#166) also did not merge, and over
the following day **ten more measurement pull requests accumulated behind it**
(#177, #218, #219, #225, #229, #232, #240, #245, #250, #253) — several of them
re-measuring what an earlier unmerged branch had already measured, and two of
them repeating an error that #177 had already found and corrected in a branch
nobody could see.

This directory is all of them, verified and landed together, for the reason
`portfolio/pipeline/README.md` gives for its own consolidation: **research that
never lands leaves the next run no way to know the question was answered.**
