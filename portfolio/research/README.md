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

## The two questions answered so far

### 1. Is there demand, and does the product premise hold?

| Directory | Question | Finding |
|---|---|---|
| [`mcp-tool-drift/`](mcp-tool-drift/) | Do third-party MCP servers change their declared tool surface often enough to be worth monitoring? | **Yes, and not marginally.** 69% of sampled adjacent releases changed the declared tool surface, 29% removed a tool outright, ≥33% changed a tool description. De-risks the premise of pipeline candidate #3 |
| [`free-listing-demand/`](free-listing-demand/) | What does a cold free listing actually get? | Measured against the public npm registry, on leaf packages (zero dependents, so downloads reflect someone finding them directly). Median monthly downloads by candidate category: **68** for SBOM/CRA evidence, **205** for accessibility evidence, **2,399** for MCP supply chain. The median cold listing is close to invisible, and these are an upper bound on human adoption rather than an estimate of it — that is the number every "just publish a free listing" plan has to be sized against |

### 2. Can this portfolio reach a buyer from where the agent actually lives?

Five runs on 2026-08-19, each refining the last. This is one argument, not five;
read top to bottom or read only the last row for the current bottom line.

| Directory | Established | Superseded by |
|---|---|---|
| [`agent-reachability/`](agent-reachability/) | 33 targets probed: 24 `EGRESS_DENIED`, 8 `REACHABLE`, 1 `SCOPE_DENIED`. All four merchant-of-record rails denied, so the standing "one payout rail, established once" ask is **under-specified** — the credential alone buys nothing without a paired egress change | rails extended by `monetization-reachability` |
| [`monetization-reachability/`](monetization-reachability/) | Extends four rails to thirteen: **0 usable.** 11 egress-denied, 2 (GitHub Sponsors, Marketplace billing) scope-denied. Two different switches, and the GitHub one is the cheaper, narrower permission. Splits the ask into a narrow and a broad version | channel set extended by `publish-reachability` |
| [`publish-reachability/`](publish-reachability/) | **Every channel `channel-inventory.md` called "free and agent-listable" is denied** — WordPress.org, Open VSX, VS Code Marketplace, GitHub Marketplace, PyPI publish. 8 other channels *are* publishable. Proposes **Ask 0**: one account on an already-reachable registry, no egress change | registry menu narrowed twice below |
| [`demand-signal-reachability/`](demand-signal-reachability/) | **Publishing is not measuring.** 3 of Ask 0's 8 channels cannot produce an install count at all — NuGet's stats host is denied while its publish host is fine; ghcr.io and the Go module proxy publish no count at any permission level. Adds **Ask 3**, read-only egress for four storefront hosts | Docker Hub removed below |
| [`registry-audience-match/`](registry-audience-match/) | **Ask 0's registries are not interchangeable.** 98.2% of Docker Hub's `mcp` category pulls sit in Docker's own closed verified-publisher `mcp/` namespace (245 repos), so an outside listing measures namespace obscurity, not demand — **Docker Hub off the menu.** Packagist and RubyGems run 60–90× the volume of the two registries the "underpowered probe" objection was actually measured on | current |

### The bottom line these five converge on

> **Ask 0, amended.** One free account signup and a scoped publish token on
> **Packagist or RubyGems** (preferred), or crates.io / Hex. Not Docker Hub, not
> NuGet, not the Go-module route. No egress change, no payment rail, no card,
> no domain, no company.

That is the cheapest action that produces the demand number this portfolio has
been asking for since its sixth screening cycle. It is tracked, with three other
independent asks and their costs, in
[issue #139](https://github.com/Duncan-Haywood/monorepo-projects/issues/139) —
the account owner's decision queue. **None of these is a decision an unattended
session should make**, and nothing in this directory published, registered,
submitted, or signed up for anything.

## One methodological result worth keeping

The five runs above each corrected the previous one on the same class of
mistake, which is worth stating once as a rule rather than rediscovering a sixth
time:

> **A channel has three surfaces, and they fail independently.** Score the
> `publish` surface, not the `read` surface — a registry that answers a metadata
> query is not a channel, and the upload host and account-creation host
> routinely differ in verdict. Then score the `stats` surface, and check the
> count exists *at all* — a channel you can publish to but cannot measure is a
> distribution channel, not a probe.

Two of the eight channels this portfolio was ready to spend its one measurement
on publish no number, and no permission grant changes that. Both would have been
caught by asking the three questions separately.

## Why these landed together

The five reachability directories were opened as five separate pull requests
(#126, #130, #137, #150, #155) over about four hours and none of them merged.
Meanwhile `portfolio/pipeline/channel-inventory.md` — whose central
recommendation they had jointly refuted — *did* merge, so `main` carried the
version that does not work while every correction sat in a branch.

That is the exact mechanism the pipeline README's provenance section records as
having cost thirteen screening cycles: **research that never lands leaves the
next run no way to know the question was answered.** Consolidating them into one
content-only change, with no `portfolio/ledger/` hunk to go stale, is the fix
that worked for the pipeline directory and is applied here for the same reason.
