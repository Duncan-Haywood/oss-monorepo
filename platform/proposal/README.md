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

**All bid calculators**, and the list is no longer worth keeping by
hand: `node platform/proposal/adopt.mjs --list` prints what is adopted, what is
ready, and what is blocked. As of 2026-09-07 that is 112 adopted, 0 blocked.

**`biohazard-cleanup` (`biohazard-cleanup-bid-calculator`) is the current
holdout**, graduated 2026-09-17 without the proposal. It genuinely wants one —
a biohazard/trauma-scene job is exactly the kind of bid a customer receives a
printed proposal for — so this is not a "no work to describe" case like the
`mobile-detailing` holdback above. `adopt.mjs` needs a `trades.json` entry
templating the scope from `computeJobBid`'s result (crew hours, PPE sets,
disposal containers, supplies, equipment, travel) with a deposit split and a
disclaimer naming what the tool is not (a hauler contract, an OSHA
bloodborne-pathogen determination, or an insurance-claim adjudication); that
entry was not authored in the session that shipped the calculator, so
adoption is tracked as a follow-up rather than rushed against a template it
was not proven against.

**And, separately, `storage-auction-max`** (`storage-auction-max-bid-calculator`,
graduated 2026-09-17) does not adopt at all, deliberately — unlike
`biohazard-cleanup` above, this is not a holdout waiting on a `trades.json`
entry. For the same reason `owner-operator-cpm-calculator` and
`shop-rate-calculator` are deliberately excluded from `adopt.mjs`'s filter
below: it prices a figure the bidder keeps to themselves — the hammer bid to
raise a hand at — and there is no customer to hand a proposal to. Its slug
happens to end in `-bid-calculator` because the bid itself is the product
(a lien-auction bid on a stranger's storage unit, not a contractor's job bid),
which is what puts it in `discoverability.test.mjs`'s population even though it
is not a trade calculator at all. Mechanical readiness is not a reason to
adopt, the same rule the two exclusions above already state.

**Likewise `liquidation-pallet`** (`liquidation-pallet-bid-calculator`, graduated
2026-09-30) does not adopt, deliberately: it is a reseller's max hammer bid on a
liquidation pallet or truckload, a figure the buyer keeps to themselves, with no
customer to hand a proposal to. Its slug ends in `-bid-calculator` because the
bid is the product, which is what puts it in `discoverability.test.mjs`'s
population even though it is not a trade calculator.

**`water-well-drilling`** (`water-well-drilling-bid-calculator`, graduated
2026-10-09) does not adopt yet. Its customer is a homeowner, so it is a
candidate, but it prices the job through `analyze()` rather than the
`readInput()` / `calculate*(readInput())` pair `inspect()` anchors on, and a
proposal for a well also needs terms the tool does not model (a dry-hole
clause, a yield disclaimer). Adopting it is a follow-up, not part of the
launch.

**`hoarding-cleanout`** (`hoarding-cleanout-bid-calculator`) does not adopt yet.
Its customer is often a family member or a social worker rather than the
occupant, so who signs and who is billed is a question a generic proposal
template answers wrongly, and the job needs terms the tool does not model
(hazard and sanitising scope, valuables found, a volume-overrun change-order
rate). It is a follow-up; the calculator already prints the overrun rate.

**`hydroseeding-job` and `lawn-aeration-overseeding`** (their `-bid-calculator`
slugs) landed after the last adoption batch and do not adopt yet. Both are
homeowner-facing lawn jobs, so they are candidates: each needs a `trades.json`
entry and a check that its pricing fits the `readInput()` anchor `inspect()`
looks for. Adopting them is a follow-up, listed here so the README stays true.

