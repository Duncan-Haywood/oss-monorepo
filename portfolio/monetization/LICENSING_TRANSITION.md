# Licensing transition: products go proprietary and paid, the public repository goes FSL

Owner, 2026-11-24: "moving the apps to subscription and one off saases";
"as direction transitioning everything that direction moving licenses to more
prop esp for the for profit and non lead magnet ones"; model chosen by
per-use cost; "use ur judgement on the way to do it".

Later the same day the owner chose to restrict the public repository too: "I
want to do the change to a more restrictive license", picking a
source-available licence for the public repository over a non-commercial one.
That move is the section "The public repository: FSL-1.1-MIT" below.

> **Superseded, 2026-11-26: products live here, all rights reserved.** The
> owner corrected where the products go: "they stay in open but with
> restrcitve license", then on the licence: "i dont think convert to mit in 2
> years. just all rights reserved license". Asked the same day, the owner chose
> to bring wall-framing-takeoff and einvoice-preflight back from
> `private-monorepo` and to move the apps built only there (payapps, cmmc,
> jobshop-quote, seller-books, grants, admin, their sites and `packages/`)
> into this repository too. So:
>
> - the `proprietary` track's products, and every paid app, live in this
>   public repository under an **all-rights-reserved** notice (source visible,
>   no licence granted, no future-licence conversion); the free tools stay
>   FSL-1.1-MIT;
> - what cannot be undone stays as it is: a version already published under
>   MIT or FSL keeps that licence, and FSL releases still convert to MIT two
>   years after each one shipped. The new notice covers work from the change on;
> - `private-monorepo` keeps only what must stay private: the payments-account
>   infrastructure (the AWS payments account trusts only that repository's
>   OIDC tokens, `platform/aws/stacks/github-oidc/variables.tf`), secret
>   inventories, and owner-confirmation checklists;
> - nothing is published before a pre-publication audit (secrets, personal
>   data, client data, security-sensitive notes) of each app, because
>   publishing cannot be reversed.
>
> Steps: task `products-to-public-repo` in `portfolio/work/tasks.yaml`. The
> "proprietary, `private-monorepo/apps/<slug>`" column below is out of date
> until that task closes.

> **Superseded in part, 2026-11-24 (later the same day).** The owner then set
> that products are vertical software suites for small and medium businesses,
> chosen by promise and value rather than by how much code already exists
> ("we don't invest dev effort in sunken ships"), with business tools as the
> first path and construction the favourite vertical (`prompts/goals.md`,
> "Where effort goes"). So the 20-product list below is a **licence** list,
> not a work queue: which products get built is decided by
> [`bets.md`](bets.md). The licence mechanics (what a move can and cannot do,
> how one product moves) still apply to whatever is chosen. The 1,400+
> lead-magnet rows are demoted: no new depth, work only where a tool is the
> front door to a chosen paid product.

This file is how. [`transition.py`](transition.py) applies the rules below to
every venture and writes [`transition.json`](transition.json) (the move list,
in order). Run `python3 portfolio/monetization/transition.py` for the table.

## The split (2026-11-24 reading)

| Track | Count | Licence from here on | Where new work happens |
|---|---|---|---|
| `proprietary`: products with depth | 20 | proprietary, all rights reserved | `private-monorepo/apps/<slug>` |
| `mit-lead-magnet`: single-purpose free tools | 1,415 | FSL-1.1-MIT (was MIT) | this repository |
| `mit-commons`: open hardware, open plans, devotional | 5 | FSL-1.1-MIT (was MIT) | this repository |
| `mit-deployer-run`: `sales-agent` | 1 | FSL-1.1-MIT (was MIT) | this repository |

The track names keep their `mit-` prefix because `transition.json` and its
readers key on them; they now mean "stays public", not "stays MIT".

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

## The public repository: FSL-1.1-MIT

Since 2026-11-24 the original work in this repository is under the
[Functional Source License 1.1, MIT future licence](../../LICENSE)
(SPDX `FSL-1.1-MIT`, the text from fsl.software, verbatim).

- **What it allows**: reading, running, changing and redistributing the code
  for any purpose except a Competing Use, which is offering it to others in a
  commercial product or service that substitutes for it or for a product we
  offer with it. Internal use, teaching, non-commercial research and client
  work on it are named as allowed.
- **What it stops**: someone lifting a tool, or the whole catalogue, and
  selling it as their own competing product. That is the risk a public MIT
  repository carries once its products are sold.
- **Why FSL over the alternatives** (the owner chose "source-available" over
  "non-commercial"): PolyForm Noncommercial would stop a plumber using a quote
  calculator in their business, which is the point of a lead magnet. BUSL needs
  a per-product "additional use grant" and a change date chosen by hand, and is
  flagged by more corporate licence scanners. AGPL is open source and does not
  stop a hosted competitor who publishes their changes. FSL is short, fixed
  text with one restriction and an automatic two-year conversion to MIT, so
  nothing stays locked up for good.
- **What it is not**: open source in the OSI sense. Pages that said "free and
  open source" now say "free to use and source available"; the honest-marketing
  rule (`goals.md`) applies to licence claims as much as any other.

What moved, and how. [`relicense_fsl.py`](relicense_fsl.py) did it, and its
`--check` mode exits 1 when anything still needs rewriting:

- every licence file holding the owner's MIT text (1,446 under `ventures/`,
  plus the root `LICENSE`) now holds the FSL text with the same copyright
  line;
- our own licence statements on pages, READMEs, `llms.txt` files, FAQ JSON-LD,
  package manifests (`package.json`, `Cargo.toml`, `pyproject.toml`) and the
  page tests that assert them; a sentence about someone else's open-source
  project (Kokoro, zizmor, ggplot2) is left alone;
- by hand: the site generators in `platform/pages/`, the distribution channels
  in `platform/distribution/` (npm, PyPI, MCP, desktop, Homebrew, GHCR, Nix,
  GitHub Actions, mobile and browser-extension builds now declare
  `FSL-1.1-MIT`), `README.md`, `CONTRIBUTING.md`, `CITATION.cff` and the
  third-party check (`platform/ci/check_third_party.py` accepts the owner's
  FSL files and `SPDX-License-Identifier: FSL-1.1-MIT`).

Left on MIT, each for a reason:

- **`research/`**: built to be cited, reproduced and extended.
- **Website-request results from outside requesters**: the intake forms
  promise MIT. None exist yet; one gets an MIT `LICENSE` in its own directory.
- **The WordPress "Free Tools Embed" plugin and the VS Code catalogue
  extension** (`platform/distribution/wordpress.mjs`, `vscode.mjs`): launchers
  that hold links, not tool code. WordPress.org lists only GPL-compatible
  plugins, which FSL is not.
- **Every version published before the change**: MIT grants are irrevocable.

What waits on the owner: `prompts/goals.md` still says "Original work is
MIT-licensed" under "Licensing and attribution". `prompts/` is control plane,
so that line is amended in its own PR for the owner's approval.

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
