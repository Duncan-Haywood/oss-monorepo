# The cost-plus offer to regional small businesses

The owner, 2026-11-24:

> "i think one of the target goals we have is basically moving from free to
> cost plus offers to smbs. we do custom software. we handle compliance etc.
> and you get at close to what it costs for you to grow your business without
> the time sink cost or headache of developing it in house. look at pain
> points. whole suites of softwares for specific types of businesses. solving
> all of their problems. iterate the specific most common problems for
> specific and niche smbs."

and, minutes later:

> "regional businesses sort of thing generally stay away from large
> enterprise and stick with smbs."

This file says what that offer is, how it is priced, what "we handle
compliance" may honestly promise, and what is still the owner's call. The
evidence for which businesses to serve, and with what, is in
[`verticals.yaml`](verticals.yaml) (sourced pain points, incumbent software
and prices, and the record-keeping rules for each kind of business), with a
reading in [`VERTICALS.md`](VERTICALS.md). The arithmetic is
[`cost_plus.py`](cost_plus.py) over [`cost_basis.yaml`](cost_basis.yaml).

Related work still open when this was written: the SMB audience direction and
strategy (PR #18697, `portfolio/smb/README.md`), the paid SaaS pivot with its
suite list (PR #18008), the cost-plus direction (PR #18486) and the ranked
paid bets (PR #18675, `portfolio/monetization/bets.md`). All four change
owner-gated files and wait on the owner. This file adds what none of them has:
the per-vertical evidence and the price mechanics. It edits none of their files.

## Who it is for

**Regional, owner-run businesses of roughly 1 to 50 people**: the HVAC
company, the two-location dental practice, the independent vet, the salon,
the pest-control route, the pool-service company, the auto shop, the
property manager with a few hundred doors, the craft brewery, the funeral
home. Customers come from a town or a metro area, and the owner usually
decides on software alone or with one other person.

**Not enterprise.** No multi-region chains, franchisor headquarters, dental
service organisations, private-equity roll-ups or procurement-led sales.
The reasons are practical. They buy through RFPs and security reviews that
take months. They want custom contracts and SLAs we cannot staff. And
enterprise vendors already serve them. The small shop is the one the big
vendors price out or underserve, and the one a suite built once can serve
many times.

## The offer, in one paragraph

We build and run a suite of software made for your kind of business:
scheduling, quotes and invoices, the records your regulator or inspector
asks for, reminders, reports. We keep it current when the rules change. You
pay what it costs us to run your share of it, plus a stated margin, and we
show you the cost lines. If you need something only your shop needs, we
quote it the same way: our cost for the hours, plus the same margin. You
get software built for your trade without hiring a developer, and without
paying for an enterprise product's sales team.

## Why cost-plus can undercut the incumbents and still make money

A suite is built once per vertical and shared by every shop in it. So the
cost per shop has two parts:

- **variable**, what one more shop adds: model tokens, storage, database
  rows, the merchant's fee, support time;
- **shared**, divided across all the shops: the build (amortised over
  `amortize_build_months`), upkeep, rule-change watching, platform minimums.

With 1 shop the shared part dominates and the price is high. With 100 it is
small and the price approaches variable cost × markup. `cost_plus.py --suite
<slug>` prints that curve, and how many shops a given price needs to reach
$10k of monthly recurring profit. The incumbents' list prices sit in
`verticals.yaml` beside each vertical (where a vendor publishes one), so the
gap is a number a page can state, not an adjective.

**The margin is not zero.** The North star is $10k MRR and then $10k MRP
(`prompts/goals.md`). "Close to cost" means a stated, modest markup, with
1.5× as the default in `cost_basis.yaml`. That is enough to fund support and
the next vertical. The owner can change it per suite. The open PRs above
proposed 1.3–2.0× and "about cost plus 100%". The calculator takes any value,
but never one below 1.0.

**Hold the price as shops join.** If the price is recomputed at every new
shop count, profit per shop shrinks as the shared cost spreads, and monthly
profit grows slowly. On the placeholder basis, that is under $6k at 250
home-services shops. So each suite's price is set once, at its planned shop
count (`plan_shops`), and reviewed yearly. Later savings go into the shared
core and the next vertical, and the cost lines stay published so customers
can see why. `cost_plus.py` prints both views: the held price's path to $10k
MRP, and the curve if the price were recomputed.

**Support is the cost that decides the price.** Under the placeholder
basis, half an hour of support a month is about 90% of a trade shop's
variable cost. Tokens and hosting come to $3–6. Self-serve onboarding and
support that answers itself are therefore the margin, more than any choice of
model or host (`VERTICALS.md`, "What the cost basis says").

## Three price lines

| Line | What it covers | How it is priced | Counts as |
|---|---|---|---|
| Suite subscription | The vertical suite, hosting, backups, compliance updates, support | `cost_plus.quote()` at the planned shop count; reviewed as shops join | MRR |
| Custom work | A feature or integration only one shop needs | hours × cost rate × markup (`--custom-hours`) | one-off income, not MRR |
| Custom upkeep | Keeping that shop-only feature running | its own variable cost × markup, added to the subscription | MRR |

Custom work that turns out to be wanted by other shops in the vertical moves
into the suite. The shop that paid for it gets a credit, recorded in the
quote. That is how one shop's request becomes a module.

## What "we handle compliance" may promise

The honest-marketing hard limit applies to every page and message. Each
vertical's compliance list in `verticals.yaml` names the rule, the authority
and the records it requires, with a source. The suite can:

- keep the records those rules require, in the form an inspector or auditor
  asks for (refrigerant logs, pesticide-use records, controlled-substance
  logs, attendance and ratio records, temperature logs, price lists);
- remind staff before a deadline and flag a missing entry;
- produce the report or filing *draft* the rule asks for;
- say which rule each feature supports, with a link to the rule;
- track changes to those rules and update the suite, saying when it changed.

It may **not** claim to make a business compliant, to certify anything, or to
give legal, tax or medical advice. Where the data is regulated (patient
health information, children's records), the suite runs on infrastructure
with the required agreements, such as a HIPAA business associate agreement.
That is a cost line, and the owner sets it up (Hard limits, accounts). Wording
to use: *"Keeps the records [rule] requires and reminds you before
[deadline]. You remain responsible for compliance; this is not legal
advice."* Every user-facing page carries the portfolio disclaimer
(`PRODUCT_PLAYBOOK.md`).

## How a vertical gets picked

From `verticals.yaml`, roughly in this order:

1. **Pain that recurs weekly or daily** and has evidence from owners
   themselves, not only from vendors.
2. **A compliance record the business must keep.** It gives the suite a
   reason to be opened every week and a reason not to churn.
3. **An incumbent price the cost-plus curve beats** at a shop count we can
   reach, or an incumbent that is missing or quote-only for small shops.
4. **Reachable shops**: a public, lawful way to find them (licensing boards,
   association directories, local search). The outreach rules in
   `goals.md` (CAN-SPAM, GDPR/PECR, no bought lists where forbidden) hold.
5. **Reuse**: free tools in `ventures/` that already do one job for that trade
   become the suite's front door and first module.

The first module is the one with the highest recurring pain that a shop can
use alone in its first week. Each vertical's `first_module` says which one
and why.

## Where it is built

Suite code is a paid product. It goes in `private-monorepo` under a
proprietary licence, as `LICENSING_TRANSITION.md` sets out. The free MIT tool
for the same job stays here as a lead magnet. This file, the evidence and the
calculator stay public, because pricing on an open book is part of the pitch.
Each shop owns its data and can export it whenever it wants. Data export is
in every suite's definition of done.

## What waits on the owner

None of these blocks building. They block selling.

- **Terms of service and a custom-work agreement**: who owns code written for
  one shop. Proposed default: we own the suite and any custom code, the shop
  gets a perpetual licence to use what it paid for, and its data is always
  its own. This is a legal decision, so it is the owner's.
- **The default markup** (1.5× here) and whether the cost lines are shown to
  customers in full.
- **A HIPAA-eligible hosting account** before any dental, veterinary (where
  state law adds requirements), PT or chiropractic suite stores patient
  data.
- **Paddle products and prices** per suite. The checkout ships dark until
  then (Guardrails, "Payments").
- The decision queue (`python3 portfolio/ledger/decision_queue.py`) already
  holds the payout rail and outbound-sending asks; these are new.

## Log

- 2026-11-24: file created from the owner's two messages above. The
  vertical evidence comes from three web-research passes the same day. The
  cost basis has published unit prices for Paddle, Cloudflare and the Claude
  API; every other line is marked `assumption` until a bill or log replaces
  it. No customer, quote or revenue exists yet.