The last holdout was **`home-staging`** (`home-staging-bid-calculator`,
graduated in #3580, unblocked in the same session that added this line). It
priced the job inline from individual `el(...)` reads rather than through the
`readInput()` / `calculate*(readInput())` pair `inspect()` looks for, so the
generator had nothing to anchor on. The page was given those two conventions
(and a `count()` helper), a `trades.json` entry was added, and it adopted
cleanly. One thing the fix also turned up worth recording here rather than in
a venture-specific note: `.result{position:sticky}` sits in the same
`main.layout` grid as everything `adopt.mjs` inserts before `</main>`, and a
site-wide `section:not(.result){grid-column:1/-1}` rule left `.result` alone
in its own row with no sibling tall enough to make the sticky positioning do
anything — except that a positioned element with `z-index:auto` still paints
above later non-positioned siblings in the same stacking context, so the
inert sticky box silently intercepted clicks on the printed proposal's button
once it scrolled into the same screen position. Any other venture built on
this same `.layout`/`.result` template would hit the identical defect the
moment something is added after `.result` inside `<main>` — the fix was
dropping the now-pointless `position:sticky` from `.result`, not touching the
generated proposal markup.

**And two ventures that are not bid calculators at all**, `translator-project-quote`
(2026-09-03) and `notary-trip-quote` (2026-09-05). The second is written up under
"A page that does not price the job inline" below.

`translator-project-quote`. A freelance translator's quote is the same artifact
— what the project covers, the price, the deposit split, a date it is held
until, a line to sign — and the module was already generic enough to render it.
What was *not* generic was four assumptions nobody had had to question, because
every previous adopter happened to satisfy all four:

| Assumption | Why it broke | Now |
|---|---|---|
| Figures are in dollars | `money()` hard-coded `$`. A quote paid in euros reading `$580.00` misstates the price on the one sheet meant to settle it. | `money(value, currency)`, defaulting to `'$'`; a trade names its currency field with `currencyFrom`. |
| A `when` field is a number | Scope lines read with `input` come back as strings, and `"0"` is truthy — so a rush fee left at zero still printed "Rush or weekend delivery" on the client's quote. | `{ "number": "id" }` reads it as a number; `input` stays for text. |
| The buyer is a customer at a job address | "Customer name", "Job address", "Licence number" are trade words. | Optional `labels` in `trades.json`, defaulting to today's wording. |
| The page is written in house style | The anchors required `from './usage.mjs'` in single quotes and a `  </script>` indented two spaces — both formatting, neither load-bearing — and a page that differed was refused with a message saying the import or the tag was missing when it was in plain sight. | Either quote style; any indentation. |

The first two were **defects on a customer-facing document**, not merely
limitations: one misstates the price, the other promises work the price does
not cover. They were invisible for as long as the only adopters were US
contractors quoting in dollars with every optional charge filled in.

Adopting a non-trade needs no flag. `adopt.mjs <slug>` only requires an entry
in `trades.json` and the page conventions `inspect()` lists; the
`*-bid-calculator` filter applies to `--list` alone.

27 of those were hand-ported, one batch of six at a time. The remaining 74 are
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

**`mobile-detailing` is adopted, and it closes the set at 102.** It was held
back on the reading that its inputs are hours and costs "with nothing
describing the work", so its scope could only be "Perform the work described
above" — the one case where no proposal beats a generic one.

That reading did not survive looking at the trade. For a mobile detail the work
*is* time and travel: the drafted scope names the hands-on hours, the setup and
breakdown, and the round-trip miles, which is what the customer is buying and
what a second detailer's bid will be compared on. It reads

```
Mobile detailing carried out at your location on the date we agree
4 hours of hands-on detailing on the vehicle
Setup and breakdown of our equipment at your location
Round trip of 30 miles to reach you
Cleaning chemicals, pads, brushes, and towels supplied by us
```

which is a scope, not a placeholder. `adopt.mjs --list` had also stopped
agreeing with this paragraph: it reported the venture `blocked` on two missing
page conventions (`el()` and `count()`), which is a mechanical blocker and not
a decision about the trade. Both are now in place.

**`security-camera` is adopted.** It was the last holdout, and the blockers were
this tool rather than the trade: its page spelled five house conventions
differently — the reader was `const readInputs = () => …` rather than
`function readInputs(`, it priced from a variable rather than from
`calculateBid(readInputs())`, its `el` helper took a parenthesised parameter, it
counted usage through `recordUsage` rather than `count()`, and it had no
`</main>` for the form to go before.

Of the two fixes the note here offered — broaden the detectors, or bring the page
to the house shape — the page was the safer one, and it is what was done: it
touches one venture instead of tooling 100 live proposals depend on.

One detector did have to change, and it was wrong rather than merely narrow.
`resultKeysOf` took the **first** `export function calculate*` in a module, but
these modules declare their stages before the entry that calls them — this one
exports `calculateStorage`, `calculatePoe` and `calculateCabling` above
`calculateBid`. It was reading terabytes and retention days and then reporting
that `bidPrice` did not exist. It now prefers the conventional entry names and
keeps first-match as the fallback; the detected keys of all 182 other ventures
are byte-identical either way, which is how that was checked rather than assumed.

The trade also needed two echoes in `calc.mjs`: `cameraCount` at the top level
and `retentionDaysQuoted` / `driveSizeTb` / `driveCount` inside `storage`. Scope
templates read the **result**, not the form, and a result that says "41.67 days"
without saying "30 quoted, 2 × 8 TB fitted" cannot describe the system to the
customer agreeing to it. Echoing the job's defining inputs is what every adopted
calculator already does.

`verify.mjs` is the check that matters, because bad scope copy fails silently.
It caught nothing here, but driving the page did: the first scope line rendered
"Supply and install 8 4 MP (2K) cameras", two numbers colliding with no
separator. It is `{cameraCount} × {resolutionLabel}` now, matching the drives
line. A verifier that asserts a proposal is *sound* will not tell you it reads
badly.

## Say so in the structured data

A calculator that prints a proposal has to **name it in its JSON-LD
`featureList`**. That string is the machine-readable list of what the tool does
— what a search engine and an AI assistant read when someone asks for something
that prints a contractor's quote. All 100 adopters shipped without it, so the
portfolio's largest feature was invisible to the only channel that brings these
tools traffic.

The clause is one phrase, appended to the existing list:

```
, printable customer proposal with scope, deposit split, price-held date and signature line
```

`discoverability.test.mjs` holds three things down. The important one is the
second direction: **a calculator must never advertise a proposal it cannot
print.** It has no live case left now that `mobile-detailing` has adopted, and
that is the point: the guard has to hold for the next calculator that lands
without one, so a visitor searching for "contractor proposal" never arrives at
a tool that cannot print it.
The test also fails on a repeated clause, because appending is how this gets
maintained and appending twice is how a feature list becomes keyword stuffing
over three batches.

Note both spellings occur in this repo — `"featureList":"…"` and
`"featureList": "…"` — and `ev-charger` nests its node under `@graph` rather
than at the top level. Match on `"featureList":\s*"` and walk the parsed tree;
a top-level lookup silently misses that page.

Meta descriptions are deliberately left alone: they are already at their useful
length and tuned per trade, and appending pushes the important half out of the
search snippet.

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
| `rowFields` | the same, one level down, for a trade priced from rows: `{ "components": { "name": { "map": {…} } } }`. An unmapped value falls through to the row's own |
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

**A row's labels are written for the contractor too**, and `fields` only reaches
the top of the result, so until 2026-08-27 they went to the customer exactly as
the estimator's form spells them. `hood-cleaning` drafted "Canopy hood (listed
sq ft) — 40": the parenthetical is an instruction to the person typing the
number, and the 40 has no unit at all. `rowFields` maps a field inside a named
collection, so the same bid now reads "40 sq ft of canopy hood". Unlike the
top-level `map`, an unmapped value falls through to the row's own rather than to
`undefined` — `scopeLines` drops a line with a missing placeholder, so a preset
nobody mapped would otherwise delete a component from the scope the customer is
agreeing to. Falling through prints the old wording, which is a defect to fix
and not a component silently gone.

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

