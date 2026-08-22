# EAA WCAG triage

**A working probe, not a venture.** It implements the one claim at the centre of
[`eaa-remediation-pipeline`](../../candidates/eaa-remediation-pipeline.md) — the
candidate ranked #1 in the pipeline — that had been asserted rather than built,
and it is the second executable artifact in `portfolio/pipeline/` after
[`npm-reachability-triage`](../npm-reachability-triage/).

It answers one question about a shop page: **of the WCAG 2.2 A/AA failures a
source-only pass can find, which ones actually block a task, and how much of the
standard does that pass leave for a human with a screen reader?**

---

## Why this claim and not the whole product

The candidate's own "Why now" paragraph states the wedge the whole business
rests on:

> automated tools catch roughly a quarter to a third of WCAG issues. The gap
> between what a scanner reports and what actually blocks a screen-reader user
> is precisely the work, and it is why the pure-software competitors do not
> close the loop.

That is two testable assertions bundled together, and neither had a line of code
behind it in this repo:

1. **A static pass sees only a slice of the standard.** If that is false — if a
   scanner can in fact confirm conformance — then the manual contractor step
   the candidate sells is redundant and its margin story collapses.
2. **The valuable output is the blocking-vs-degrading split, not the raw finding
   list.** The candidate says findings are *"ranked by whether the issue blocks
   a task or merely degrades it."* Every free scanner emits a flat list; the
   ranking is what it claims to add.

This probe is the smallest thing that exercises both. It is deliberately **not**
the product: it renders nothing, publishes nothing, and makes no compliance
claim — building a probe is licensed here, publishing a listing is the account
owner's call (see [`channel-inventory.md`](../../channel-inventory.md) and the
probe rules in [`../README.md`](../README.md)).

## What it does

Parses HTML with the standard library only (no browser, no dependencies), runs a
set of conservative rules, and splits every finding into **blocking** or
**degrading**. Like the sibling reachability probe, it fires only on positive
evidence of a barrier — a control whose name cannot be resolved statically is
left unflagged rather than reported, because a checker that cries wolf gets
turned off.

| Rule | WCAG | Impact | Fires when |
|---|---|---|---|
| Image alt | 1.1.1 | blocking | `<img>` has no `alt` attribute (`alt=""` is respected as decorative) |
| Page language | 3.1.1 | blocking | `<html>` has no `lang` |
| Control label | 1.3.1 | blocking | a form control has no label, `aria-label`, `title`, or wrapping label |
| Link purpose | 2.4.4 | blocking | `<a href>` exposes no text or accessible name |
| Button name | 4.1.2 | blocking | `<button>` has no accessible name |
| Interactive aria-hidden | 4.1.2 | blocking | a focusable control is `aria-hidden="true"` |
| Video captions | 1.2.2 | blocking | `<video>` has no `<track kind=captions>` |
| Autoplay with sound | 1.4.2 | blocking | `<video>`/`<audio autoplay>` without `muted` |
| Zoom blocked | 1.4.4 | blocking | viewport meta sets `user-scalable=no` or `maximum-scale` < 2 |
| Text contrast | 1.4.3 | blocking | text resolves below 3:1 against its background |
| Page title | 2.4.2 | degrading | no non-empty `<title>` |
| Heading order | 2.4.6 | degrading | a heading level is skipped (h1 → h3) |
| Data-table headers | 1.3.1 | degrading | a multi-row data table has no `<th>` |
| Text contrast | 1.4.3 | degrading | text resolves between 3:1 and the 4.5:1 its size requires |

## What it deliberately cannot do — and says so in every record

The point of assertion #1 is that this list is short *because the standard is
large and mostly not statically visible*. The evidence record the tool emits
carries an explicit coverage statement and a table of commonly-failed criteria
it **did not** check — keyboard operability (2.1.1), focus visibility (2.4.7),
target size (2.5.8), error identification (3.3.1), non-text contrast (1.4.11)
and more — each requiring rendering, interaction, or assistive technology. That table is
the coverage limit stated *in the product*, which the candidate's liability
section requires, rather than buried in terms. A clean run is never reported as
"compliant" — it is reported as "the static checks found no failures; the manual
criteria remain unverified."

This is the honest form of assertion #1: the tool measures its own blind spot
and hands it to the contractor, instead of implying a scanner is the whole job.

## Four criteria became rules: added 2026-08-22

[`a11y-external-coverage-reference/`](../../../research/a11y-external-coverage-reference/)
found eight A/AA criteria that this catalog listed in neither direction —
neither checked nor declared untested — and disclosed all eight under a new
`unimplemented` value without implementing any of them, on the principle that
disclosure is not detection. Four of the eight are now rules:

