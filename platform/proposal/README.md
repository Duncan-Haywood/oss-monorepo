# The customer proposal

`proposal.mjs` turns a finished bid into the document a contractor hands the
customer: a one-page proposal they print, or "Save as PDF", from the browser.

## Why

Every bid calculator in `ventures/` ends at a number and a plain-text blurb to
paste somewhere. That is where the tool stopped and the contractor's evening
started — retyping the scope into Word, remembering the deposit split, guessing
how long the price should stand. The proposal is the artifact that wins or loses
the job, and none of the calculators produced one.

Adopting it costs a contractor nothing and no marginal cent to run: it is
arithmetic and layout in the browser, like everything else here.

## Adopted by

**100 of the 101 bid calculators**, and the list is no longer worth keeping by
hand: `node platform/proposal/adopt.mjs --list` prints what is adopted, what is
ready, and what is blocked.

27 of those were hand-ported, one batch of six at a time. The remaining 73 are
generated from `trades.json` by `adopt.mjs`, and their pages carry
`proposal:begin` / `proposal:end` markers so a re-run replaces the generated
regions rather than layering a second proposal on top.

The last twelve to adopt were the **itemised** trades — flooring, gutter
cleaning, hood cleaning, janitorial, junk removal, lawn care, moving, painting,
pest control, pressure washing, tree service, window cleaning — and they needed
two things the module did not have.

They each built their input object inline at every call site rather than having
one `readInput()`, so there was no single function the proposal could call to
price the job on screen. Extracting that reader is worth doing for its own
sake: `flooring` had the same literal three times, and `janitorial` six.

And they price a job made of **rows** — rooms, gutter runs, trees, exhaust
components — where every earlier trade priced one thing. A homeowner collecting
three bids compares the line items, so `scopeLines` grew `each` (see
`proposal.mjs`); without it the best scope these could draft was the generic
sentence this README says is worth less than no proposal.

**`mobile-detailing` is deliberately not adopted.** It is a quote check rather
than a build-up: its inputs are hours and costs, with nothing describing the
work, so its drafted scope could only be "Perform the work described above".
That is the one case where no proposal beats a generic one.

## Adopting a calculator

Two files, then two commands.

1. Add an entry to `trades.json` keyed by the venture slug:

   ```json
   "sump-pump-bid-calculator": {
     "jobTitle": "Sump pump replacement — {pumpLabel}",
     "fields": { "pumpLabel": { "select": "pump" } },
     "scope": [
       "Supply and install a {pumpLabel}",
       { "line": "{extraDischargeFeet} ft of extra discharge", "when": "extraDischargeFeet" },
       "Test the pump under water and leave the basin clean"
     ],
     "placeholders": { "scope": "...", "exclusions": "...", "notes": "..." },
     "disclaimerTail": "It is not a drainage design."
   }
   ```

2. Generate and check it:

   ```
   node platform/proposal/adopt.mjs <slug>
   node platform/pages/build.mjs
   node platform/proposal/verify.mjs <slug>
   ```

`adopt.mjs` writes the stylesheet, the form, the print rules and the wiring, and
vendors `proposal.mjs`. `verify.mjs` drives the built page in a real browser.

### What the trade entry controls

| key | what it is |
|---|---|
| `jobTitle` | the line under WORK. A template, same syntax as a scope line |
| `scope` | the drafted scope. Strings, or `{ line, when }` where `when` names a field that must be truthy, or `{ each, line, when }` for one line per row |
| `fields` | customer-readable words for preset ids — `{ select: "pump" }` for the option text, plus `map` to rewrite it |
| `placeholders` | the greyed-out example text in the form |
| `disclaimerTail` | the sentence appended to the shared footer disclaimer |
| `priceField` | the result field holding the price, when it is not `price` |
| `depositPercent` | the default deposit, when 30% is wrong for the trade |
| `screenPriceSelector` | the element `verify.mjs` compares the sheet against, when the headline figure is not the price quoted |
| `palette` | overrides for the colours otherwise read off the page |

Template syntax, all of it in `scopeLines`:

- `{field}` — the value, or the whole line is dropped if it is missing
- `{field.nested}` — dotted paths
- `{count} gate{count+s}` — plural suffix, empty when the count is exactly 1
- `{yards~2}` — rounded to 2 decimals and thousands-grouped
- `{ "each": "rooms", "when": "hours", "line": "{name} — {squareFeet~0} sq ft" }`
  — one line per row of `result.rooms`, with `{field}` and `when` reading the
  **row** rather than the result root. Rows are never truncated: every row the
  contractor entered is one they intend to be paid for.

`screenPriceSelector` exists because the headline figure is the quoted price on
nearly every calculator here, but not all. `lawn-care` leads with a per-visit
number while the thing being sold — and the thing its own proposed-price field
asks for — is the monthly contract, so comparing the sheet against `#price`
would fail a correct proposal.

### Two things `trades.json` must get right

**Read the result object, not the input fields.** Each calculator names its
result differently. `fence` has no `run.material` and no `run.feet` — the label
is `run.name` and the length is `run.linearFeet`. `sump-pump`'s `result.pump` is
`'half-hp'`, the preset *id*, not `'1/2 HP submersible'`.

**Preset labels are written for the contractor.** They name the lowball number
the calculator exists to argue with: `metal-roof`'s starting preset reads
"40×30 ranch, 4/12, 5V overlay (the $950/square special)", and it shipped as the
job title on customers' quotes until `verify.mjs` caught it. Anything with
"cheap", "special" or a rate in it needs a `map`.

