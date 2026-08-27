# The customer proposal

`proposal.mjs` turns a finished bid into the document a contractor hands the
customer: a one-page proposal they print, or "Save as PDF", from the browser.

## Why

Every bid calculator in `ventures/` ends at a number and a plain-text blurb to
paste somewhere. That is where the tool stopped and the contractor's evening
started — retyping the scope into Word, remembering the deposit split, guessing
how long the price should stand. The proposal is the artifact that wins or loses
the job, and none of the thirty-four calculators produced one.

Adopting it costs a contractor nothing and no marginal cent to run: it is
arithmetic and layout in the browser, like everything else here.

## Adopted by

- `ventures/tuckpointing-bid-calculator` — reference implementation
- `ventures/metal-roof-bid-calculator`
- `ventures/walk-in-shower-bid-calculator`
- `ventures/deck-bid-calculator`
- `ventures/roofing-bid-calculator`
- `ventures/siding-bid-calculator`
- `ventures/concrete-bid-calculator`
- `ventures/paver-patio-bid-calculator`
- `ventures/basement-finishing-bid-calculator`
- `ventures/exterior-painting-bid-calculator`
- `ventures/countertop-bid-calculator`
- `ventures/retaining-wall-bid-calculator`
- `ventures/sunroom-bid-calculator`
- `ventures/garage-door-bid-calculator`
- `ventures/foundation-repair-bid-calculator`

The other 86 bid calculators have not adopted it yet. See "Adding it to another
calculator".

## Three things that have gone wrong in every adoption batch

Check these before you verify, because two of the three fail silently.

- **The disclaimer lands inside a single-quoted JS string.** A straight
  apostrophe in the trade sentence — "a licensed engineer's to specify" —
  closes it, and the whole module fails to parse with
  `SyntaxError: Unexpected identifier`. The calculator still renders; only the
  proposal is dead. Use the typographic apostrophe (`\u2019`), which is what
  the rest of the copy uses anyway.

  The venture's own suite cannot see this — it reads `index.html` as text —
  but **`platform/pages/check.mjs` catches it**, and precisely:

  ```
  foundation-repair-bid-calculator/index.html: inline <script> block 4 does not
  parse, so the browser runs none of it -> SyntaxError: Unexpected identifier
  ```

  It runs `node --check` over every inline script on every published page, for
  exactly this class of defect. Build and check before you reach for a browser;
  it is seconds and it is certain.
- **Not every calculator has a `readInput()`.** `roofing` and `concrete` built
  the same input literal at each call site, so the proposal would have been a
  third copy. Extract one function rather than paste a third — three copies is
  how the pasted summary and the printed sheet come to be priced from
  different fields.
- **Preset labels are written for the contractor, not the customer.** They read
  as shorthand a homeowner should never see: `basement-finishing` would have
  printed "Rec room — paint, drop ceiling, carpet (the cheap special)" on the
  quote. Read the labels before you put one on a customer's sheet. Related:
  a preset id on the result may not be the one you want — `garage-door`'s
  `result.doorClass` is the *size* class the width falls into, not the
  construction the contractor chose, and the lookup fails to `undefined`
  rather than erroring.

## The published page is not the page you tested

The venture's own print stylesheet hides `header`, `main` and `footer`. That is
an allow-list over *the venture's* markup, and `platform/pages/build.mjs`
publishes something wider: it injects a `<nav>`, an `<aside>` and a shop-rates
`<section>` as siblings of `<main>`, none of which those three selectors reach.

Printing from `ventures/<slug>/index.html` therefore looked correct while the
published page carried the site navigation, the "more tools" footer, and — the
one that mattered — `.pf-rates-list`, which renders the contractor's saved crew
wage, payroll burden, overhead and target net margin. A contractor who had saved
their rates and left that panel open would have handed the customer their margin
stapled to the quote.

Both injectors now carry their own `@media print` rule, so a calculator adopting
the proposal later is covered without touching it, and
`build.test.mjs` fails if either rule goes missing. **Verify against a built
site, not the venture directory:**