| Criterion | Level | What fires | Impact |
|---|---|---|---|
| **2.2.1** Timing Adjustable | A | `<meta http-equiv="refresh">` on a positive delay | blocking |
| **2.2.2** Pause, Stop, Hide | A | `<blink>`, `<marquee>` | blocking |
| **2.4.1** Bypass Blocks | A | a navigation block, prose to skip to, and no skip link / `<main>` / heading | blocking |
| **3.1.2** Language of Parts | AA | a `lang` on any non-root element holding a malformed or unknown tag | degrading |

**Why these four and not the other four.** Not difficulty — measurement. Each
of the eight fixtures was rendered in Chromium and run through axe-core 4.13.0,
and only five are failures a *default* `axe.run()` reports. Three of the
remaining criteria (1.2.1, 1.3.4, 2.5.3) are reachable only through axe rules
that ship disabled or experimental, so the claim that an independent engine
automates them was never true of a default run. Those three stay
`unimplemented`, and their catalog rows now give the measured reason instead.

The genuine remaining gap is **1.4.1 Use of Color** — axe reports it by
default, it fires once on this portfolio's own pages, and no rule here looks
for it yet. It is named as such in `COVERAGE` rather than grouped with the
three that are not gaps.

**3.1.1 was downgraded in the same pass, from `automated` to `partial`.** The
only rule behind it checked that `<html lang>` *existed*; nothing checked that
it held a language, while the row carried this catalog's strongest word. A page
declaring `lang="engl"` was reported clean. `rule_html_lang_valid` closes that,
and the row now says what it does not do (a `lang`/`xml:lang` disagreement is
still unchecked). Finding an overclaim while closing a gap is the reason the
parent candidate's `liability_containment` did **not** move up this pass.

### The one out-of-sample finding was a false positive, and it changed the rule

Run over the 118 built pages of
[`a11y-own-sites/`](../../../research/a11y-own-sites/), the four new rules
produced exactly one finding: 2.4.1 on `ventures/quick-pick-survey`'s `/app`
route. Checked by hand in a browser, it was **wrong**. The prerendered file has
a `<nav>`, no `<main>`, no heading and no in-page link; the delivered page has
a `<main>` and a heading, because the content region of the prerender is the
string `Loading…` and the rest is rendered by script. axe passes the delivered
page.

`rule_bypass_blocks` gained a third gate from this — there must be content to
bypass *to*, not just a navigation bar above an empty region — and the corpus
then reproduced its committed 780 findings field for field, no page differing.

So the honest out-of-sample result for all four rules is **zero findings across
118 pages**, and it means *this corpus cannot exercise them*, not *these pages
are clean*. Contrast survives a prerender because the colours are in the
stylesheet either way; structural criteria do not, because for a
client-rendered app the structure is the part that has not happened yet. A
rendered corpus is what would settle it.

Both thresholds in the 2.4.1 rule (ten links, 200 characters) are judgements,
and both are named constants at the top of the rule rather than numbers buried
in its body, so a reviewer can argue with them. Both under-report by
construction.

**Settled 2026-08-22.** A rendered corpus already existed —
[`a11y-generated-sites`](../../../research/a11y-generated-sites/), built for a
different question, renders `local-site-studio`'s delivered customer pages
through the real component tree rather than a build directory. Its positive
control gained one mutation per new rule; the 2.4.1 one strips the `<main>`
landmark, every heading, and the in-page link the delivered pages actually
carry, and the rule fires on all 14. All four new rules pass a genuine
out-of-sample positive control there; see that directory's Finding 4 for the
full table. The honest reading is unchanged — the delivered pages themselves
still carry zero findings for all four — but it is no longer an unexercised
zero.

## The build-artifact filter: added 2026-08-22

A build directory is not a list of the customer's pages. It also holds documents
the framework wrote itself, identical in every project that uses it and
un-editable from the project's source.
[`a11y-own-sites`](../../../research/a11y-own-sites/) measured what leaving them
in costs: out of sample **11.9% of this engine's findings were false positives,
and 7 of the 8 were one such document per application** — Next.js's internal
error shell — carrying *every* 3.1.1 finding in a 118-page corpus and never once
landing on a page a venture wrote. It prescribed a filter and said why it
belongs in the product rather than in a backlog: the candidate's wedge is a free
qualification audit handed to a stranger, and a record naming a framework's
internal error document as the customer's blocking defect states its coverage
inaccurately in the direction that flatters the seller.

[`provenance.py`](src/wcag_triage/provenance.py) is that filter. Three
constraints shape it, and each is pinned by a test:

