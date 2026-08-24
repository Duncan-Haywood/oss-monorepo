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
| Control label | 1.3.1 | blocking | a form control has no label, `aria-label`, `title`, or wrapping label; on theme source, a `<label for>` that can never match any id |
| Link purpose | 2.4.4 | blocking | `<a href>` exposes no text or accessible name |
| Button name | 4.1.2 | blocking | `<button>` has no accessible name |
| Interactive aria-hidden | 4.1.2 | blocking | a focusable control is `aria-hidden="true"` |
| Video captions | 1.2.2 | blocking | `<video>` has no `<track kind=captions>` |
| Autoplay with sound | 1.4.2 | blocking | `<video>`/`<audio autoplay>` without `muted` |
| Zoom blocked | 1.4.4 | blocking | viewport meta sets `user-scalable=no` or `maximum-scale` < 2 |
| Text contrast | 1.4.3 | blocking | text resolves below 3:1 against its background |
| Use of colour | 1.4.1 | blocking | a link in body text has `text-decoration: none` and a decidably different colour from its surroundings |
| Page title | 2.4.2 | degrading | no non-empty `<title>` |
| Heading order | 2.4.6 | degrading | a heading level is skipped (h1 → h3) |
| Data-table headers | 1.3.1 | degrading | a multi-row data table has no `<th>` |
| Text contrast | 1.4.3 | degrading | text resolves between 3:1 and the 4.5:1 its size requires |
| Colour-only link | 1.4.1 | blocking | a link inside prose, with no underline/border/weight/background of its own, under 3:1 against the text around it |
| Label in name | 2.5.3 | blocking | a control that names itself from its own content carries an `aria-label`/`aria-labelledby` that does not contain the text on the control |

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
automates them was never true of a default run. Their catalog rows now give
the measured reason instead.