```
node platform/pages/build.mjs --out=dist
cd dist && python3 -m http.server 8899   # then print from the served page
```

## What it does and does not do

It renders **the contractor's own words and numbers** into a tidy layout. It
invents no warranty, lien, arbitration, or cancellation language — those depend
on the jurisdiction and the contract, and a calculator is not the place to draft
them. `proposal.test.mjs` asserts that no such wording can reach the page. The
footer disclaimer names the contractor as solely responsible and this tool as
arithmetic only.

Two properties the tests hold onto, because getting either wrong is worse than
not shipping the feature:

- **The customer's sheet carries no cost, wage, burden, overhead, or margin.**
  The print stylesheet hides `<main>` outright rather than allow-listing what to
  hide, so a new cost field added to a calculator cannot leak onto a customer's
  copy by omission.
- **The customer's name and address are never persisted.** `saveCompany` writes
  the `COMPANY_FIELDS` allow-list and nothing else — a third party's details on
  someone else's device is not ours to keep. The contractor's own business block
  *is* saved, so they type it once.

Figures also add up as printed: the deposit is rounded to cents and the balance
taken as the remainder, so `deposit + balance` equals the printed total exactly.
A homeowner adds those two lines up.

## Vendoring, and the drift test

`platform/pages/build.mjs` publishes each venture directory on its own, so a
`../../platform/proposal/proposal.mjs` import would 404 on the live site. Every
venture therefore vendors its own copy, the same way `usage.mjs` is vendored.

**This directory holds the canonical file.** Fix it here, then copy it out.
`sync.test.mjs` fails if any venture copy has drifted, which is what keeps a fix
from landing in one calculator and not the other thirty-three.

```
cp platform/proposal/proposal.mjs      ventures/<slug>/proposal.mjs
cp platform/proposal/proposal.test.mjs ventures/<slug>/proposal.test.mjs
```

## Adding it to another calculator

The module is generic; only five things are per-trade. Copy the two files above,
then take the rest from `ventures/tuckpointing-bid-calculator/index.html`:

1. **Stylesheet** — the `textarea` rule through the `@media print` block. Change
   `--pr-accent` to the venture's own accent; the rest of the document palette is
   deliberately neutral, because the customer receives a quote, not a printout of
   a website.
2. **Markup** — the `<section id="proposalSection">` form at the end of the input
   column, and `<div id="proposalDoc" class="pr-shell" hidden></div>` between
   `</main>` and the footer. Reword the placeholders for the trade.
3. **Imports** — from `./proposal.mjs`.
4. **Logic** — `COMPANY_KEY` (a venture-unique localStorage key),
   `PROPOSAL_DISCLAIMER` (ending with the trade's own "it is not a … " sentence),
   `restoreCompany`, `suggestScope`, `readProposalInput`, `showProposal`,
   `refreshProposal`, `printProposal`. Only `COMPANY_KEY`,
   `PROPOSAL_DISCLAIMER`, and `suggestScope` differ between trades.
5. **Listeners** — the block starting at `el('proposalScope')`, plus
   `restoreCompany()` and `refreshProposal()` after the page's first `update()`.

Two things that have already gone wrong once each, so check them:

- **Put the logic at the script's top level**, immediately before the trailing
  `update()`. Anchoring on the first `el(` in the file lands it inside whichever
  function happens to come first, and the helpers end up scoped to it.
- **`refreshProposal` is delegated from `document`, not called inside
  `update()`.** Every calculator's `update()` has a different shape; one
  bubble-phase listener works in all of them, which is what makes this copyable.

Write `suggestScope` by hand for the trade. Do not derive it from
`formatBidSummary`'s `SCOPE BASIS` block, tempting as that is — every one of
those blocks lists crew-hour breakdowns, which must not reach a homeowner.

Then verify in a browser, not only with `node --test`: price a job, print, and
confirm the sheet carries the price and not the wages.