- **It excludes a document, never a finding.** There is no path that drops one
  finding from a page the customer wrote. The claim the module can defend is
  *nobody can edit this file*; it has no way to argue that some particular
  finding on a real page does not matter, so it never tries.
- **The evidence is a marker inside the document, never its filename.** This is
  the part a cheaper implementation gets wrong, and the same corpus shows what
  that costs. One `next build` emits its own error document *and* emits
  `404.html` / `_not-found.html` through the project's own root layout,
  carrying the project's `lang` and its font classes. Those last are pages real
  users reach. A filter keyed on "error page names" would have deleted them
  from the customer's audit and reported nothing unusual. Measured on this
  portfolio's 118 built pages: **7 documents correctly removed — exactly the 7
  false positives, all 3.1.1 — and 7 project pages correctly kept.**
- **One framework needs two markers, which only measuring showed.** Next 16
  emits `<html id="__next_error__">`; Next 14 and 15 emit a Pages Router
  document with a bare `<html>` and the framework's built-in error component in
  the body. Written from the first marker alone — the one the research had
  recorded — this filter passed its tests and collected 2 of the 7 findings it
  exists for. The second marker cannot be the obvious one either: as a string,
  `next-error-h1` is in 106 of 138 built documents, because Next inlines a
  stylesheet naming that class into every ordinary page. As a parsed element it
  is in 16 — and 11 of those are the projects' own 404s, which render the same
  built-in component *inside the project's layout*. What separates them is that
  the framework's document has no attributes at all on `<html>`, so nothing the
  project wrote reached it. Both parts are required, and both are tested.
- **What it removes is printed in the record.** The evidence record grows a
  *Documents excluded as build-tool output* section listing each document, the
  marker that identified it, why it is not actionable, and every finding set
  aside — plus a note in the header block so the page count cannot silently
  shrink. An exclusion is a limit on coverage, and this probe's rule is that
  coverage limits go in the product. The section closes by inviting the reader
  to say so if they *can* edit one of these files, because that would mean the
  filter is wrong and the finding is real.

Anything with no marker is kept, including document shapes the filter has never
seen. The two errors are not symmetric: a framework artifact left in is visible
to the reader and arguable, and a real page filtered out is a defect the record
silently stops mentioning.

## Colour contrast: added 2026-08-21, and why it took this long

1.4.3 sat in the `manual` column above from the day this probe was written, with
the note *"needs computed colour, which needs CSS and rendering."* The second
half of that was never tested. A delivered page ships the stylesheet that names
its colours, and the arithmetic from a named colour to a contrast ratio is
exact. What the claim was actually describing is every accessibility corpus this
portfolio had measured: all of them were **HTML only**, so no engine had ever
been handed the CSS, and a property of the corpus read for five passes as a
property of the criterion.
[`portfolio/research/a11y-contrast-decidability/`](../../../research/a11y-contrast-decidability/)
has the measurement — **98.76% of 10,657 text elements across 85 built pages
decide from the artifact alone.**

Three things make this safe to ship in a tool whose findings go to a stranger:

- **Three-valued, never two.** Every element is `pass`, `fail`, or
  `undecidable` *with a named reason*, and only `fail` becomes a finding. A
  colour a media query redefines, a background image, an `opacity` in the chain,
  a unit that needs the viewport — each refuses by name. The evidence record
  prints the tally and the reason table, so a page the tool could not decide
  reads as "0 of 412 decidable", never as "no contrast problems".
- **Both colour schemes.** `prefers-color-scheme` has exactly two states and the
  stylesheet spells out both, so the page owes 1.4.3 in each and the verdict is
  the worse of them. This is not a refinement: on this portfolio's own pages,
  scoring the light scheme alone found 581 failures and scoring both found 965.
  The 384-element difference is the `text-gray-500` with no `dark:` counterpart
  inside a `dark:bg-gray-800` container — invisible to any single-pass checker.
- **Gradients are bounded, not skipped.** CSS interpolates each channel linearly
  and luminance is monotonic in each channel, so the ratio attainable over a
  gradient is bracketed by its stops, and a bracket wholly on one side of the
  threshold decides the criterion. Only a straddling bracket is undecidable.

The colour arithmetic is checked against published WCAG ratios for known pairs
(`#767676` on white is 4.54:1, the AA boundary), and the CIELAB conversion
against ground truth rather than itself: Tailwind v4 emits every palette entry
twice, as a hex fallback and a `lab()` override, and
[`fixtures/tailwind-v4-lab-pairs.json`](fixtures/tailwind-v4-lab-pairs.json)
holds all 115 pairs from a real build for the test to reconcile.

