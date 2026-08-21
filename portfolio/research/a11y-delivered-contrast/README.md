# The one corpus that carries the liability had never been checked for contrast

Built and measured 2026-08-21. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-delivered-contrast
python3 -m unittest discover                                  # 11 tests
python3 measure.py --recompute-from results-2026-08-21.json   # offline
# to regenerate, including the axe-core comparison:
cd ../../../ventures/local-site-studio && npm ci && npm run build && cd -
npm install axe-core@4.13.0 --no-save                         # not committed
python3 measure.py --out results.json
```

## Why this was built

[`a11y-generated-sites/`](../a11y-generated-sites/) is the only pass in this
repository that audits the thing `local-site-studio` actually *sells* — the
`/preview/[slug]` pages rendered per customer, which appear in no build and
which every prior corpus was therefore structurally blind to. It reported **0
findings from both engines** across 14 unique delivered pages and closed:

> No score moved and no verdict changed [...] the product is clean under
> everything both engines can statically see.

It also made the right argument about its own zero — *"a zero has two
explanations and they are opposite: the pages are clean, or the scan is blind
to them"* — and answered it with 14 mutations, each an edit that should make a
criterion fire.

Every one of those mutations edits **markup**. Colour contrast needs **CSS**.
So the control could not reach 1.4.3, and there is no 1.4.3 mutation in the
catalog. Meanwhile the adapters called both engines with no stylesheet, on a
corpus that links none.

That combination is what this directory is about, and it is the same shape
[`a11y-axe-recall/`](../a11y-axe-recall/) found one directory over on the same
day, in `a11y-own-sites/`. It was not looked for here.

## Finding 0 — the engines announced the blindness, in a field nothing read

Both engines return a **contrast tally** alongside their findings. Run over
this corpus with no stylesheet, it reads:

| | elements | pass | fail | undecidable | decidable |
|---|---:|---:|---:|---:|---:|
| no stylesheet | 1018 | 0 | 0 | **1018** | **0.00%** |
| with the delivered stylesheet | 1018 | 1002 | 0 | 16 | 98.43% |

The engine was not silently wrong. It said, in a structured field, that it had
decided **nothing** — and `audit_generated_sites.py` read only the findings
list, where "checked and passed" and "never looked" are both the empty list.
A criterion that cannot fire produces the same evidence as a criterion that
fires nowhere.

This is worth separating from the usual version of this bug. In
`a11y-own-sites/` the missing stylesheet was a silent gap. Here the engine
*reported* it, at 100%, and the number still reached a README as "clean under
everything both engines can statically see."

(1018 counts all 16 corpus files; `a11y-generated-sites/` de-duplicates two
byte-identical pairs first and so reports 894 over 14 unique pages. Same
pages, different denominator.)

## Finding 1 — checked properly, the delivered product does pass

**0 contrast failures across 1018 text elements**, with 16 elements declined
under a named reason rather than guessed at. The conclusion
`a11y-generated-sites/` published is correct. Its basis was not, and the two
are worth distinguishing: the product passing and the scan being incapable of
saying otherwise had produced the same output.

The positive controls are what make that zero mean something, and unlike the
markup mutations they edit the stylesheet:

| control | elements carrying the class | failures |
|---|---:|---:|
| `.text-zinc-500` recoloured to `#fdfdfd` | 80 | **80** |
| `.text-amber-800` recoloured to `#fdfdfd` | 4 | **4** |

The test is not "did something fail" but "did *exactly* the elements carrying
that class fail" — an off-by-any margin would mean the engine is reaching a
different element set than the corpus contains.

## Finding 2 — axe-core also reports zero, and that is much weaker evidence than it looks

axe-core 4.13.0, over the same 16 pages, given the same stylesheet, 39 rules
running: **0 violations, on any rule.**

Read no further and that is independent corroboration. The next line is why it
is not:

| axe on `color-contrast` | n |
|---|---:|
| decided (passed) | 294 |
| violations | 0 |
| **declined (`incomplete`)** | **830** |
| declined share | **73.8%** |

axe declined roughly three quarters of the contrast checks it attempted — 772
of them "background colour could not be determined due to a background
gradient." A detector that abstains on 74% of the corpus and a detector that
checks it and finds nothing both report zero violations, and only the
`incomplete` bucket tells them apart. A run that had asked axe for
`resultTypes: ["violations"]` — the obvious way to write it, and what
[`a11y-axe-recall/`](../a11y-axe-recall/) does — would have recorded a clean
independent corroboration that was mostly abstention.

axe's own positive control fires (32 violations once `.text-zinc-500` is
recoloured), so the zero is real as far as it goes. It just does not go far.

## Finding 3 — the disagreement was a real defect in the shared CSS reader, now fixed

The two results above disagree in an interesting place: axe declined 830
gradient-backed elements, and the in-house engines decided **all 1018, with
zero undecidable**. That looked like the documented capability difference —
[`a11y-contrast-decidability/`](../a11y-contrast-decidability/) argues,
correctly, that a gradient is decidable by bracketing its stops because
luminance is monotonic in each channel, and that this is exactly where static
checkers give up.