**Amended later the same day: that measurement answered a different question
than the one it was used to settle.** What a default `axe.run()` executes is
evidence about axe. Whether a barrier is decidable from the artifact is a
separate question, and for one of the three the catalog already answered it —
2.5.3's row had said "decidable from the markup" since it was written. It is
now a rule (see [below](#label-in-name-added-2026-08-22)), which leaves two
`unimplemented` rows and only one of them undecidable. Reading "the reference
does not run it" as "we were right not to build it" is the mistake, and it
held for about four hours.

The genuine remaining gap was **1.4.1 Use of Color** — axe reports it by
default, it fired once on this portfolio's own pages when this catalog was
written, and no rule here looked for it yet. It is named as such in
`COVERAGE` rather than grouped with the three that are not gaps, and it
closed in a later pass the same day — see
["Use of Color: added 2026-08-22"](#use-of-color-added-2026-08-22) below.

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

## Use of Color: added 2026-08-22

The last of the eight criteria `a11y-external-coverage-reference` disclosed,
and the only one of the four left after that morning's pass that was a real
gap — the other three rest on axe rules that ship disabled or experimental, so
no default run reports them either.

[`wcag_triage.usecolor`](src/wcag_triage/usecolor.py) decides the one shape of
this criterion an artifact settles: **a link inside a block of prose that
colour alone marks out as a link**. Everything else the criterion covers — a
required field shown in red, a status carried by a swatch, an instruction that
says "press the green button" — needs someone to read the page, and the
coverage row says so.

Three questions in order, and a finding only on *yes, no, yes*:

1. **Is the link inside prose?** Not laid out as a box of its own — including
   by being a flex or grid child, which CSS blockifies — and inside a block
   whose non-link text is longer than its link text.
2. **Is it marked some other way?** An underline — **including the browser's
   own**, which applies while the page has declared nothing — a border, an
   outline, a different weight, family, or background.
3. **Are the two colours closer than 3:1?** The link's against the prose's, at
   the ratio WCAG technique G183 names and the reference engine uses, under
   both colour schemes; a failure in one scheme only says which.

Anything unresolved yields `undecidable` with a named reason and no finding,
the same refusal the rest of this probe commits to. The evidence record prints
the per-link tally, including the denominator — links examined out of links on
the page — because "3 links failed" without "of 41 examined" reads as a check
of the whole criterion.

**What this deliberately does not attempt**, each a false negative rather than
a false positive: a decoration painted by an ancestor and shown through a
descendant's text by the browser's own layout, which is a rendering mechanism
distinct from CSS inheritance; any decoration gated on `:hover` or `:focus`,
which a static pass cannot observe — and which is the right answer as well as
a limit, since a distinction a reader has to hover to find is not one; and
every use of colour that is not a link in prose. That is why the `COVERAGE`
row moved from `unimplemented` to `partial` rather than to `automated`.

### Two sessions, one criterion, and the measurement that decided between them

Two independent scheduled sessions implemented 1.4.1 within an hour of each
other on 2026-08-22 — the duplicate-work pattern `CLAUDE.md` documents, this
time on the same criterion in the same file.
[#622](https://github.com/Duncan-Haywood/monorepo-projects/pull/622) merged
first; [#621](https://github.com/Duncan-Haywood/monorepo-projects/pull/621) had
run the 118-page corpus and the browser cross-check, and consolidated after.

What settled it was not the argument, it was the corpus. Run over the same 118
built pages:

| | findings on `photo-editing/docs-site` | axe-core 4.13.0 reports |
|---|---:|---:|
| merged rule (`rule_use_of_color`) | **30** | 1 |
| consolidated rule (`usecolor`) | **1** | 1 |

The 29 extra were the site's brand link, nine `display:block` card links in a
card grid, and five file-list rows — none of them prose, all of them cleared
by a gate the merged rule did not have. Three differences produced that, and
each is now a named test:

| The merged rule | Why it was wrong | Measured effect |
|---|---|---|
| A fixed floor of a few characters of surrounding text | A card grid and a file-list row both clear any short floor while the link is still the whole row | most of the 29 |
| Fires when the two colours *differ at all*, and not when they are identical | The criterion's threshold is 3:1 (G183, and the reference's own rule); a link identical to its prose is the **worst** case, not an out-of-scope one | over-reports the distinguishable, misses the invisible |
| Declines `text-decoration: inherit` as undecidable | The declaration *overrides* the UA underline, so the value comes from the paragraph, which is `none`. Every Tailwind preflight writes it | **152 in-prose links** in this corpus, none underlined, all of them unflagged |

**What the merged pass built that is kept**: its per-element
`contrast.decoration_line` and `contrast.foreground_color` helpers (the
consolidated rule walks the inheritance chain *on top of* `decoration_line`
rather than replacing it), its per-scheme evaluation and the naming of which
scheme a finding was decided in, and its unit tests — three of which now assert
the opposite of what they did, each with the measurement that inverted it in
the docstring.

The honest reading of the collision: neither session could see the other, both
read the same three files naming 1.4.1 as the remaining gap, and both were
right that it was. What one of them had was a rebuilt corpus and a browser.

### It was wrong three times before it was right, and only a corpus showed it

The consolidated rule is not the first draft either. None of these were
visible from the fixtures; each is now a named test.

| What the rule did | Why it was wrong | Measured effect |
|---|---|---|
| Required 25 characters of surrounding text | A file-list row (`<li><a>Long title</a> — <code>file.html</code></li>`) clears any short floor and is still a list | **6 findings against the reference's 1** on the one page that has a real one |
| Treated `a { text-decoration: inherit }` as "nobody said anything, so the browser underlines it" | That declaration *overrides* the UA underline; the value then comes from the paragraph, which is `none` | **152 links** that are not underlined counted as underlined — every Tailwind page in the corpus |
| Read `display` only on the link | A flex or grid container blockifies its children, so a header button is a box however inline its tag | **3 of the 5** remaining findings were flex-row buttons |

The first fix is the reference engine's own rule (`isInTextBlock`:
`parentText.length > widgetText.length`), adopted because it is the honest form
of the question — a link is hidden in prose when the prose outweighs it — and
because a scale-free comparison beats a character floor at both ends. That two
independent implementations *both* began with a character floor, and both were
wrong the same way, is the part worth carrying forward.

### Out-of-sample: 1 finding, and the reference reports the same node

Over the 118 built pages of [`a11y-own-sites/`](../../../research/a11y-own-sites/):

| | count |
|---|---:|
| `<a href>` in the corpus | 1380 |
| Examined (inside prose, not a box of their own) | **123** |
| Decided | 122 (99.2%) |
| Undecidable (`translucent-text`) | 1 |
| Failures | **1** |

The failure is `photo-editing/docs-site index.html`: a link in a callout
paragraph, `#38bdf8` against prose in `#e8edf7`, **1.825:1**, underline
removed. axe-core 4.13.0's `link-in-text-block` reports **exactly that node,
on exactly that page, and nothing else in the corpus**.

Corroboration was not left at the failure. For **all 123** examined links, the
computed `text-decoration-line`, `display` and colours were read out of
Chromium and compared with what this static reader concluded: **0
disagreements**. Three `quick-pick-survey` pages sit outside that check —
their delivered DOM carries more links than the prerender, the same
client-rendering limit this corpus has hit before.

A second, rendered corpus corroborates it from the other direction:
[`a11y-generated-sites`](../../../research/a11y-generated-sites/) runs a
positive control on `local-site-studio`'s real delivered pages, where stripping
the `underline` class from the one in-prose link leaves it exactly the colour
of its paragraph — caught on 4/4 pages that have such a link. That control
found a defect in the harness rather than the rule; see its Finding 5.

### What moved elsewhere, and what deliberately did not

- **Recall 0.975 → 0.976** ([`a11y-axe-recall/`](../../../research/a11y-axe-recall/)),
  and the point is the denominator rather than the rate: the checked-criteria
  universe went 17 → 18, the axe instance that came with it is matched, and the
  record printed to a customer now quotes the wider measurement. The probe's
  `tests/test_accuracy_citations.py` is what forced that update rather than
  letting the old figure stand.
- **Engine agreement 91/118 → 90/118**, and the new disagreement is the first
  in this corpus that is not a relabelling: the probe reports 1.4.1 and the
  sibling engine has no rule for it. Named by test rather than smoothed over.
- **`eaa-remediation-pipeline`'s scores do not move.** `liability_containment`
  stays at 5. Implementing a criterion is not a measurement of whether the
  coverage statement is accurate, and this pass found three of its own defects
  and 29 of another implementation's on the way — none of them a defect in the
  record.

## Label in Name: added 2026-08-22

SC 2.5.3 is the first criterion this engine decides that a default reference
run does not report at all, and that is the whole reason it is worth a section.

**What fires.** A control that takes its accessible name from its own content —
a `<button>`, an `<a href>`, an `<input type=submit>`, or any element with an
explicit widget role — carrying an `aria-label` or `aria-labelledby` whose text
does not contain the label a sighted user reads. `<button aria-label="Submit
order">Buy now</button>` is the shape. A speech-input user says "Buy now" and
nothing happens: the spoken command is matched against the accessible name, and
that name does not contain the words on the control. Rated **blocking** on the
same reading that makes the `aria-hidden` rule blocking — the barrier stops one
population completely rather than slowing everyone down.

**Why it was not built until now.** It was disclosed as `unimplemented` on
2026-08-21 and left there on 2026-08-22, both times because axe's only rule for
it (`label-content-name-mismatch`) ships experimental and off by default, so a
default run never reports it. That measurement is correct and was read as
though it decided what to build. It does not: what the reference executes is a
fact about the reference. The row's own note had said *"decidable from the
markup"* from the day it was written, and it is — two strings and a comparison.

The comparison normalises case, punctuation and whitespace before testing
containment, which can only make two strings match that otherwise would not.
That direction is deliberate: it costs recall and never precision, and "Buy
now!" against "Buy now" is not a defect worth a finding.

**What it refuses to decide**, each an under-report and together the reason the
row is `partial` rather than `automated`:

| Refused | Why |
|---|---|
| A label rendered as an image | WCAG counts images *of text* as part of the label; an `alt` is a description of an image, not a transcription of it, so a mismatch between an `alt` and an `aria-label` would be a finding about a guess |
| A glyph-only label (`×`, `→`) | Not text presented visually. An `aria-label` is how such a control is *supposed* to be named, so firing there would flag the fix rather than the defect |
| An `aria-labelledby` pointing at an id the document does not define | A name resolved from nothing is not a name this rule may reason about |
| A label injected by CSS `content`, or assembled at runtime | Not in the artifact |
| A separate visible label next to a field (a textbox, a combobox) | Those do not take their name from content, and the two strings alone do not decide the criterion |

### Out-of-sample: zero findings, and zero pairs to decide

Run over 71 real pages — the 31 HTML files committed in this repository plus a
fresh `npm run build` of `ventures/print-atelier` (40 pages) — the rule produced
**no findings at all**. That number says nothing about whether those pages
conform, and the second measurement is the one that matters:

| | committed pages | print-atelier build | total |
|---|---|---|---|
| Pages | 31 | 40 | 71 |
| In-scope widgets | 315 | 677 | 992 |
| …carrying an `aria-label`/`aria-labelledby` at all | 1 | 8 | 9 |
| …with a decidable visible label | 0 | 0 | **0** |

All nine overrides sit on controls with **no visible text** — icon-only buttons
whose only child is an `<svg>` (`Search prints`, `Shopping cart`, `Open
navigation`), which is exactly what `aria-label` exists for and a shape this
criterion cannot apply to. So the corpus **cannot exercise the rule**, and the
zero is a property of the corpus rather than evidence about the rule's
precision. This is the same wall the 2.4.1 pass hit from the other direction,
and it is stated here rather than left for a reader to infer from a clean run:
outside its own fixtures, this rule has never been given a pair to judge.

A source scan of all 13 ventures agrees and explains why — 34 `aria-label` uses,
every one of them on an icon-only button, an `<input>`, a `<select>` or a `<nav>`
landmark. Rebuilding the other six applications would not change the table
above, which is why only one was built.

### What moved elsewhere

- **`a11y-axe-recall`'s checked-criteria universe goes 18 → 19**, and unlike
  1.4.1 this one **cannot move the recall rate**: a default axe run never
  executes a rule for 2.5.3, so there is no instance for the wider universe to
  include. The committed snapshot is a frozen browser pass and now lags the
  worktree by exactly this criterion. Rather than rebuild all seven
  applications to regenerate a file that would come back field for field
  identical, the lag is pinned by a test that asserts both halves — the
  difference is exactly `{2.5.3}`, and axe emitted nothing for it anywhere in
  the 118-page corpus. If a future axe version turns that rule on by default,
  the test fails and the corpus has to be re-run.
- **`a11y-engine-agreement`'s catalogs**, regenerated rather than hand-edited.
  Only the `catalogs` key changed; `silent_gaps`, `attribution` and the corpus
  agreement are identical. 2.5.3 becomes the second criterion this engine
  checks and the sibling does not — the asymmetry 1.4.1 introduced, now with a
  second instance.
- **`eaa-remediation-pipeline`'s scores do not move.** `liability_containment`
  stays at 5. Implementing a criterion is not a measurement of whether the
  coverage statement is accurate — the rule that only a re-measurement of the
  thing being scored may move a score, not a pass liking its own work.

## Orientation: added 2026-08-22

1.3.4 was the last row this catalog disclosed as `unimplemented` whose own
note said the criterion was decidable — the same overdue correction 2.5.3
got earlier the same day: axe's rule for this (`css-orientation-lock`) ships
experimental and off by default, which is a fact about axe, not about
whether a stylesheet reader can decide the question. 1.2.1 is the one row
left, and it is left because the reference's own rule for it returns
"incomplete" even when forced on — a genuine gap, not an unread note.

**What fires.** The classic "hide the portrait warning, spin the whole page
90 degrees to force landscape" hack: a stylesheet conditions a `transform:
rotate()` on `<html>` or `<body>` under `@media (orientation: portrait)` (to
force landscape) or the reverse, with an angle that is not a multiple of 360
degrees — an actual visual rotation rather than a no-op like `rotate(360deg)`.
Whichever way the reader holds the device, the page renders sideways. Rated
**blocking**, on the same reading that makes `rule_interactive_aria_hidden`
and `rule_label_in_name` blocking: a reader who cannot or does not rotate
their device — a phone in a fixed mount, a monitor bolted in place, a motor
impairment that makes physically rotating a handheld device difficult — is
stopped completely, not merely slowed down.

**What it refuses to decide**, each an under-report and the reason the row
stays `partial`: a lock enforced by a `resize`/`orientationchange` script
handler rather than CSS; an `@page` orientation restriction on a print
stylesheet; and a rotation applied through a class selector rather than a
bare `<html>`/`<body>` type selector — deciding which elements a class
reaches, and whether any of them amounts to "the whole page", needs the
DOM-and-cascade reasoning `css.py` refuses to do for anything but a bare type
selector, the same boundary that already scopes every rule in this file.

**No out-of-sample corpus run for this one.** Unlike 2.5.3 and 1.4.1, this
pass was not re-checked against `a11y-own-sites`, `a11y-generated-sites`, or
an `a11y-axe-recall` re-run — the orientation-lock hack is a fixed-viewport
hack aimed at mobile devices, and none of this portfolio's own pages attempt
to lock orientation, so a corpus check would report the same true zero
`rule_bypass_blocks` did before its rendered-corpus check existed, for a
different reason each time. The rule is verified here only by its own tests
and by confirming the committed fixture-validation record does not change —
which it does not, because none of the three hand-labeled fixtures contain a
stylesheet that touches `transform`.

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
mechanically at all. It can, and the coverage split it produces (18 criteria
reasoned about, 9 named criteria explicitly deferred to a human, 1 disclosed
as decidable but not yet built) is itself the first concrete instance of the
"quarter to a third" gap the candidate asserts.

## Mechanical fixes (fixtures only, 2026-08-24)

The first experiment's software half is now here: a pass that applies only
rewrites that do not invent meaning, then re-runs the same engine. It will
derive a title from the first heading, close a heading-level skip, remove
`aria-hidden` from a focusable control, drop a viewport zoom-lock, remove a
timed meta refresh, unwrap `<blink>` / `<marquee>` (keeping the text), and
drop an `aria-label` that does not contain the visible label. It will not
invent alt text, labels, captions, link names, button names, or a page
language. A dead `<label for>` whose pairing is a forgotten expression
prefix is a different rewrite (two existing strings); this pass does not
touch it. 1.2.1 stays unbuilt: the reference returns incomplete even
when forced on.

On the three fixture shops it closes **1 of 11 blocking** findings and
**2 of 3 degrading** findings. That is a fixture re-audit, not AT
verification, and it does not settle the kill criterion. The 1/11 is the
honest software-only rate: the blocking remainder is content a page author
has to write. `--apply-mechanical-fixes DIR` writes the patched copies and
that close-rate report; the evidence record stays a record of the source.

**Amended 2026-08-24: forgotten-prefix labels are now a fifth rewrite.**
Finding 2 of [`a11y-theme-resolution`](../../../research/a11y-theme-resolution/)
is two strings: a literal `<label for>` that cannot match any id in the
file, next to exactly one expression-bearing control id whose trailing
literal is that `for` value after a separator. The pairing is unique, so
rewriting `for` is not inventing a name. The third fassbender defect
(`search.liquid:22`) still has no repair — that file has no `<label for>`
and this pass will not write one. Ambiguous suffixes and expressions that
could still render equal are left alone. No score moved.

**Amended 2026-08-24: autoplay mute and orientation-lock drop.** Two more
uniquely determined rewrites, neither of which invents words. **1.4.2**
adds `muted` to `<video>` / `<audio autoplay>` — the rule's own first
remediation is a boolean, not a caption. **1.3.4** removes a visual
`transform: rotate()` from a bare `html` / `body` rule inside a *pure*
orientation media query. Combined queries, no-op turns (`rotate(0deg)` /
`rotate(360deg)`), class selectors, and a `transform` that carries any
other function stay. Timed refresh, blink/marquee unwrap, and name-override
drop already landed in #825 and are not reopened here. Fixture close
rate is still 1 of 11 blocking: these two defect classes are not in the
fixture shops.

**Amended 2026-08-24: colour-only links are underlined.** **1.4.1**'s own
first remediation is this one mark. The pass restores `text-decoration:
underline` on the flagged in-prose link and leaves its words and colours
alone. A nav-style link the rule did not name is not touched. Fixture
close rate is still 1 of 11 blocking: the fixture shops do not carry this
class.

**Amended 2026-08-24: a missing bypass gets a `<main>` landmark.** **2.4.1**'s
own second remediation is this wrap. The pass puts `<main>` around the
content after the first navigation block (or around the body inner when
the finding fired on link count alone). Words stay. A "skip to content"
link would invent a name, so this pass will not write one. Fixture close
rate is still 1 of 11 blocking: the fixture shops already have headings.
Host themes already have headings too, so the host-theme close-rate job
does not inject this class. The split has moved four
times since it was first drawn: on 2026-08-21, when 1.4.3 crossed from
deferred to partial because the corpus changed, not because the rules got
cleverer; on 2026-08-22, when four criteria a prior pass had disclosed as
`unimplemented` — including 1.4.1 — became rules; later that day, when 2.5.3
became the fifth; and later still the same day, when 1.3.4 became the sixth,
leaving 1.2.1 as the only `unimplemented` row left and the only one of the
original eight that is actually undecidable rather than merely unbuilt.

## Positive control (2026-08-24)

A clean findings table is ambiguous: either the page has no static defects, or
the scanner could not read the page. [`a11y-generated-sites`](../../../research/a11y-generated-sites/)
named the cheap test that separates them — mutate the customer's own page,
check the rule fires — and ran it as research. That test is now in the
product: the probe's positive-control module
runs on every CLI invocation, and the evidence record prints the result in the
header and in its own section immediately above the findings.

Fifteen mutations (three removals, twelve injections) cover the blocking
criteria a qualification audit leads with, including the 1.3.4 orientation
lock the mechanical pass can now close. A removal that finds nothing to
edit is `not_exercised` — untested, not passed. A page that already failed
the target check is `already_present`, not a miss. `missed` is reserved for
the case the research named: we introduced the defect and the scanner
reported nothing.

No score moved. The control does not change precision, recall, or
`liability_containment`. It makes a silent miss visible in the file a buyer
holds, which is the coverage-in-the-product rule this probe already follows
for everything else.

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

326 tests: parser behaviour, each rule and its negative control, the
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
plus the specificity case that shipped a wrong answer on a real page). Added
2026-08-22, for `rule_use_of_color`: every named undecidable reason
`decoration_line()` can return (no declaration, `inherit`, an unresolved
`var()`, a `:hover`-only rule, a scheme-conditional override resolved on both
sides), the surrounding-text gate, and the dark-mode-only case named in its
own message. Added 2026-08-22, for `rule_label_in_name` (20 tests): the
mismatch itself, a name that extends the visible label rather than replacing
it, case/punctuation normalisation, `aria-labelledby` resolved rather than
assumed and taking precedence over `aria-label`, every refusal above (glyph-only
label, image label, unresolvable id, textbox out of scope, `aria-hidden`), and
the `role` attribute moving an element both into and out of scope. Added
2026-08-22, for `rule_orientation_lock` (17 tests, plus 2 more in `css.py`'s
own suite for `orientation_of`/`orientation_conditionals`): the positive case
on both `html` and `body`, every refusal (a breakpoint combined with the
orientation condition, both orientations named at once, `rotate(0deg)` /
`rotate(360deg)` / `rotate(-360deg)`, no `transform` in the block at all, a
`transform` on a class selector instead of a bare type selector, a `transform`
that carries no `rotate()`, an unconditional rotation that never locks
anything), unit conversion (`turn`, `grad`) feeding the same no-op check, and
that only one finding is ever reported even when both elements are locked.
Added 2026-08-24, for the per-engagement positive control (10 tests): every
mutation that bites a well-formed page is caught, a fragment with no
attachment point is `not_exercised` rather than a fabricated catch, a page
that already fails the target check is not a miss, a constructed miss stays
a miss, the record omits the section when the control was not run and prints
it above the findings when it was, and a miss is named in the header.

## Expression-aware `<label for>` matching (2026-08-24)

Finding 3 of [`a11y-theme-resolution`](../../../research/a11y-theme-resolution/)
named a concrete improvement this engine and its sibling `audit.py` could
adopt: match `<label for>` against control ids on raw template text, not on
the expression-stripped literal. `audit.py` already had it. This probe did
not -- exact-string match only -- so the 64 same-file cases that differ only
by expression spacing would have been unnamed false positives, and the
fassbender-shopify-theme newsletter defect (`for="mce-NAME"` against
`id="{{ idPrefix }}_mce-NAME"`) would have been reported as "no label"
rather than as a label that can never resolve.

[`expressions.py`](src/wcag_triage/expressions.py) ports the matching helpers.
Rendered HTML (no `{{ }}` / `{% %}` / etc.) is unchanged: fixture validation
stays byte-identical. On theme source, a certain match is silent, a
possible-but-not-certain match is silent (precision over recall), and a
proven mismatch is a blocking 1.3.1. No score moved.

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
