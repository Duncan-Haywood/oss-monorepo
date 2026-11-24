# Maris Stella Labs

Maris Stella Labs is a small software company in Colorado run with AI agents.
It builds **paid software suites for small and medium businesses**, with
construction first, then manufacturing and engineering shops, and business
tools (billing, invoicing, quoting, bookkeeping) as the first path to revenue.
This public monorepo holds the free tools, the open research and the agent
platform that feed those products. The live site is
**[marisstella.app](https://marisstella.app/)**.

## What we sell, and to whom

Paid products are chosen by promise and value (willingness to pay, reachable
buyers, distribution without a sales team, margin, time to first dollar), not
by how much code already exists. The current ranked bets, each with its
sourced evidence, are kept in `bets.md`
([`portfolio/monetization/`](portfolio/monetization/)):

| Bet | Who it is for | Status |
|---|---|---|
| Pay-app billing (AIA G702/G703, retainage, lien waivers), growing into a contractor suite | specialty subcontractors, small general contractors | in development |
| AI RFQ-to-quote | CNC and fabrication job shops | in development |
| E-invoice fix-and-explain | German and French SMEs and their accountants | in development |
| CMMC Level 1/2 and ISO 9001 workspace | small defense and aerospace shops | in development |
| Reseller profit and Schedule C books | multi-platform resellers | in development |
| Residential takeoff from drawings | remodelers, roofers, framers | in development |
| **Grant Autopilot** | small nonprofits | **live, paid** |

Only Grant Autopilot is a live paid product today; the rest are being built
and none of them takes payment yet. Nothing here claims customers or revenue
a file can't back: monthly recurring revenue readings are the owner's to add,
in [`portfolio/monetization/mrr.yaml`](portfolio/monetization/mrr.yaml).

**Where the paid products live.** Their code is in a private repository, not
here. This repository links to a paid product only through its public product
page; it does not link to or mirror the private code. Code already published
here under MIT stays MIT
([`LICENSING_TRANSITION.md`](portfolio/monetization/LICENSING_TRANSITION.md)
explains what moves and what cannot).

## What the free tools are for now

The 1,400 or so free browser calculators, CSV checkers and self-hosted apps in
[`ventures/`](ventures/README.md) stay up, free and MIT licensed, and you can
still use, fork or self-host any of them. They are now **front doors**: a free
tool gets new work only when it leads to one of the paid products above (a
free G702 template in front of pay-app billing, say). Others are kept running
but not extended.

**Free tools by trade, business or stage of life** (front doors, kept up but not extended): [Roofers](https://marisstella.app/c/for-roofers/) · [HVAC contractors](https://marisstella.app/c/for-hvac/) · [Plumbers](https://marisstella.app/c/for-plumbers/) · [Electricians](https://marisstella.app/c/for-electricians/) · [Painters](https://marisstella.app/c/for-painters/) · [Cleaning businesses](https://marisstella.app/c/for-cleaning-businesses/) · [Landscapers](https://marisstella.app/c/for-landscapers/) · [Pool & hot tub pros](https://marisstella.app/c/for-pool-hot-tub/) · [Auto detailing & repair](https://marisstella.app/c/for-auto-detailing-repair/) · [Etsy sellers](https://marisstella.app/c/for-etsy-sellers/) · [eBay sellers](https://marisstella.app/c/for-ebay-sellers/) · [Amazon sellers & KDP authors](https://marisstella.app/c/for-amazon-sellers/) · [Shopify stores](https://marisstella.app/c/for-shopify-stores/) · [Resellers](https://marisstella.app/c/for-resellers/) · [Landlords & hosts](https://marisstella.app/c/for-landlords/) · [Freelancers](https://marisstella.app/c/for-freelancers/) · [Photographers & videographers](https://marisstella.app/c/for-photographers/) · [Wedding & event pros](https://marisstella.app/c/for-wedding-event-pros/) · [Restaurants, cafes & bars](https://marisstella.app/c/for-restaurants-bars/) · [Pet businesses](https://marisstella.app/c/for-pet-businesses/) · [Creators](https://marisstella.app/c/for-creators/) · [Childcare providers](https://marisstella.app/c/for-childcare/) · [Tutors & teachers](https://marisstella.app/c/for-tutors-teachers/) · [Truckers & owner-operators](https://marisstella.app/c/for-truckers/) · [Farms & homesteads](https://marisstella.app/c/for-farms/) · [Therapists & clinics](https://marisstella.app/c/for-health-practices/) · [Salons & beauty pros](https://marisstella.app/c/for-salons-beauty/) · [Retirees & near-retirees](https://marisstella.app/c/for-retirees/) · [Parents & families](https://marisstella.app/c/for-parents/) · [Changing or losing a job](https://marisstella.app/c/for-job-changers/) · [Homeowners & buyers](https://marisstella.app/c/for-homeowners/).

**New here? [Start here](docs/posts/2026-10-29-start-here.md)**: one page per kind
of reader (trade, small business, builder, researcher, developer) on what you
get and your first ten minutes.

## Research and hardware

- **Research serves the products.** Over 700 reproducible papers with code
  are public at [marisstella.app/research/](https://marisstella.app/research/)
  (source in [`research/`](research/README.md)). New research names the paid
  product and customer it advances (construction takeoff, schedule analytics
  and BIM checking are the likeliest), and stays public and MIT licensed. The
  research integrity rules are unchanged: a product claims only what the
  research showed ([`research/PROGRAMMES.md`](research/PROGRAMMES.md)).
- **Open hardware is the long horizon.** The open robot and machine designs
  (for example [`open-robot-mower`](ventures/open-robot-mower/) and
  [`open-floor-robots`](ventures/open-floor-robots/)) are aimed, long term, at
  hardware companies where agents do the design and supply-chain knowledge
  work and contract partners do the physical work. It is not current work:
  nothing is for sale, and nothing ships before its safety and certification
  work is done.

## Browse

- **[The full free-tool catalogue](ventures/README.md)**: every tool,
  grouped the way the site groups them (trade and contractor bids, marketplace
  seller fees, service-business pricing, restaurant costing, back-office money
  and contracts, compliance checks, CI and developer checks, UK tax,
  self-hosted business apps), each linked to its live page and its source.
- **[Use them from an AI agent or the command line](platform/agents/README.md)**:
  `node platform/agents/tools.mjs search|describe|call` runs any tool's
  calculation engine with JSON inputs and no browser. The same commands run as
  a local MCP server (see [`.mcp.json`](.mcp.json)) for Claude Code, Cursor and
  other MCP clients.
- **Self-hosted business apps**: open-source apps you run on your own server,
  such as Stripe failed-payment recovery, cancellation flows, status pages,
  cookie-free analytics and license keys
  ([section](https://marisstella.app/c/self-hosted/)).
- **Developer tools**: [`uitest`](platform/uitest/README.md), AI-agent
  end-to-end UI testing for any web app (CLI and GitHub Action), a
  [bring-your-own-key LLM client](platform/llm/README.md), and the rest of the
  shared tooling in [`platform/`](platform/README.md).
- **How it is built**: a public
  [development dashboard](https://marisstella.app/dev/)
  of merges, CI results and agent run cost.
- **Have an idea?** [Bring an idea](docs/posts/2026-10-29-start-here-bring-an-idea.md):
  website requests from businesses are still built here, in public and MIT
  licensed.

## Finding your way

One repository for two peer portfolios, products (`ventures/`) and open
research (`research/`), plus the shared agent platform that works on both.
The goals are in [`prompts/goals.md`](prompts/goals.md) (the North star is
$10k monthly recurring revenue). Each kind of work has one guide; read that
guide and use judgment, not every rulebook in the tree.

| Work | Lives in | Read first |
|---|---|---|
| Choosing what to build next | `portfolio/monetization/` | `bets.md` there, then [`prompts/goals.md`](prompts/goals.md) |
| A paid product | the private repository | its own docs there; this repo holds only its public product page and free front doors |
| A free tool that is a front door to a paid product | `ventures/<slug>/` | [`AGENTS.md`](AGENTS.md), [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md) |
| A research project or result | `research/<slug>/` | [`research/CLAUDE.md`](research/CLAUDE.md), [`research/PROGRAMMES.md`](research/PROGRAMMES.md), [`research/PROJECTS.md`](research/PROJECTS.md) |
| Shared tooling: pages, CI, marketing, deploy | `platform/` | the subdirectory's README |
| Strategy, routing, usage, ledger | `portfolio/` | [`portfolio/README.md`](portfolio/README.md), [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) (long reference) |
| How runs are steered and reviewed | `prompts/` | [`prompts/README.md`](prompts/README.md) |
| A scheduled run | anywhere | [`prompt.md`](prompt.md), which routes it to one of the above |
| A contribution from a person: bug report, fix, research check | anywhere | [`CONTRIBUTING.md`](CONTRIBUTING.md), then [`docs/contributing/`](docs/contributing/README.md) |
| A blog post, README, `llms.txt` or other docs from a person | anywhere | [`docs/contributing/writing.md`](docs/contributing/writing.md) |
| An idea, dictated, with no AI agent | [`IDEAS.md`](IDEAS.md) | [`docs/contributing/ideas.md`](docs/contributing/ideas.md) |
| Steering the agents the way the owner does | anywhere | [`docs/contributing/steering-agents.md`](docs/contributing/steering-agents.md) |

One process applies to every kind of work, because it is what keeps the tree
from filling with dead branches and redone work: open a pull request for
anything you push, and land it or close it with a reason in the same session
([`.github/prompts/land-your-work.md`](.github/prompts/land-your-work.md)).
Ideas that are worth doing but not now go in the process backlog
([`prompts/process/backlog/`](prompts/process/backlog/README.md)), not in a
stranded branch.

**Where things are served:** the catalogue and research pages are built and
deployed to [marisstella.app](https://marisstella.app/) (Cloudflare) on every
merge; apps, CLIs, packages and services ship through their own channels
([`portfolio/hosting/`](portfolio/hosting/README.md),
[`portfolio/distribution/`](portfolio/distribution/README.md)). Agent
instructions: [`AGENTS.md`](AGENTS.md). How to build a product:
[`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md). What to count and where it
lands: [`portfolio/usage/`](portfolio/usage/README.md).

The point of consolidating: agent automation is repo-scoped. In a polyrepo
setup every new venture costs a fresh onboarding pass across every agent
surface (Claude Code, Cursor, Antigravity, CI). Here a new venture is a new
directory that inherits the platform automatically.

## Layout

```
ventures/     one directory per business; each has a VENTURE.yaml
research/     one directory per research project (MIT); a peer of ventures/,
              its homepage is published at /research/ on the Pages site
platform/     shared tooling: the Pages site build, CI guards, open-source tools (platform/README.md)
prompts/      the prompt system: prompt.md (the master prompt) routes each run to
              a sub-prompt here, run records measure it, and a review track
              improves the prompts and docs from the records (prompts/README.md)
portfolio/    the ledger, the router that allocates agent effort, and the
              candidate pipeline of researched-but-not-started businesses
```

The self-hosted hel1 route (OpenTofu in `infra/`, k3s and Argo CD scripts in
`bootstrap/`, manifests in `gitops/`) was retired when the owner deleted the
servers on 2026-10-01, and the three trees were removed on 2026-10-30. They are
in git history (`git log --diff-filter=D -- gitops/`) if a self-hosted origin is
ever wanted again. Do not connect to the old server addresses: they may now
belong to someone else. `CLAUDETRIGGERAPIKEY` is the Claude routine trigger,
unrelated to that stack.

### ventures/

The catalogue of every tool, grouped and linked to its live page, is
[`ventures/README.md`](ventures/README.md) (generated by
`node platform/pages/ventures-readme.mjs`; GitHub's folder view lists only the
first 1,000 directories).

Each venture is self-contained and carries a `VENTURE.yaml` at its root. That
file is the interface between "this business exists" and "the router knows
about it" — adding a venture means adding that file; nothing else needs to
change.

Venture directories are kept cleanly bounded so a venture can be extracted
with `git filter-repo` if it is ever sold or spun off.

`ubuntu-agent-server` (shared agent-hosting infra, not itself
revenue-seeking) intentionally has no `VENTURE.yaml` — it is not a
business the router should allocate profit-seeking effort to. It carries a
`NOT-A-VENTURE` file recording why. `ai-first-markets` carries one too, for
the same reason and by the same rule, but keeps its `VENTURE.yaml`: it is the
portfolio's own scoring engine rather than a business, and its retained
hypothesis record is the evidence that reclassification rests on. Whether either
belongs under `ventures/` at all, or should move to
`platform/`/elsewhere, is still an open structural decision; the marker does
not settle it.

`VENTURE.yaml` is what the router reads, so it is schema-checked in CI:

```
pip install -r portfolio/router/requirements.txt
python3 portfolio/router/validate.py
```

`validate.py` expects every directory under `ventures/` to have either a valid `VENTURE.yaml` or
a `NOT-A-VENTURE` file, so a new venture cannot go silently invisible to the
router. A `NOT-A-VENTURE` marker is authoritative even when a `VENTURE.yaml`
is still present in the same directory — the router (`allocate.py`), the
scorer (`score_ventures.py`), and `validate.py` all skip such a directory.
That makes reclassifying a directory out of profit-seeking allocation a
single-file change (drop the marker in) rather than a simultaneous edit
across all three tools.

A reclassified directory **keeps** its row in
[`portfolio/scoring/venture-scores.yaml`](portfolio/scoring/venture-scores.yaml),
where it is reported as `reclassified` and excluded from the ranking and the
dispatchable/blocked means. A score is a record about a business, not an input
to allocation, so removing the row would delete the evidence the
reclassification was decided on. `score_ventures.py --check` enforces both
halves: it fails when an *allocated* venture has no score, or a scored slug does not name a
directory that carries a `VENTURE.yaml` — marker or not.

### research/

The open research portfolio: one self-contained project per directory, each
with a README, tests and a card on the research homepage
(`research/_homepage/build.py`, published at
[`/research/`](https://marisstella.app/research/)). It was its own
repository, `oss-research-monorepo`, until 2026-10-16. Its history was merged
in (`git log -- research/<slug>` shows each project's original commits), and
that repository is now archived, read-only history. Research work lands here
under [`research/CLAUDE.md`](research/CLAUDE.md); the product rules (session
gate, usage tracking, disclaimers) do not apply inside it.

### platform/

The processes that are the same across ventures: the site build, reusable
CI, the usage counter, deploy bundles. If a procedure is being copy-pasted
between ventures, it belongs here instead. [`platform/README.md`](platform/README.md)
lists each directory.

[`platform/uitest/`](platform/uitest/README.md) is an open-source tool that any
project can use: AI-agent end-to-end UI testing for any web app. It runs as a
CLI or a GitHub Action, works with your own model key, and still runs its
deterministic checks without one.

### portfolio/

[`portfolio/README.md`](portfolio/README.md) lists each directory.
`ledger/` records revenue, cost, agent-hours, and outcomes per venture.
`router/` reads the ledger plus each `VENTURE.yaml` and decides where agent
effort goes next. See [portfolio/router/README.md](portfolio/router/README.md)
for how allocation works and why it is not a pure ROI maximizer.

`usage/` holds usage readings per product — the signal the portfolio steers by
while everything is free. See [usage/README.md](portfolio/usage/README.md) for
what may be counted (events, never people) and what a reading of zero means.

`pipeline/` holds businesses that have been researched and scored but are **not**
ventures yet — the stage before `ventures/`, so starting one is a decision made
against evidence. A candidate graduates per its `graduate_as` field — a
`venture` when someone writes `ventures/<name>/VENTURE.yaml`, a `product-line`
when its slug is listed under `product_lines` in its host venture's — and until
one of those is true, no budget flows to it. See
[pipeline/README.md](portfolio/pipeline/README.md) for both paths, the
`NOT-A-VENTURE` precedence, and what a `product_lines` entry does not do. Its write-ups are internal research notes carrying unverified
claims, not published content — see
[portfolio/pipeline/README.md](portfolio/pipeline/README.md).

`scoring/` ranks the ventures the portfolio **does** own, on the same six
dimensions `ventures/ai-first-markets` applies to its idea library — so a
venture, a candidate, and a hypothetical idea can all be read against each
other. The router consumes the composite as a tiebreaker. See
[portfolio/scoring/README.md](portfolio/scoring/README.md) for what the first
pass found, including why merit and the router's dispatchable/blocked split
disagree.

## Operating direction

Effort goes to the paid bets above, by promise and value, for small and medium
businesses (`prompts/goals.md`, "Where effort goes"). New work starts from a
narrow customer job, ships a runnable vertical slice, measures anonymous
feature events without personal data, and keeps the legal, privacy and safety
guardrails in [`PRODUCT_PLAYBOOK.md`](PRODUCT_PLAYBOOK.md). No new free
single-purpose tools: improvements land in the closest existing product, and
a free tool is touched only when it is a front door to a paid one. Pull
requests are reviewed in proportion to risk and merged when their relevant
checks are green.

## History

Ventures were merged in with `git subtree`, so each one's full commit history
is preserved and attributed. The original standalone repositories still exist
and were not deleted.

## License

[MIT](LICENSE). Every venture under `ventures/` also carries its own MIT
`LICENSE`.
