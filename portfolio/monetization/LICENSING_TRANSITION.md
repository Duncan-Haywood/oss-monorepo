# Licensing transition: products go proprietary and paid, tools stay MIT

Owner, 2026-11-24: "moving the apps to subscription and one off saases";
"as direction transitioning everything that direction moving licenses to more
prop esp for the for profit and non lead magnet ones"; model chosen by
per-use cost; "use ur judgement on the way to do it".

This file is how. [`transition.py`](transition.py) applies the rules below to
every venture and writes [`transition.json`](transition.json) (the move list,
in order). Run `python3 portfolio/monetization/transition.py` for the table.

## The split (2026-11-24 reading)

| Track | Count | Licence from here on | Where new work happens |
|---|---|---|---|
| `proprietary`: products with depth | 20 | proprietary, all rights reserved | `private-monorepo/apps/<slug>` |
| `mit-lead-magnet`: single-purpose free tools | 1,415 | MIT, unchanged | this repository |
| `mit-commons`: open hardware, open plans, devotional | 5 | MIT, unchanged | this repository |
| `mit-deployer-run`: `sales-agent` | 1 | MIT, unchanged | this repository |

Of the 20 products, **8 are subscriptions** (a model call, a server, storage or
a rule set we keep current costs money each month per customer: ai-bookkeeper,
einvoice-preflight, shift-roster-builder, league-schedule-generator,
local-site-studio, print-atelier, babysitting-business-kit,
real-estate-agent-photo-app) and **12 are one-off licences** (they run in the
user's browser or machine: wall-framing-takeoff, changepoint-detector,
photo-editing, quick-pick-survey, ids-model-check, xer-schedule-check,
ifc-quantity-takeoff, ig-media-pipeline, shed-designer, clothing-design-studio,
retail-pilot-intel, sales-export-to-journal).

### Why these rules

- **Product vs lead magnet: depth, not the self-description.** Nearly every
  `VENTURE.yaml` says "lead magnet and donations", because that was the only
  model allowed when it was written, so the label carries no signal. Code depth
  does: the catalogue splits cleanly at about 5,000 lines of non-test source
  (25 ventures above, 1,400+ below). Flagships and `models.yaml` rows count as
  products at any size. A `-calculator` / `-check` / `-checker` stays a lead
  magnet however long its rule tables (ebay-fee-calculator is 5,600 lines of
  fee tables, and its job is still to be found).
- **Subscription vs one-off: per-use cost** (the owner's pick). It is also the
  honest price: a subscription for something that costs us nothing to serve is
  rent, and a one-off price for something that calls a model every month loses
  money on the heaviest users. Subscriptions are priced cost-plus the way
  Grant Autopilot is (`private-monorepo/apps/grants/docs/PRICING.md`: 1.3× to
  2.0× of the fully loaded cost, enforced by a unit test).
- **Exceptions are named, with reasons**, in `OVERRIDES` in `transition.py`.
  Overturn one with evidence in a PR.

## What a licence change can and cannot do

- **Published MIT code stays MIT.** Every version already in this public
  repository was granted to everyone under MIT, and that grant cannot be
  withdrawn. Anyone may keep using, forking and selling those versions. The
  move changes the licence of **new work**, not old copies.
- **The owner can do this because the owner holds the copyright.** Each
  venture's `LICENSE` names Duncan Haywood. Fork pull requests are never merged
  (`CLAUDE.md`, "Public repository"), so no outside contributor holds rights
  in the code. Before importing a venture, check its history for a co-author
  who is not the owner or an agent working for them. If there is one, don't
  import that code until it is cleared.
- **Third-party code keeps its own licence** (`goals.md`, "Only code we can
  relicense"). `transition.json` lists every nested `LICENSE` file per product.
  MIT, BSD and Apache-2.0 code can ship in a proprietary build with its notice.
  GPL, AGPL or no licence at all cannot. Test corpora under `eval/` or
  `samples/` (einvoice-preflight's nfelib, ids-model-check's bSI samples) are
  test data and are not shipped. Check each one before a paid build carries it.
- **Website-request results stay MIT.** The intake forms promise MIT to
  requesters (`goals.md`). None of the 20 products came from an outside request
  (R-0001..R-0005 are the owner's own asks), so nothing here conflicts. A later
  outside request still ships MIT.
- **Research stays MIT.** `research/` is built to be cited and reproduced.

## How one product moves

1. **Freeze the free edition.** Tag the current public version
   (`<slug>-free-v1`), and have the page say it is the free edition, with a
   link to the paid one once that exists. The public copy keeps working and
   keeps its SEO, and from then on it gets only lead-magnet maintenance
   (fixes, page polish), not new depth.
2. **Import it into the private repository** with
   `private-monorepo/scripts/import-venture.mjs <slug>`. The script copies the
   tree at a named commit, records the source commit and the third-party
   licence list in `apps/<slug>/PROVENANCE.md`, keeps the MIT notice for the
   imported baseline, and adds the proprietary notice that covers changes made
   after the import.
3. **Build the paid path there**: a cost-plus subscription or a one-off licence
   key, through the merchant of record behind a `BillingProvider` port as
   Grant Autopilot does. It stays dark (no checkout link set) until the owner
   opens the merchant account.
4. **Route runs**: the venture's flagship row (if any) points deepening work at
   the private app, and `transition.json` marks it `moved`.

Status (2026-11-24): **wall-framing-takeoff is imported** (step 2,
private-monorepo PR #8, 304 files, its tests pass there); steps 1, 3 and 4 are
next. `MOVED` in `transition.py` records each import.

Order: `move_order` in `transition.json`, which follows flagship rank and then
depth. wall-framing-takeoff is first: its licence-key and checkout modules
(`licence.mjs`, `checkout.mjs`) are already built dark.

## What waits on the owner

- **Hosted subscriptions make the owner the operator and the data holder.**
  `README.md` row 8 used to rule that out, and the "Original work is
  MIT-licensed" line in `prompts/goals.md` still says otherwise. Both lines are
  amended in a separate control-plane PR that needs the owner's approval.
- **The merchant-of-record account** is Paddle (owner, 2026-11-24). A paid
  path ships dark until the owner sets that product's Paddle config. That blocks no move.