**The sibling engine does not do this.** `a11y-evidence-record/audit.py` still
records 1.4.3 as manual, so the two engines are asymmetric again — declared
here on purpose, because
[`a11y-engine-agreement`](../../../research/a11y-engine-agreement/) established
that the danger is asymmetry nobody wrote down.

## Validated against a hand-labeled fixture set

Three fixture shop pages ([`fixtures/`](fixtures/)) — one riddled with barriers,
one clean, one mixed with negative controls (a decorative `alt=""` image, a
correctly-labelled input) — were labeled by hand in
[`fixtures/labels.json`](fixtures/labels.json), then compared against the
engine's output.

| Page | Expected | Reported | Blocking / degrading |
|---|---|---|---|
| `shop-inaccessible.html` | 10 | 10 | 8 / 2 |
| `shop-accessible.html` | 0 | 0 | — |
| `shop-mixed.html` | 4 | 4 | 3 / 1 |

Aggregate precision **1.0**, recall **1.0** on the fixtures — raw output in
[`validation-2026-08-20.json`](validation-2026-08-20.json), regenerated by
`python3 run_fixture_validation.py 2026-08-20`.

**What that number is and is not.** The labels and the engine both live in this
repo, so a perfect score is a regression guard on the rules, not evidence about
production shops. The candidate's first experiment — *"measure how many blocking
issues the generated fixes actually close under AT verification"* — is the real
measurement, and it needs three live shop themes and a contractor, neither of
which an agent session has. This probe closes the smaller, prior question:
whether the blocking/degrading triage the candidate sells can be produced
mechanically at all. It can, and the coverage split it produces (11 criteria
reasoned about, 9 named criteria explicitly deferred to a human) is itself the
first concrete instance of the "quarter to a third" gap the candidate asserts.
That split moved on 2026-08-21, when 1.4.3 crossed from deferred to partial —
the only criterion that has ever crossed, and it crossed because the corpus
changed, not because the rules got cleverer.

## Run it

```bash
# Print an evidence record for one or more pages:
PYTHONPATH=src python3 -m wcag_triage.cli page.html

# Write record.json + record.md for a whole set:
PYTHONPATH=src python3 -m wcag_triage.cli shop/*.html --output-dir ./evidence

# Optional CI gate (off by default so adding it never breaks a build):
PYTHONPATH=src python3 -m wcag_triage.cli page.html --fail-on blocking
```

There is also an [`action.yml`](action.yml) so the record can be produced in CI
and posted to the job summary, mirroring the sibling probe.

## Tests

```bash
python3 -m pytest
```

Run in CI by [`eaa-wcag-triage-ci.yml`](../../../../.github/workflows/eaa-wcag-triage-ci.yml),
which also re-runs `run_fixture_validation.py` and fails if the committed
record no longer matches what the engine emits.

189 tests: parser behaviour, each rule and its negative control, the
blocking-before-degrading ordering, dedup of one element matched by two rules,
the evidence record's JSON/markdown shape and its compliance disclaimer, the
fixture validation, and — added 2026-08-21 — the two rules this engine was
missing relative to its sibling (1.4.2, 1.4.4), the focusability predicate on
the `aria-hidden` rule, and the invariant that every statically reachable
criterion appears in `COVERAGE`. See
[`portfolio/research/a11y-engine-agreement/`](../../../research/a11y-engine-agreement/)
for why an engine that passes its own suite can still be quietly narrower than
its own coverage statement. Added 2026-08-21: `colors.py` (colour syntax
against published WCAG ratios, the `lab()` conversion against a real build's own
hex fallbacks, gradient bounds), `css.py` (every selector shape it refuses, the
colour-scheme split), and `contrast.py` (one test per named undecidable reason,
plus the specificity case that shipped a wrong answer on a real page).

## Scope and honesty, in one place

- **No compliance claim.** Evidence and a coverage statement, never "you are
  compliant." Enforced in code (`evidence.COVERAGE_STATEMENT`) and asserted by a
  test.
- **No payment, no personal data, no account.** It reads local HTML files.
- **Building ≠ publishing.** Committed here freely; any public listing is the
  account owner's decision.
- **Fixture validation ≠ field validation.** The perfect fixture score is a
  regression guard. The candidate does not graduate on it.
- **A contrast pass is only as wide as the CSS it was handed.** With no
  stylesheet the tool decides nothing, and says so per element. It never treats
  "no colour declared" as "colour is fine".
- **An exclusion is set aside, not deleted.** The build-artifact filter drops
  no finding from the record — it moves whole documents into a section that
  names each one, its marker, and every finding on it, and invites the reader
  to reject the exclusion. A shorter list is the seller's interest as much as a
  longer one is; the only defence is that the reader can see what was removed.