`terms.mjs` is vendored the same way, into the 12 calculators that carry the
proposal terms in a bid link without using the shared bid spec — but under the
name `proposal-terms.mjs`, because `einvoice-preflight` already ships a
`terms.mjs` of its own about invoice payment terms, and two unrelated files with
one name is how a sync test starts comparing the wrong pair. `sync.test.mjs`
knows the mapping.

## The terms in a bid link

The panel asks for five things no calculator computes with: the deposit, how
long the price is held, the not-included list, the payment terms, and the notes.
Every share encoder on this site was therefore built without them, and until
2026-08-29 all 48 adopting tools dropped all five.

That is not cosmetic. Driven in Chromium against the pre-fix build of
`artificial-turf-bid-calculator`: a bid priced at a 50% deposit held for 15 days
reopened from its own link at the venture's defaults, and the proposal the
recipient printed asked the customer for **$1,640.44** on acceptance where the
sender's sheet said **$2,734.07**. The headline figure matched to the cent, so
nothing on either page suggested a disagreement.

Two mechanisms carry them now, because the tools have two share mechanisms:

- **36 on the shared bid spec** — `share.mjs` gained a `text` kind, and
  `withProposalTerms` folds the five ids in. They ride in the link *and* in the
  setter's own saved bid, so the terms are typed once.