It was not that. The engines were not bracketing the gradient; **they could not
see it**, and were scoring those elements against a background the page does
not have — while reporting them as decided.

The delivered pages set their background with a Tailwind arbitrary value:

```
class="min-h-screen bg-[radial-gradient(ellipse_at_top,_#f8fafc_0%,_#ffffff_60%,_#e2e8f0_100%)]"
```

whose CSS rule escapes the commas of its own value into the class name. The
reader's selector splitter was `prelude.split(",")`, which shredded that
selector into four fragments, none of which parsed as a single-class selector
— so the whole declaration was **dropped**. A dropped rule is indistinguishable
from a property the page never set, so the element inherited a light ancestor
background and was scored, confidently, against that.

Isolated to one line, on the same element and the same property:

| rule added to the sheet | failures |
|---|---:|
| `.min-h-screen{background-color:#000000}` | 12 |
| the real escaped `.bg-\[radial-gradient(...)\]` selector, same colour | **0** |

The values that carry commas are `rgba()` and every gradient, so the loss was
not spread evenly across CSS — it landed squarely on **backgrounds**, which is
the half of a contrast ratio the element does not declare for itself.

**Fixed** in `wcag_triage/css.py` by splitting on separating commas only,
reusing the escape-, depth- and quote-aware scan (`_find_top_level`) that
already sat immediately below the naive splitter. Both engines share this
reader, so one fix covers both.

What changed on this corpus: decidability **100% → 98.43%**, as 16 elements
moved from confidently passed to `gradient-straddles-threshold`. The engine got
*less* confident and more correct, and the product's 0 failures survived.

### Regression checks

- `eaa-wcag-triage`: **129 tests pass** (126 before, plus 3 added here). Its
  fixture validation still reports **precision 1.0, recall 1.0** — unchanged.
- `a11y-evidence-record` (the sibling engine): **89 tests pass**.
- The new selector test **fails on the pre-fix reader** and passes after, so it
  pins the bug rather than the behaviour.
- [`a11y-contrast-decidability/`](../a11y-contrast-decidability/), re-run
  against fresh builds of the two ventures this session built, is
  **identical to its committed pre-fix numbers**: `local-site-studio` 6149
  elements / 100.00% decidable / 21 failures, `print-atelier` 2893 / 97.27% /
  0 failures. The fix moves no committed portfolio measurement. (The other two
  ventures in that harness were not rebuilt here, so their rows are absent from
  the comparison rather than confirmed.)

## What this changes for the pipeline

**No score moved**, and that is deliberate — the same call
[`a11y-axe-recall/`](../a11y-axe-recall/) made on evidence pointing the same
way. What is recorded:

1. **The delivered product's contrast claim is now measured rather than
   inherited.** For [`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md)
   and [`shopify-a11y-evidence`](../../pipeline/candidates/shopify-a11y-evidence.md),
   which sell the same record through different channels, the pages that ship
   to every customer pass 1.4.3 — and that sentence could not previously be
   said at all, in either direction.
2. **A positive control per engine is not a positive control per criterion.**
   `a11y-generated-sites/` prescribed *"a qualification audit needs a positive
   control per engagement"* and built 14 of them, and the gap survived all 14
   because every one edits markup while the criterion that dominates real
   findings needs CSS. A control catalog derived from the engine's own coverage
   list inherits the engine's blind spots — which is the same self-reference
   the mutation control was invented to escape.
3. **"Decidable" is a claim that needs its own audit.** The engines reported
   100% decidability on a corpus whose backgrounds they were not reading. The
   figure was not a lie about the arithmetic; it was arithmetic on a cascade
   with a rule silently missing. A coverage statement that reports how much it
   decided, and not what it decided it *from*, cannot catch this — and that
   statement is the artifact both candidates' liability position rests on.

## What was not done

- **No score revision.** One corpus, one venture, and the pass both found a
  defect in the engines and fixed it — evidence in both directions on the same
  day. `score_sensitivity.py`'s rule holds: a score moves when a fixed artifact
  is re-measured by the harness that faulted it, not when a pass feels
  differently about it.
- **The other three ventures in `a11y-contrast-decidability/` were not
  rebuilt**, so the claim that this fix moves no committed number is verified
  for `local-site-studio` and `print-atelier` and untested for
  `ai-first-markets` and `quick-pick-survey`. Both use colour-bearing
  arbitrary-value classes only in library source, not rendered markup (a
  source survey found `text-[#8a8a8a]` and `bg-[#123456]` inside
  `quick-pick-survey`'s own contrast utilities), so no change is expected —
  expected is not measured.
- **Pre-hydration markup only**, and **no interaction, render, or assistive
  technology** — the same limits `a11y-generated-sites/` states. Contrast is
  now decided from the artifact; focus visibility, keyboard operability and
  target size are still the contractor step.
- **The map frame's contents are still unaudited.** axe reports `frame-tested`
  incomplete on all 16 pages: the third-party embed is a frame it declined to
  enter, and what Google serves inside it is not this portfolio's to check.
