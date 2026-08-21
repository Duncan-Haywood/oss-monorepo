# Research

Measurements, not proposals. Each subdirectory answers one question with data,
carries the script that produced it, and saves the raw results so the finding can
be re-derived without trusting the prose.

`portfolio/pipeline/` ranks candidate businesses. This directory tests the
factual premises those rankings rest on. The split matters because the pipeline's
write-ups are explicitly labelled *"secondary sources, unverified against primary
ones"* — good enough to rank candidates against each other, not good enough to
spend against. Everything here is the primary check.

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

## 1. Is there demand, and does the product premise hold?

| Directory | Question | Finding |
|---|---|---|
| [`mcp-tool-drift/`](mcp-tool-drift/) | Do third-party MCP servers change their declared tool surface often enough to be worth monitoring? | **Yes, and not marginally.** 69% of sampled adjacent releases changed the declared tool surface, 29% removed a tool outright, ≥33% changed a tool description. De-risks the premise of pipeline candidate #3 |
| [`free-listing-demand/`](free-listing-demand/) | What does a cold free listing actually get? | Median monthly npm downloads for a leaf listing: **68** (SBOM/CRA evidence), **205** (accessibility evidence), **2,399** (MCP supply chain). The median cold listing is close to invisible, and these are an upper bound on human adoption rather than an estimate of it |
| [`free-listing-demand/cross-registry-replication.md`](free-listing-demand/cross-registry-replication.md) | Is that concentration an npm artifact? | **No — it replicates on Packagist and RubyGems, and npm was the optimistic case.** Changing registry does not improve the discovery term, so "different channel, different regime" is tested and false in its general form |
| [`publisher-audience/`](publisher-audience/) | Does the audience have to precede the listing? | **Mostly, but not absolutely.** A cold publisher's odds of a category top-decile listing are **4.9%**, against **16.2%** for a publisher with existing usage — a 3.3× handicap, not a closed door. 27% of top-decile listings came from publishers with no other audience |
| [`free-listing-economics/`](free-listing-economics/) | What is a free listing worth, not just whether it is found? | Central-case revenue for a cold free listing is **$16–$145/month**, on an assumed ~2% conversion the study names as its own weakest input. Reports the revenue-per-download each percentile would need to clear a bar, so the claim is falsifiable by inspection |
| [`listing-monetization/`](listing-monetization/) | Do the listings that *win* discovery have any way to get paid? | **~92% have no price at all.** Of the monetised winners, roughly eleven of fifteen are organisations that arrived with their own distribution, and every observed price is charged somewhere other than the registry |
| [`mcp-archive-defensibility/`](mcp-archive-defensibility/) | Is `mcp-supply-chain-watch`'s pinned archive a scarce accruing asset, or public data? | **Public data on the half this environment can build.** The candidate's only named mitigation for its `defensibility: 4` floor is refuted, with no replacement found — which under `pipeline/README.md` rule 2 blocks it at the rubric level rather than merely scoring it low |
| [`cra-advisory-reachability/`](cra-advisory-reachability/) | Does `cra-evidence-desk`'s triage produce a signal a customer would pay for? | **64.6–66.0% false positives**, bimodal by deployment mode: ~0–4% on server-rendered apps, ~98% on static exports, which never ship the request-handling code most advisories describe |
| [`a11y-evidence-record/`](a11y-evidence-record/) | How much of the `eaa-remediation-pipeline` audit is automatable from templates alone? | **63.2% is undecidable without rendering or store data**; **70.4%** on the four checks where "undecidable" is even a possible answer. Two defect classes (unnamed buttons, unlabelled controls) carry **71% of blocking findings**; missing image alt is 5.6% |
| [`a11y-render-recovery/`](a11y-render-recovery/) | What does rendering actually recover from that undecidable share? | **50.5% is theme-recoverable** at build time with no store data; **11.0% requires per-store merchant data** (where empty alts become real blocking failures at that store); **38.5% is context-dependent** — undecidable even as to provenance from the template alone. "Almost all" splits into three shares, only one of which is a build step |
| [`a11y-theme-resolution/`](a11y-theme-resolution/) | The theme-recoverable share is a *ceiling*. What does it recover **to** — a pass, or a defect? | **A pass, overwhelmingly.** 68.5% of the 248 theme-recoverable undecidables resolve to a name that is present; **2.0% (5 of 248) are real blocking failures**. The build step is a coverage step, not a finding-generator. All five defects are one mechanically-detectable class (a `<label for>` whose target id the theme builds from an expression), and 64 of the 69 "cross-partial label" cases were in the same file all along — a fix both audit engines can adopt |
| [`a11y-engine-agreement/`](a11y-engine-agreement/) | This portfolio has **two** WCAG engines for the same candidate. Run on the same input, do they agree? | **No, and each was silent about it.** Each engine was blind to two checks the other had, in opposite directions, and neither listed the other's in its own coverage statement — so a record could not distinguish "checked and passed" from "never looked at". Against the only hand-labeled ground truth, `audit.py` scored recall **0.857** to the probe's 1.0, missing captions (1.2.2) and `aria-hidden` on a focusable control (4.1.2); the probe missed 1.4.2 and 1.4.4. All four closed, with a coverage-boundary invariant in each engine. The residual disagreement is **attribution** — two defects both engines catch but cite under different criteria — left open because settling it is a normative WCAG reading and the spec hosts are egress-denied |
| [`a11y-own-sites/`](a11y-own-sites/) | Both engines had only ever seen hand-written fixtures and npm theme tarballs. Run them on **this portfolio's own built pages** — do the ventures pass, and does the engine hold up out of sample? | **Out-of-sample precision is 0.821–0.881, against 1.0 on the fixture set**, and every false positive is markup the *build tool* emitted rather than a venture: 7 of 8 are Next.js's internal error shell (`quick-pick-survey` ships a correct `global-error.tsx` with `lang="en"` and is flagged anyway), 1 is a `display:none` control. A free qualification audit therefore needs a build-artifact filter before a stranger reads it. Engine agreement also falls from 2/3 fixtures to **89/118 real pages**, all 29 disagreements pure relabellings rather than missed defects — so `a11y-engine-agreement`'s "residual attribution divergence" in fact decides the criterion cited on **24.6%** of real pages. Of 55 confirmed defects, the 30 blocking ones in venture source are fixed in the same pass (8 unnamed icon buttons and 12 unlabelled controls in `print-atelier`, 10 pages pinned at 1× zoom in `quick-pick-survey`); 25 heading-order defects are recorded, not fixed |
| [`a11y-generated-sites/`](a11y-generated-sites/) | Every corpus so far came from a build directory. `local-site-studio`'s *product* — the customer sites it generates — is rendered per request and appears in no build, so no audit had ever seen the thing being sold. Audit it. | **The delivered pages are clean (0 findings on 14 pages, both engines agreeing), and the defects were in the engines.** A mutation-based positive control — edit the customer's own page, check the rule fires — separates "your site is clean" from "our scanner could not read it": **7 of 8 removal mutations are exercised by this corpus and all 7 are caught**, the other 4 reported as *not exercised* rather than as passing. It found **a detection gap in each engine**, where `a11y-own-sites` found none in 118 pages: the probe had no `<iframe>` rule at all (and the repository's **only** frame is the map on every delivered page — the one element on the one route no build corpus can reach), and `audit.py` accepted a control wrapped in a text-less `<label>`. Both fixed here. It also gives both known relabellings a named cause: a skipped heading is 2.4.6 vs 1.3.1, an unnamed control is 1.3.1 vs 3.3.2, and those two account for all three rows of `a11y-own-sites`'s divergence table. The engines' out-of-sample failure mode is therefore **silent misses as well as false positives** — and unlike a false positive, nobody reading the record can tell |
| [`register-change-rate/`](register-change-rate/) | `public-record-watch`'s kill criterion — how often does a public register actually change? | **Weekly or better for six of nine git-mirrored registers**, and the software-security ones change on 85–180 of 180 days. But cheap-to-monitor and expensive-to-miss are anti-correlated: none of the candidate's three named verticals has a usable mirror, and for the ones that do, the "archive a new entrant cannot fetch" moat is one clone (388 commits of CISA KEV history, in seconds). Also retires the €150/two-week budget for step 1 of that candidate's experiment, for any mirrored source |
| [`substitute-supply/`](substitute-supply/) | For each pipeline candidate's core function, does a live, adopted, free implementation already exist on npm? | **7 of 10 measurable functions are commoditised.** Four candidates' prose "commodity" claims are confirmed with numbers; `mcp-supply-chain-watch` gets an independent second reason its `defensibility: 3` floor sits where it does (both mechanisms are free); `public-record-watch`'s polling-and-diffing engine is the one function that is **not** commoditised on npm (2 relevant packages, none above 1k/mo) |

## 2. Can this portfolio reach a buyer from where the agent actually lives?

**Start here: [`egress-reachability/`](egress-reachability/).** It folds all nine
reachability passes into one verified 92-host table, re-measured first-hand on
2026-08-20, and it carries the script that regenerates it. The rows below are
what each pass established and are kept for provenance; where they disagree with
`egress-reachability/`, that directory is current.

| Directory | Established |
|---|---|
| [`agent-reachability/`](agent-reachability/) | 33 targets: 24 denied, 8 reachable, 1 scope-denied. All four merchant-of-record rails denied, so "one payout rail, established once" is **under-specified** — the credential alone buys nothing without a paired egress change |
| [`monetization-reachability/`](monetization-reachability/) | Extends four rails to thirteen: **0 usable.** 11 egress-denied, 2 (GitHub Sponsors, Marketplace billing) scope-denied. Two different switches, and the GitHub one is the cheaper, narrower permission |
| [`publish-reachability/`](publish-reachability/) | **Every channel `channel-inventory.md` called "free and agent-listable" is denied** — WordPress.org, Open VSX, VS Code Marketplace, GitHub Marketplace, PyPI publish. Eight other channels *are* publishable. Proposes **Ask 0**: one account on an already-reachable registry, no egress change |
| [`demand-signal-reachability/`](demand-signal-reachability/) | **Publishing is not measuring.** 3 of Ask 0's 8 channels cannot produce an install count at all — NuGet's stats host is denied while its publish host is fine; ghcr.io and the Go module proxy publish no count at any permission level |
| [`registry-audience-match/`](registry-audience-match/) | **Ask 0's registries are not interchangeable.** 98.2% of Docker Hub's `mcp` category pulls sit in Docker's own closed verified-publisher namespace, so an outside listing measures namespace obscurity, not demand — **Docker Hub off the menu** |
| [`publish-endpoint-reachability/`](publish-endpoint-reachability/) | Ask 0's "no egress change needed" measured **at the publish endpoint** rather than the read endpoint, where every earlier pass had stopped. Holds. Also found the second denial signature (an in-band HTTP 403 carrying `x-deny-reason: host_not_allowed`) and corrected two readings that rested on mistaking it for an origin answer |
| [`primary-source-egress/`](primary-source-egress/) | **Nobody had run a control.** `example.com` produces a byte-identical denial to `api.wordpress.org`, so the WordPress denial is not evidence about WordPress — it is evidence of a general policy, and Asks 3 and 7 are therefore one decision rather than several |
| [`runtime-data-reachability/`](runtime-data-reachability/) | A third question the other two do not answer: can a product **fetch its own input data**? For only one of eight candidates. A candidate can be publishable and still impossible to develop |
| [`data-reachability/`](data-reachability/) | Probe every distribution channel a feed publishes, not just its canonical one. Under that rule the policy is not "registries only" but **general-web hosts denied, code/package/object-storage infrastructure allowed** — OSV's bulk export and the CISA KEV git mirror both answer while their APIs do not |
| [`forge-surface-reachability/`](forge-surface-reachability/) | The git-surface amendment below was measured on **one forge**. Asked of twenty: **git is allowlisted host-by-host, exactly like HTTP — 4 reachable, 16 egress-denied**, with four of five GitLab CE instances denied while `gitlab.com` answers, so the allowance tracks the host, not the protocol. `gitlab.com` is the **only forge reachable on every surface** (git, `/api/v4/` anonymously, raw), and its project search is the "repository search" [`register-change-rate/`](register-change-rate/) named as scope-denied — run, with working controls, it finds **no live register mirror** in any of `public-record-watch`'s verticals, strengthening that directory's self-declared weakest claim |
| [`egress-reachability/`](egress-reachability/) | **Current.** All nine passes reconciled: 92 hosts, **25 reachable, 64 egress-denied, 3 GitHub-scope-denied**. Establishes that this environment denies egress in *three* signatures, one of which fires intermittently on ~6% of requests and is indistinguishable from an origin 403 by status code — enough on its own to generate ~4 spurious "reachable" verdicts per pass, a different four each time. **Amended 2026-08-20:** the three GitHub scope-denials are verdicts about the *HTTP* surface. Git's smart-HTTP transport is a fourth surface and is not scoped — full-history `git clone` of repositories this session has no scope over succeeds, on `github.com` and `codeload.github.com` alike (`consolidate.py --git-surface`) |

### The bottom line these converge on

> **Ask 0, amended.** One free account signup and a scoped publish token on
> **Packagist or RubyGems** (preferred), or crates.io / Hex. Not Docker Hub, not
> NuGet, not the Go-module route, not PyPI (its upload host is denied even
> though its read host is not). No egress change, no payment rail, no card, no
> domain, no company.

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