Both of these fail *silently* — `undefined` renders as the word "undefined", and
a bad label renders perfectly — which is why the browser check below exists
rather than another text-level test.

## What `verify.mjs` checks

It fills the two fields the proposal refuses to print without, clicks "Print
proposal", and asserts against the rendered document and its computed styles:

1. Nothing reads `undefined`, `NaN`, or `null`.
2. At least one scope line carries a figure. (Not "the scope is non-empty": the
   one line with no placeholders in it always survives, so an entry whose every
   figure-bearing template missed still looks populated.)
3. The price on the sheet is the price on the screen, compared as numbers.
4. No cost, wage, burden, overhead, margin, or break-even figure appears.
5. **Every option of every select**, one at a time — not just the defaults —
   checked for money outside the price table, contractor shorthand, unrounded
   floats and holes. Checking the defaults proves nothing about the contractor
   who picks the second entry in a dropdown.
6. In print: `main`, `header`, `footer`, the injected nav and the saved-rates
   panel are all gone, and the proposal is visible.
7. The status line clears 4.5:1 against what is actually behind it.

Run it against the built site, not the venture directory — `build.mjs` injects
a nav, an aside and a shop-rates panel that the venture's own print stylesheet
never sees.

## What it found on its first run

Every one of these was live on `main`, and every one was invisible to a green
test suite:

- **14 calculators rendered the status line at under 2:1.** The hand-ports took
  the colour from `.summary-status`, which is correct inside the dark result
  panel and unreadable in the light section the proposal actually sits in. That
  line is where "Add your business name before printing" appears, so a
  contractor whose print did nothing could not read why. `adopt.mjs --restyle`
  repoints all of them at each page's own muted tone.
- **`metal-roof` printed the contractor's preset label as the job title** —
  "40×30 ranch, 4/12, 5V overlay (the $950/square special)" — handing the
  homeowner an internal per-square rate and a nickname for their house.
- **`tuckpointing` printed "Point-only smear — no grind (the cheap special)"**
  as the first scope line.
- **A yardage rendered as `48.888888888888886 yd²`** on a customer's quote.

## Five things that went wrong in every hand-ported batch

**`adopt.mjs` now makes all five impossible**, and they are kept here because
the 27 hand-ported calculators still carry hand-written wiring, and because the
reasoning explains what the generator is doing. If you are adding a trade to
`trades.json` you do not need this section.

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

- **A result field that is not the one you want prints as `undefined`.** The
  same failure as `garage-door`'s `doorClass`, and it recurs because every
  calculator names its result differently. `fence` has no `run.material` and no
  `run.feet` — the label is `run.name` and the length is `run.linearFeet`, and
  the totals field is `totalLinearFeet`, not `totalFeet`. The drafted scope read
  `undefined ft of undefined` and the job title read `undefined ft`, and every
  suite was green. Read the result object at runtime before writing
  `suggestScope`, rather than guessing from the input field names:

  ```
  node -e "import('./ventures/<slug>/calc.mjs').then(m =>
    console.log(Object.keys(m.calculateBid(<a valid input>))))"
  ```

  Nothing legitimate on a quote reads `undefined`, `NaN`, or `null`, so grep the
  rendered sheet for them as the last step of a browser pass.

- **The input reader is not always called `readInput`.** `ev-charger`,
  `standby-generator` and `water-heater` call theirs `readInputs()`, plural.
  The proposal shipped calling `readInput()`, which is undefined at runtime, so
  the button set a status of `readInput is not defined` and printed nothing —
  and every text-level test stayed green, because the string `readInput` is
  present either way. `grep -c 'function readInput'` does not tell them apart;
  it matches `readInputs` as a substring. Grep for the open parenthesis:

  ```
  grep -oE 'function readInputs?\(' ventures/<slug>/index.html
  ```

  `page.test.mjs` now asserts that whatever reader the proposal calls is a
  function the page actually defines.

## A calculator that already prints something

Five calculators — `window-replacement`, `attic-insulation`, `ev-charger`,
`standby-generator` and `water-heater` — shipped an `@media print` block of
their own **before** the proposal existed, which prints the contractor's
internal bid sheet: cost, overhead, profit, walk-away price. That sheet is a
feature someone uses, so adopting the proposal must not silently replace it.
All five have now adopted, so no remaining calculator is in this class — but
read this section before adding a print stylesheet to one that is not.

Keep both, separated by a body class rather than by deleting the older rules.
`printProposal` sets `printing-proposal`, `afterprint` clears it, and the
existing print button clears it too — `afterprint` does not reliably fire when
the user cancels the dialogue, and a stale flag turns every later Ctrl+P into
the customer's copy. The safety property is unchanged: whenever the customer's
sheet is the one printing, `main` is hidden outright rather than by an
allow-list.

One trap inside the trap. The internal block needs to hide `#proposalDoc` so a
previewed proposal does not print stapled to the contractor's sheet — but a bare
`#proposalDoc` is an **id** selector and outranks `body.printing-proposal
.pr-shell`, so the customer's copy printed blank. Scope it as
`body:not(.printing-proposal) #proposalDoc` instead: mutually exclusive
selectors cannot race on specificity.

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
from landing in one calculator and not the other eighty-seven.

```
node platform/proposal/adopt.mjs --sync
```

## Adding it by hand

**Use `adopt.mjs` instead** — see "Adopting a calculator" above. This section
describes the hand-port, which is now only relevant for a calculator that fails
`adopt.mjs`'s preconditions and cannot be made to pass them, or for editing one
of the 27 pages that were ported before the generator existed.

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
