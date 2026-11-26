# Monetization: the business model, product by product

Owner, 2026-11-02: "looking into monetization plans and business model for
the things in this repo. this should be a continual thing to focus on."

This directory is where that work lives between sessions:

- **`bets.md`** (lands with PR #18675): the paid bets, ranked 2026-11-24 by promise and
  value, with every competitor price and market size sourced. **Start here.**
  Since that day the top rows of
  [`portfolio/flagships.yaml`](../flagships.yaml) are these seven bets, in
  bets.md's order, each pointing its deepening work at
  `apps/<slug>` in this repository (`app:`; the paid apps moved here from
  private-monorepo on 2026-11-26, and only `private-monorepo/apps/grants`
  stays there, it holds client-confidential material); every other flagship row is
  `demoted:` below them with its reason.
- **[`models.yaml`](models.yaml)**: one row per product with its buyer, model,
  first paid offer, a price hypothesis, competitors' list prices (with source
  and the date read), its stage, and the next step. Each bet has an `app:` row
  (below, "The paid bets"): subscription billing, proposed tiers labelled
  `status: proposal` with their reasoning, cost drivers, Paddle, checkout
  dark. The older `venture:` rows are the public free editions' one-off packs.
- **[`monetization.py`](monetization.py)**: prints the table and the next
  agent-doable step (`next`), and validates the file (`--check`). Tests:
  `python3 -m pytest -q portfolio/ledger/test_monetization.py` (kept there so
  the merge checklist's existing `portfolio/ledger` line runs it).
- **[`SCENARIOS.md`](SCENARIOS.md)** with [`evaluations.json`](evaluations.json)
  and `evaluate.mjs`: every catalogue category (15) and flagship (10) in three
  year-one revenue scenarios (now, payout rail on, 12-month traffic goal)
  driven by the measured traffic, with the GTM steps and the owner decision
  each mechanism waits on. `node portfolio/monetization/evaluate.mjs`; tests
  `node --test portfolio/monetization/*.test.mjs`.
- **[`LICENSING_TRANSITION.md`](LICENSING_TRANSITION.md)** with
  `transition.py` and `transition.json`: the owner's 2026-11-24 direction.
  Products (20) move to proprietary licences and paid subscription or one-off
  models in the private repository; lead magnets (1,415) stay MIT. Tests:
  `python3 -m pytest -q portfolio/monetization/test_transition.py`.
- This README: the reasoning, so a later run can disagree with it on purpose.

It is listed as request R-0004 in
[`portfolio/requests/requests.json`](../requests/requests.json), so the
request queue keeps routing runs to it. A run that takes it runs
`monetization.py next`, lands that step, moves the row's `stage` and rewrites
its `next` in the same PR.

## The owner's frame

From [`prompts/goals.md`](../../prompts/goals.md): value for people first,
then "more income without opening to liability financial or legal", then
free software with a coffee or sponsor link. The business model for ventures
(2026-10-15) is one-click deploy: strangers run their own copies on their own
keys, and the owner hosts nothing and is not the operator. On 2026-10-31 the
owner chose a **merchant of record** as the payout rail and on 2026-11-01 said
"turn on for profit ... don't let it block work". The guardrail change that
allows it is [PR #12243](https://github.com/Duncan-Haywood/oss-monorepo/pull/12243),
waiting on the owner's approval; the design that keeps any key out of agent
reach is [`docs/reports/2026-10-30-billing-plan.md`](../../docs/reports/2026-10-30-billing-plan.md)
(Option A: a hosted checkout link and a licence-key validate call, no secret
anywhere).

## The constraint that matters most: traffic

Revenue is visitors × the share who buy × price. The site's own first-party
counter ([`portfolio/usage/site-visits.json`](../usage/site-visits.json),
human page loads, not people) recorded **41 page loads across the five days
it has data for (2026-10-24 to 2026-10-30), between 4 and 13 a day, on at
most four distinct pages a day**. The crawler beacons that same week ran in
the thousands. So at today's traffic any model earns about nothing, whatever
its price; that is a measured reading, not a guess about demand.

Two things follow:

1. **Distribution and SEO are monetization work.** Every paid offer below is
   worth building only alongside the work that gets its page found (the
   owner's standing SEO and distribution directions in `goals.md`).
2. **Build the paid path dark, cheaply, once.** A paid path that renders only
   when a checkout link is set costs nothing to carry and is ready the day the
   rail and the traffic exist. One reusable checkout component, proved on one
   product, then copied, beats six bespoke ones.

## Revenue options, ranked by income without liability

| # | Option | Who holds the money | Liability for the owner | Status |
|---|---|---|---|---|
| 1 | **Donations** (GitHub Sponsors link on every venture, one Buy Me a Coffee link) | owner | none | live; the repo-level Sponsor button (`FUNDING.yml`) is owner decision `funding-sponsors-live` |
| 2 | **Paid extras on flagships** through a merchant of record's hosted checkout: one-off or yearly licence for new depth (branded exports, packaged offline builds, template packs) | merchant of record, paying out to the owner | low to medium: the MoR is the seller for tax and VAT; product terms, refunds and the disclaimer stay the owner's | rail chosen, account not open; first offer chosen (below) |
| 3 | **Deployer-run businesses**: the one-click-deploy copies, with payment code on the deployer's own keys | the deployer | none for the owner (they are the merchant) | the existing model; keep shipping it |
| 4 | **Paid priority lane on custom development** (website requests stay free; an optional paid "build mine next" lane, output still MIT) | MoR | medium: a paid promise of delivery | owner question 2 below; not built |
| 5 | **Grants for open-source and research work** (foundation and public open-source funds) | owner or an entity | low, but needs the owner's identity and applications | owner question 3 below |
| 6 | Affiliate links on comparison pages | owner | medium: FTC disclosure, and it pays us to recommend the paid tools our pages compare against | not recommended |
| 7 | Display ads on calculator pages | owner (ad account) | low legal, real product cost: slower pages, worse look, against the "serious looking" site direction; near-zero at this traffic | not recommended now |
| 8 | Hosted SaaS subscriptions run by the owner | merchant of record, paying out to the owner | high: the owner becomes operator and data holder; priced cost-plus so per-user server cost is covered | **direction since 2026-11-24** for the 8 subscription products in [`LICENSING_TRANSITION.md`](LICENSING_TRANSITION.md); the `goals.md` line waits on a control-plane PR |

## The paid bets (2026-11-24; detail in `models.yaml`, evidence in `bets.md`)

The owner, 2026-11-24: "invest in things that have most promise and most
value"; the north star is $10k MRR. Every bet is a subscription built in
`apps/` here (grants in `private-monorepo`), sold through Paddle, and dark until the owner sets its
price ids. **Every tier price is a proposal** (no sale has happened); each
one's `why` names the comparable it is set against, and those comparables
come from bets.md's sources (many are aggregator listings: re-read the
vendor's page before setting a Paddle price).

| Bet | App (`apps/`; grants in `private-monorepo/apps/`) | Customer | Proposed tiers (a month) | Main cost driver | Stage |
|---|---|---|---|---|---|
| 1 | `payapps` | specialty subcontractors, small GCs | $99 / $179 / $249 | document storage, QuickBooks sync | planned |
| 2 | `jobshop-quote` | CNC and fabrication job shops | $199 / $399 | model calls per RFQ | planned |
| 3 | `einvoice-preflight` | DE/FR SMEs, accountants, invoicing vendors | EUR 19 / EUR 49 / metered API | CPU per document, rule upkeep | planned |
| 4 | `cmmc` | small defense and aerospace suppliers | $49 / $249 / $399 | secure evidence storage | planned |
| 5 | `seller-books` | multi-platform resellers | $12 / $24 / $49 | near zero; Paddle's fee at $12 | planned |
| 6 | `wall-framing-takeoff` | remodelers, roofers, framers | $79 / $149 | plan-set storage | planned |
| 7 | `grants` | small nonprofits | cost-plus, per the app's `docs/PRICING.md` | model calls | built-dark |

`monetization.py next` takes the bet rows first, in bet order; the router
(`allocate.py`) gives each bet a Deepen row from its `app:` even where no
`ventures/<slug>` exists. `--check` refuses a bet row whose tiers are not
labelled proposals with a reason, whose rail is not Paddle, or which has no
cost drivers.

## Product by product, the free editions' older offers (detail and sources in `models.yaml`)

- **wall-framing-takeoff (first paid product).** Builders already pay for
  takeoff software: Buildxact lists $149 to $399 a month, Autotakeoff from
  $49 a month (pages read 2026-11-02). Liability is medium (a wrong count
  costs a builder money), handled with the disclaimer, a refund policy and the
  engine's self-checks. It is the first flagship, the owner's construction
  direction, and the product whose buyers are businesses that pay for tools.
  First offer: a **branded bid-package PDF** (logo, terms, takeoff, cut list,
  schedule) unlocked by a yearly licence key. It is new depth, so nothing the
  page calls free gets paywalled. Price hypothesis: $49 to $99 a year,
  untested.
- **league-schedule-generator (second).** The lowest liability in the set (a
  schedule is not advice). Its buyers are volunteers with small budgets, so
  the first job is to read competitors' public prices before choosing a
  season-pack extra.
- **shift-roster-builder (parked).** The market has a free tier and plans
  from $2.50 a user a month; a hosted plan would need servers. It stays free
  and self-hosted and reuses the checkout component later.
- **einvoice-preflight (owner question).** Validation sells for about $4 per
  1,000 documents on API marketplaces and free official validators exist, so
  checks are a commodity. The depth is 60+ countries of rules; the plausible
  sale is priority on the next country rule, which is option 4.
- **ai-bookkeeper (parked, highest exposure).** The highest willingness to pay
  (QuickBooks Online Simple Start lists at $38 a month) and the highest
  liability, since books feed tax returns. Not first. Sell convenience, not
  anything that reads as advice, and only after real-book measurements.
- **sales-agent (donations only).** Whoever sends the email is the sender of
  record, so it stays deployer-run on the deployer's keys.
- **The ~1,300 calculators.** Donations only. They are the traffic engine
  that feeds the flagships' pages; their job in this plan is to be found.

## What counts as progress

A run moves one row's `stage` forward (`none` → `planned` → `built-dark` →
`test-paid` → `live`) or adds evidence the plan can use: a competitor's price
with its source and date, a measured traffic or click reading, a priced and
tested offer. `monetization.py --check` refuses a `test-paid` or `live` row
without an `evidence` file, so no row claims a sale it can't show. Writing
that revenue is $0 again is not progress (PR #12243: "Runs should not
re-measure that revenue is $0").

## Open questions for the owner

1. **Approve [PR #12243](https://github.com/Duncan-Haywood/oss-monorepo/pull/12243)**
   and open the merchant-of-record account. **Done 2026-11-24: Paddle**
   (owner: "we have payment rails thorugh paddle now"). Each paid path still
   ships dark until the owner sets its Paddle price ids and checkout config.
2. **Paid priority lane on custom development?** Requests stay free and MIT;
   a buyer could pay to be built next. It earns from the people most likely
   to pay (businesses with a named job) but it is a promise with a deadline.
   Yes, no, or later.
3. **Grants?** Open-source and research funds need the owner's identity and a
   short application. If yes, a run can draft the applications for the owner
   to send.

## Adding a product

Add a row to `models.yaml` with at least one comparable read from a named
vendor's own or a review site's pricing page (source URL and date), a
liability level, and a first offer that is new depth rather than a paywall on
a free feature. Run `monetization.py --check`.

## Going live (golive.py)

When the owner has a hosted checkout link, `python3 portfolio/monetization/golive.py set <https-link>`
(or `set slug=<link> ...` for a link per product) fills `CHECKOUT_URL` in every
`ventures/*/checkout.mjs`; `unset` goes dark again; no argument shows status.
It accepts only plain https links and edits nothing else. Then run each
venture's tests and move its stage to `test-paid` only after a real test-mode
purchase (tested in `test_golive.py`, added 2026-11-03).
- 2026-11-03: go-live rehearsal. Set a test https link on all six paths; six tests asserted an empty link and failed. Relaxed to pass dark or live (ventures/*/{closepack,report,printpack,buildpack,staffpack,bidpackage}.test.mjs). Dark and live both green for pack, licence and page suites.

## Verticals and front doors (verticals.py)

`python3 portfolio/monetization/verticals.py --write` assigns every venture a
customer vertical (construction, manufacturing-engineering, online-sellers,
eu-einvoicing-accounting, nonprofits, freelancers, landlords, local-services,
creators, consumer, hardware-open-designs, research-tool, other), the paid bet
of `bets.md` whose buyers it reaches (`front_door_for`, or null) and a
`status`: `front-door` (it may get work that sends visitors to that bet: a link
into the product, a page fix that keeps its search traffic) or `frozen` (stays
up, no new effort beyond fixing what breaks; `prompts/goals.md`, "Free tools
are demoted"). Output: `verticals.json`, read by the site's front-door mapping
and by runs choosing work. `--check` fails when the file is stale; `--show
<vertical>` lists one vertical with the rule that placed each venture.

Rules, first match wins: hand `OVERRIDES` (each with a reason), slug keywords,
the category the site build files the tool under (`categoryFor` in
`platform/pages/build.mjs`, read through node), VENTURE.yaml description
keywords for the build's generic categories, then `other`. Each row records
its `rule`, so a wrong row points at the pattern to fix; `test_verticals.py`
pins the word-boundary traps found while calibrating (vending-*machine*,
menu-*engineering*, *section-8*3b, *stud*io, p*lumber*, water*proof*ing).

First reading (2026-11-24, 1,441 ventures): 301 front doors, 1,140 frozen.
The contractor suite has 153 front doors and seller books 105, but the
job-shop quoting bet has 9 and the CMMC bet 2 (two research tools, by
override): the catalogue has almost nothing for machine shops, so those two
bets need their own entry pages rather than borrowed traffic.