- **12 that predate it** — `proposal-terms.mjs` appends them beside whatever the
  venture's own encoder wrote, under `pfterms`. See `platform/pages/README.md`
  for the format and the one venture whose terms take the fragment while its
  numbers stay in the query string.

Either way a block past `MAX_TERM_TEXT` (512, matching
`platform/pages/link.mjs`) is dropped whole rather than truncated, and the
*sender* is told which one stayed behind. Half a payment-terms clause presented
to the recipient as the sender's terms is worse than an empty field.

`term-ids.test.mjs` is what keeps `TERM_IDS` here, the 36 share modules and the
12 vendored ones one list: add a term to the panel without adding it to the
others and it fails.

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

## A page that does not price the job inline

`notary-trip-quote` adopted on 2026-09-05 and broke three more assumptions, all
of them about the *shape of the page* rather than about the document. None was
a judgement call; all three were spelling.

| Assumption | Why it broke | Now |
|---|---|---|
| The page prices the job inline, so `calculate*(readInput())` names the calculator | A calculator that *throws* on a bad figure cannot be called from a render loop with nothing to catch it. This page renders through `quoteResult()`, a non-throwing wrapper, so no call of the inferred shape exists anywhere on it — and the throwing `calculateQuote` is nevertheless the right function for the proposal, where the throw is exactly what retires a sheet the figures no longer support. | A trade may name it: `"calcFn": "calculateQuote"`. `inspect()` then checks the page really defines or imports that name, because a name resolving to nothing generates a proposal that passes every text-level test and throws `ReferenceError` the first time someone presses print. |
| The usage import is spelled `import { x } from './usage.mjs';\n` | This page writes `import{recordUsage}from './usage.mjs';const ids=[…]` — no spaces around the braces, next statement on the same line. Adoption was refused with "no usage.mjs import" on a page whose import is right there, the same misreading the quote-style fix above was written for. | The anchor tolerates either spacing and an absent trailing newline. The generated region opens and closes with a newline of its own, so the import lands on its own line either way, and `stripGenerated` takes that newline back out — which is what keeps a re-run idempotent. |
| A venture that should adopt is discoverable by its slug | `--list` reports on `*-bid-calculator` plus whatever `trades.json` already names, so a venture is invisible until someone has already decided to adopt it. Measured 2026-09-05: 60 ventures with an `index.html` fall outside that filter, and two of them (`owner-operator-cpm-calculator`, `shop-rate-calculator`) satisfy every precondition today. | Unchanged, deliberately. Both of those price a figure the business keeps — a cost per mile, a shop rate — and neither has a customer to hand a proposal to. Mechanical readiness is not a reason to adopt, so widening the filter would report 60 tools as "ready" when the question it answers is a judgement one. What the count is good for is finding the next `notary-trip-quote`, by hand. |

The first of those is the one to remember when adopting a venture whose
calculator validates: the render loop and the printed sheet want *opposite*
behaviour from a bad figure, and both are right.

## `sauna-cold-plunge-install` does not ship it yet

`sauna-cold-plunge-install` prices an install from a bill of materials with an electrician pass-through, a distance table and an overrun check. Its output is a cost-and-break-even readout, not a scope with a deposit split, so the printed proposal has nothing to carry yet. Adopt it per "Adopting a calculator" above if that changes.
