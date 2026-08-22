# The first gate measurement: what an independent engine checks that ours do not

Built and measured 2026-08-21. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-external-coverage-reference
python3 -m unittest discover -p 'test_*.py'            # 21 tests
python3 measure.py                                     # measure the worktree
python3 measure.py --at-revision ab81715               # the as-found state
python3 measure.py --recompute-from results-2026-08-21-as-found.json
python3 measure.py --refresh-catalog                   # only step needing network
```

## Why this was built

[`portfolio/pipeline/README.md`](../../pipeline/README.md) ends its scoring
section with a standing open question, put there by
[`score_sensitivity.py`](../../pipeline/score_sensitivity.py) and merged as
#549:

> The two dimensions that decide admission have never been measured on any
> candidate. […] So the next scoring measurement worth paying for is a **gate**
> measurement, and no pass has attempted one.

It also names the reason no pass attempted one:

> answering it for the accessibility candidates needs the WCAG normative index
> as a denominator — `www.w3.org` is egress-denied and no copy is in this
> repository

That sentence is true about `www.w3.org` and false about the denominator.
`axe-core` is published to `registry.npmjs.org`, which this environment reaches
(measured 200, twice, on separate dates — see
[`egress-reachability/`](../egress-reachability/)), and every one of its rules
carries the success criteria it tests as tags. A criterion-level reference for
*what is automatable at all* was one `npm` fetch away, and had been the whole
time.

This is the same error class [`data-reachability/`](../data-reachability/) was
written to stop — probing a canonical host, concluding "unreachable", and never
probing the channel that actually carries the data. It is worth noting that the
rule existed, was written down, and still did not fire here: it had been applied
to *feeds* and never to *the standard itself*, because nobody thought of a
normative index as a thing with a distribution channel.

## What axe-core is and is not

It is **a reference, not ground truth**. It is one vendor's automatable subset
of WCAG, it is not normative, and a criterion it has no rule for is not thereby
uncheckable. Pinned here at **4.13.0** (`axe-rules-4.13.0.json`, committed, so
the whole measurement re-derives with no network).

A criterion's *level* is derived only from axe rules that name exactly one
success criterion, because axe tags levels per rule rather than per criterion.
Guessing from multi-criterion rules would pull 2.1.3 (AAA, reachable here only
through a rule also tagged 2.1.1) into A/AA scope and inflate every count by
one. **22 A/AA success criteria** carry at least one rule under that rule.

What this supports is one directional claim, and the module makes only that
one: **a criterion axe-core automates, that our engines neither check nor
disclose, is a gap we could not have known we had.**

## Finding 1 — eight criteria were in neither list. Six are Level A

The two engines' coverage statements, read at `ab81715`, against the reference:

| | criteria |
|---|---:|
| axe-core A/AA criteria with ≥1 rule | 22 |
| Checked by at least one of our engines | 10 |
| Declared untested by at least one | 4 |
| **In neither list** | **8** |

| Criterion | Level | axe rule |
|---|---|---|
| 1.2.1 Audio-only and Video-only | A | `audio-caption` |
| 1.4.1 Use of Color | A | `link-in-text-block` |
| 2.2.1 Timing Adjustable | A | `meta-refresh` |
| 2.2.2 Pause, Stop, Hide | A | `blink`, `marquee` |
| 2.4.1 Bypass Blocks | A | `bypass` |
| 2.5.3 Label in Name | A | `label-content-name-mismatch` |
| 1.3.4 Orientation | AA | `css-orientation-lock` |
| 3.1.2 Language of Parts | AA | `valid-lang` |

**Why "in neither list" is the finding rather than "not checked".**
[`a11y-engine-agreement/`](../a11y-engine-agreement/) established the standard
this is measured against, and it is the candidate's own:

> A record carries two lists — what was found, and what was not checked. A
> reader can only distinguish "checked and passed" from "never looked at" by
> those two lists. **A criterion in neither is invisible to the customer.**

By that standard these eight were invisible. A merchant handed a clean evidence
record could not have learned from it that nobody had looked for a skip link.

**These are gaps in the code, not only in the tables.** Every table comparison
in this repository so far has compared *statements*, and a statement can be
wrong in the harmless direction — an engine that checks something its catalog
forgot to mention. So each of the eight is also run as defect markup through
both engines, and the claim is only allowed to stand if both are genuinely
silent. Both are silent on all eight
(`test_measure.py::TestGapsAreReal`).

**2.4.1 is the one to read twice.** Bypass Blocks is Level A, it is among the
most commonly failed criteria on real commerce pages, and it is exactly the
kind of defect the candidate's free qualification audit is supposed to open a
conversation with. Two engines, five measurement passes, 118 pages of built
output and 14 pages of delivered product, and no pass had a rule for it or a
line disclosing that.

## Finding 2 — criterion-level disclosure hides most of what is missing

The eight above are a bug and are now fixed (below). This one is structural.

Both engines disclose at *criterion* granularity: a criterion is `automated`,
`partial`, or `manual`, and `partial` means "catches some failures but not
all". For criteria both engines claim, here is how many distinct rules the
reference has:

| Criterion | Level | axe rules | our claim |
|---|---|---:|---|
| 4.1.2 Name, Role, Value | A | **29** | partial |
| 1.3.1 Info and Relationships | A | **12** | partial |
| 1.1.1 Non-text Content | A | 7 | automated |
| 3.1.1 Language of Page | A | 3 | automated |
| 1.2.2, 1.4.2, 1.4.3, 1.4.4, 2.4.2, 3.3.2 | — | 1 each | partial / checked |

A record that says *4.1.2 — partial* is describing three rules (button name,
frame title, focusable `aria-hidden`) against 29 the reference knows about. A
record that says *1.1.1 — automated*, the strongest word in the vocabulary, is
describing one rule family against 7.

`a11y-engine-agreement/` found the same shape at a smaller scale and named it
precisely — *"4.1.2 was in the checked list (via button names), so a
criterion-level comparison shows no gap — the missing case hides one level
down"* — and then went on comparing at criterion level, because it had nothing
to compare the level below against. This is that comparison, and the answer is
that the level below is where nearly all of the missing coverage lives.

This is the finding that moves a score, because it does not go away by adding
rows to a list. Rule counts are a proxy — axe rules are not failure modes
one-for-one, and a curated shop-page catalog legitimately skips some — so read
the ratio, not the difference.

## Finding 3 — four criteria are declined as needing a human, but are automatable

| Criterion | Level | declined by | axe automates |
|---|---|---|---|
| 2.1.1 Keyboard | A | both | 3 rules, incl. `scrollable-region-focusable` |
| 1.3.5 Identify Input Purpose | AA | `audit.py` | `autocomplete-valid` |
| 1.4.12 Text Spacing | AA | `audit.py` | `avoid-inline-spacing` |
| 2.5.8 Target Size | AA | both | `target-size` |

This is the mirror image of Finding 1 and it costs **margin, not accuracy**: the
record is honest, but work is being routed to the paid contractor step that a
rule could do. `audit.py`'s 1.3.5 reason is the model to copy — it separates the
checkable part (are the tokens valid) from the human part (are they the *right*
tokens) instead of declining the whole criterion. Left as measured rather than
acted on; it is a pricing question, not a liability one.

The same shape has now been found three times — 1.4.3 contrast declared manual
for five passes, the `<iframe>` rule that existed in one engine and not the
other, and these four. Each time, "needs a human" turned out to describe the
corpus or the effort rather than the criterion.

## What was changed, and what deliberately was not

**Changed: the disclosure, in both engines.** All eight criteria from Finding 1
are now declared, with reasons that say *"no rule here looks"*.

They are **not** declared `manual`. `manual` in these engines means
*structurally undetectable from static markup — needs rendering, interaction,
or assistive-technology confirmation*, and for all eight that is false. Filing
them there would have replaced an omission with a false statement, and would
have repeated exactly the error 1.4.3 sat inside for five passes: a criterion
nobody had built recorded as one nobody could build. So the probe's coverage
vocabulary gains a fourth value, `unimplemented`, and `audit.py`'s reason
strings carry the marker its single list has room for.

The customer-facing difference is the point. `manual` is work the contractor
step covers and the buyer is paying for. `unimplemented` is work **nobody
does** — and the evidence record now says so in the sentence that counts the
coverage table.

**Not changed: no rule was implemented.** Disclosure is not detection, and a
pass that quietly closed the gap by writing eight rules would have been
measuring its own work. `test_measure.py` pins that separation: the eight are
still tested for non-detection, and if a later pass implements one, the test
fails until its coverage value moves off `unimplemented`.

**Sibling module regenerated, findings unchanged.**
[`a11y-engine-agreement/`](../a11y-engine-agreement/)'s committed results file
records both catalogs, so it was regenerated rather than hand-edited. Only the
`catalogs` key changed: its silent-gap pair (`2.4.6` / `3.3.2`), its attribution
table (10 of 12) and its corpus agreement (2 of 3) are identical. Its
`probe_catalog` adapter did need a fix — it read "not `manual`" as "checked",
which would have made it report all eight as fresh silent gaps in the *sibling*
engine. `eaa-wcag-triage`'s fixture validation is byte-identical.

One test was narrowed: `audit.py`'s record must never contain `"pass "`, and
WCAG's own criterion name *Bypass Blocks* contains it. Now
`(?<!by)pass` — narrowed against one false positive, not widened.

## Finding 4 — the gate score this was built to measure

`eaa-remediation-pipeline` is the pipeline's only `build-now`, and its
`liability_containment` was an unmeasured **6** against a gate of 5.
`score_sensitivity.py` had flagged exactly this cell as the one where an error
changes an admission rather than an ordering.

The candidate's liability position is not "we are accurate". It is:

> Real exposure if we overclaim; contained by selling evidence, never a
> compliance guarantee

and, from the directory's standing constraints:

> **Coverage limits stated in the product**, not buried in terms. A customer
> who believes coverage is total is the one who gets hurt.

So the score does not rest on the engine finding everything. It rests on **the
coverage statement being accurate**, and that artifact had never been checked
against anything outside this repository. Checked, it was wrong in both
directions at once: 8 of 22 criteria absent from it entirely, and its strongest
label, on its widest criterion, standing for 3 rules out of 29.

**`liability_containment` 6 → 5.** Not below the gate. The business still files
nothing, signs nothing and certifies nothing, and the eight-row omission was
cheap to fix and is fixed. What does not survive is the *margin*: a mitigation
that had never been tested and failed on first contact is not worth a point
above the gate. It is worth the gate exactly.

Composite 7.25 → **7.125**; floor stays 5 and is now a tie between
`defensibility` and `liability_containment`. The consequence is the decision-
relevant part: **the pipeline's only build-now candidate now sits on the gate
with no margin.** One more measured point anywhere in liability rejects it.

`shopify-a11y-evidence` (liability 7) ships the same record from the same
engines, so this evidence bears on it too — but its estimate is a different
number resting partly on the app-store surface, and moving it from here would
be extrapolation. Recorded in its write-up as flagged-and-unmeasured, per the
precedent `agent-permission-harness` set for defensibility.

## The pattern this is the seventh instance of

`rescore-2026-08-20.md` records that this pipeline's screening scores are
optimistic about the businesses and pessimistic about the environment: every
product-assumption check has cost a point, and every environmental re-check has
unblocked something.

This pass is both at once, which is why it is worth stating rather than
counting:

- **The environmental assumption improved.** The denominator was declared
  unobtainable and was obtainable, from a host already measured as reachable.
- **The product assumption fell.** With the denominator in hand, the coverage
  statement measured worse than estimated, and a gate score fell one point.

Six revisions before this one landed in `ai_leverage`, `defensibility` and
`distribution` — the three that decide rank, where `score_sensitivity.py` shows
the bias changes nothing. This is the first revision in a dimension that decides
*admission*, and it lands one point above rejection.

## What would settle this, and what it would cost

The measurement above bounds the *disclosure*. It does not measure the false
negative rate, which is the quantity liability actually turns on, and which
nothing in this repository has ever measured out of sample:

- out-of-sample **precision** is measured — 0.821–0.881, over 118 built pages
  ([`a11y-own-sites/`](../a11y-own-sites/))
- out-of-sample **recall** is not measured anywhere. The only recall number in
  the repository is **1.0**, against the three-page fixture set written
  alongside the engine

That asymmetry is itself the liability shape: the error direction that costs a
refund has been measured, and the direction that costs a lawsuit has not. The
cheapest honest next step is to run axe-core itself over the 118-page corpus and
diff — the corpus exists, both engines' findings on it are committed, and
axe-core is fetchable. That is a genuinely independent third detector rather
than two engines with a shared author lineage, and it is the first thing in this
repository that could put a number on what both of ours miss. It needs a
headless browser, which is why it is named here rather than done.

---

## Finding 5 (2026-08-22) — three of the eight rest on rules axe-core does not run

Findings 1 and 3 were derived from `axe.getRules()`, which lists every rule
axe-core **ships**. A default `axe.run()` does not execute all of them, and the
extraction above dropped the two flags that say which: `enabled` and
`experimental`. A rule axe never runs counted as evidence that an independent
engine automates a criterion.

The catalog now carries both flags (purely additive — same 75 rules, same
criteria, same levels), and four A/AA criteria turn out to be reachable only
through rules a default run skips:

| Criterion | Level | axe rule | why it never fires |
|---|---|---|---|
| 1.2.1 Audio-only and Video-only | A | `audio-caption` | ships **disabled**; returns *incomplete* even when forced on |
| 1.3.4 Orientation | AA | `css-orientation-lock` | **experimental**, off by default |
| 2.5.3 Label in Name | A | `label-content-name-mismatch` | **experimental**, off by default |
| 2.5.8 Target Size | AA | `target-size` | ships **disabled** |

**The denominator is 18, not 22.** Three of those four are from Finding 1's
eight; the fourth, 2.5.8, is from Finding 3's list of criteria "declined as
needing a human that axe automates" — and axe does not automate it either.

### This was measured by running axe, not by reading its rule list

The claim above would be another table comparison if it stopped at the flags.
Every fixture in `test_measure.py`'s `DEFECTS` was rendered in Chromium and run
through axe-core 4.13.0 (the harness in [`a11y-axe-recall/`](../a11y-axe-recall/)
already existed). Of the nine fixtures, **a default run reports five**:

| Fixture | default run | forced on |
|---|---|---|
| 1.4.1, 2.2.1, 2.2.2, 3.1.2, 1.3.5 | violation | — |
| 1.3.4, 2.5.3 | *rule not executed* | violation |
| 1.2.1 | *rule not executed* | **incomplete** |
| 2.4.1 | **pass** | **pass** |

### 2.4.1's fixture was not a 2.4.1 failure

The last row is a separate defect, and a sharper one. The fixture was:

```html
<nav><a href='/a'>a</a></nav><main><p>x</p></main>
```

It contains a `<main>` landmark — one of the three mechanisms axe's `bypass`
rule accepts — so axe *passes* it. `TestGapsAreReal` asserted that both
in-house engines were silent on this markup, and they were, because there was
nothing to find. **That subtest could not have failed**, on the one criterion
the write-up above singled out to read twice.

The gap it was evidence for is real: neither engine had a rule for 2.4.1, and
the catalog said nothing about it. What is gone is the behavioural
confirmation, on that row, that the module's whole design rests on. The fixture
is corrected, and the correction is load-bearing now that 2.4.1 is implemented.

A further measured detail, worth stating because it changes what a rule for
this criterion can claim: given a genuine failure — navigation, prose, no
mechanism at all — axe's `bypass` returns **incomplete**, not a violation. On
2.4.1 the reference declines to decide.

### What this does and does not do to Finding 1

**Finding 1 stands.** Its claim is that eight criteria were in neither engine's
checked list nor its not-tested list, and that is a fact about the catalogs,
independent of what axe runs. All eight are decidable from the artifact, and
four are now rules.

**Its severity was overstated**, in a way that matters for how the next reader
uses it. "An independent engine automates this and we do not" was true of five
of the eight and is not true of 1.2.1, 1.3.4 or 2.5.3. The honest residue is
**one** criterion that axe reports by default and neither engine looks for:
**1.4.1 Use of Color** — which fires once on this portfolio's own corpus
(`photo-editing/docs-site`), and is named in the probe's catalog as the single
genuine remaining gap rather than grouped with the three that are not.

### The pattern, restated

`rescore-2026-08-20.md`'s rule is that product assumptions cost points and
environmental ones give them back. Finding 1 was both at once. This one is a
third thing neither category covers: **the reference itself was measured
optimistically.** The error was the same shape the module was built to catch —
counting a capability from a listing rather than from a run — committed one
level up, against the tool being used as ground truth.

`data-reachability/`'s rule was "probe every channel a feed publishes, not just
its canonical host." The generalisation this adds: *a capability list is not a
capability*. Run the thing.

## What changed on 2026-08-22

- **The catalog** carries `enabled` and `experimental`; `load_reference()`
  exposes `default_run_rules` beside `rules`, and every reported row now says
  whether a default run reaches it.
- **Four of the eight are implemented** in `eaa-wcag-triage` — 2.2.1, 2.2.2,
  2.4.1 and 3.1.2, exactly the four a default axe run reports as violations.
  See that probe's README for the rules and their out-of-sample result.
- **`results-2026-08-21-after-disclosure.json` is now addressed by revision**
  (`7ce8473`) rather than by "worktree". It records the state disclosure left
  behind — eight rows declared, no rule for any of them — and that state is
  history. Leaving it pinned to the worktree would have meant overwriting the
  before-state this module exists to compare against, to keep its own test
  passing. `results-2026-08-22-after-rules.json` is the new worktree file.
- **`TestGapsAreReal` gained the other direction.** It still asserts the four
  remaining criteria are undetected; it now also asserts the four implemented
  ones *are* detected, so a row cannot move off `unimplemented` without a rule
  behind it.

## The score, and why it does not move

`eaa-remediation-pipeline`'s `liability_containment` stays at **5**, on the
gate, and this is a deliberate non-revision rather than an oversight.

The case for raising it: half the disclosed gap is now closed with tested
rules, the reference that docked the point turns out to have overstated it, and
the remaining rows carry measured reasons instead of an unsupported claim.

The case against, which wins: this pass also found a **new** overclaim in the
same artifact — 3.1.1 was labelled `automated`, the catalog's strongest word,
while the only rule behind it checked that `lang` *existed* and never that it
held a language. That is the third time the coverage statement has been wrong
when checked against something new (1.4.3 declared manual for five passes; the
eight rows; now this). A statement with that history does not earn a point back
on a pass that also had to fix it, and a session raising a score on the
strength of its own work is measuring itself.

What would earn it: out-of-sample **recall** for the new rules, on a corpus
that can exercise them. This one cannot, and the reason is Finding 6.

## Finding 6 (2026-08-22) — a build directory cannot settle structural criteria

The 2.4.1 rule's first out-of-sample run over the 118-page corpus produced
exactly one finding, on `ventures/quick-pick-survey`'s `/app` route, and
hand-checking it in a browser showed it was **wrong**.

The prerendered file has a `<nav>`, no `<main>`, no heading of any level and no
in-page link — a textbook failure. The delivered page has a `<main>` and a
heading: the content region of the prerender is the string `Loading…`, and the
rest arrives when the client renders. axe agrees the delivered page passes.
**The finding was true of the file and false of the page.**

The rule gained a third gate as a result — there must be content to bypass
*to*, not merely a navigation bar above an empty region — and with it the
corpus reproduces the committed 780 findings field for field, no page
differing.

This repository has now hit the same wall from both sides. `a11y-generated-sites`
found an `<iframe>` that no build-directory corpus could reach, because the
route it lives on appears in no build. This is the mirror image: a build
directory shows a *barrier* that the delivered page does not have. Contrast
(1.4.3) survives the prerender because colours are in the stylesheet either
way; **structural** criteria — is there a landmark, a heading, a skip link —
do not, because for a client-rendered app the structure is the part that has
not happened yet.

So the out-of-sample result for the four new rules is **zero findings across
118 pages**, and that number should be read as *this corpus cannot exercise
them* rather than *these pages are clean*. A rendered corpus is what would
settle it — not `a11y-axe-recall/`, which corroborated well, but still audits
the same 118-page **build** output through a different engine; a corpus that
renders the actual per-request component tree is
[`a11y-generated-sites/`](../a11y-generated-sites/README.md), and it exists
already.

**Amended 2026-08-22.** Settled by #614: extended with a control mutation per
new rule (see that directory's own dated finding), all four fire against
`local-site-studio`'s 14 real delivered pages once genuinely exercised — most
notably 2.4.1, whose gates (landmark, heading, in-page link, minimum content)
that pass proved evaluate real per-request markup correctly, not just a
fixture. Recorded as evidence in
[`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md);
`liability_containment` does not move, for the same one-corpus,
one-venture reason `a11y-axe-recall`'s own recall figure did not move it
either.
