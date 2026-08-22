# Audit the thing we actually sell: `local-site-studio`'s generated customer sites

Built 2026-08-21, extended 2026-08-22. Re-runnable, offline, no credentials:

```bash
cd portfolio/research/a11y-generated-sites
python3 -m unittest discover                                          # 19 tests
python3 audit_generated_sites.py                                      # offline, uses the committed corpus
python3 audit_generated_sites.py --recompute-from results-2026-08-22.json
# to regenerate the corpus itself:
cd ../../../ventures/local-site-studio && npm ci && cd - && node render_corpus.mjs
# `npm run build` first (in the venture) if you also want contrast checked —
# without it every element is `undecidable`, not clean; see Finding 1.
```

## Why this was built

[`a11y-own-sites/`](../a11y-own-sites/) ran both of this portfolio's WCAG
engines over 118 built pages and closed by naming the one corpus it could not
reach:

> **`local-site-studio`'s delivered product is not in this corpus.** Its own
> marketing and docs pages are, and they are clean. The customer sites it
> generates are rendered per slug from customer data and never appear in a
> build. That is the corpus worth auditing next, and it is the one that carries
> the actual liability — every defect in a generated theme ships to every
> customer who buys one.

That gap is structural, not an oversight. Every accessibility corpus this
portfolio has measured came from a build directory, and a customer's live site
is the `/preview/[slug]` route rendered per request and served on their own
domain (`src/lib/deploy/custom-domain-routing.ts`). `next build` emits no HTML
for it. A scanner that walks `.next/server/` audits this venture's *marketing*
and is structurally blind to its *product*.

[`render_corpus.mjs`](render_corpus.mjs) closes that by rendering the real
component tree — `RootLayout` wrapping the preview page body — through Vite's
SSR loader, with fixtures covering every branch that changes the delivered
markup: four category themes, prospect and paid-customer shapes, the commerce
add-on mounted and not, absent optional fields, and each upsell tier. 16 pages,
14 unique.

## Finding 1 — the delivered pages are clean, and that is a measurement, not an absence

> **Amended 2026-08-21.** This finding is correct and its basis was incomplete
> in one criterion. Both engines were called here with **no stylesheet**, on a
> corpus that links none, so colour contrast (1.4.3) could not fire on any
> element of any page — the engines' own contrast tally read *1018 of 1018
> elements undecidable*, in a field this script did not read. The mutation
> control below could not catch it either: all 14 mutations edit markup, and
> contrast needs CSS, so there is no 1.4.3 row. Fixed in this directory (the
> adapters now pass the built stylesheet and the report prints the contrast
> tally beside the findings), and measured separately in
> [`a11y-delivered-contrast/`](../a11y-delivered-contrast/): given the
> stylesheet the delivered pages are actually served with, they carry **0
> contrast failures** — so the sentence below stands, and now rests on a check
> that ran. That pass also found and fixed the reason the engines had claimed
> 100% decidability on backgrounds they were not reading: the shared CSS
> reader split selector lists on escaped commas, silently dropping every
> Tailwind arbitrary-value rule, which is where these pages' gradients live.

**0 findings across 14 unique delivered pages, from both engines, which agree on
all 14.**

A zero has two explanations and they are opposite: the pages are clean, or the
scan is blind to them. Every prior corpus here had defects, so the question
never arose. This is the first where it decides what may be claimed — and a
qualification audit that returns "no findings" because its parser dropped the
markup is worse than no audit, because it is handed to a customer as evidence.

So every automated or partial criterion in the probe's `COVERAGE` catalog gets a
**mutation**: a specific edit that should make it fire. Two kinds, and the
difference is the point.

- **Removal** mutations delete something the corpus actually contains. When one
  fires it proves the engine parsed *this page's own markup* and reached the
  element. These are what make the clean result mean anything.
- **Injection** mutations add markup the corpus does not contain. When one fires
  it proves only that the rule works. Reported separately, never counted as
  coverage of the delivered pages.

| | mutations | exercised by this corpus | caught |
|---|---:|---:|---:|
| Removal | 8 | **7** | **7 / 7** |
| Injection | 3 | 3 | 3 / 3 |

The four unexercised removals are reported as **not exercised**, not as passing:
the delivered pages contain no `<img>`, no `aria-label` on a control, and no
`<label for=...>`, so 1.1.1 is untested here rather than satisfied here. The
form labels its controls by *wrapping* them, which is valid and which the first
draft of this control missed entirely — the mutation aimed at `for=` was a no-op
and would have been reported as coverage if the no-op case were not called out.

## Finding 2 — the corpus found a detection gap in each engine, where 118 built pages found none

`a11y-own-sites` was explicit that in 118 pages, **"not one page has a defect
that only one engine detects"** — every divergence was a relabelling. Fourteen
delivered pages produced two genuine detection gaps, one in each engine. Both
are fixed in this pass.

**The probe missed every untitled `<iframe>`.**
[`eaa-wcag-triage`](../../pipeline/probes/eaa-wcag-triage/) had no iframe rule at
all, while `audit.py` has flagged `iframe-no-title` as blocking 4.1.2 since it
was written. A frame with no name is announced only as "frame": a screen-reader
user cannot tell what it holds without entering it.

Why it survived four measurement passes is worth stating, because it is the
whole argument for this corpus. **The only `<iframe>` anywhere in this
repository is `local-site-studio`'s map embed** — a source-wide search finds one
occurrence, in `src/components/preview/maps-embed.tsx`. It is on every page the
product delivers, and on no page any build emits. The one element the probe
could not see lived on the one route no build-directory corpus could reach.
Fixed here: `rule_iframe_names`, 7 tests, fixture validation byte-identical at
precision/recall 1.0.

**`audit.py` accepted a control wrapped in a text-less `<label>`.** Any `<label>`
ancestor counted as a name, so `<label><input></label>` read as labelled and it
reported nothing, while the probe flagged 1.3.1. Fixed here: a wrapping label
now names its control only if the label itself has a name, with an expression-
bearing label still treated as undecidable rather than as a finding — this
engine's standing rule. 5 tests; its suite goes 75 → 80 passing.

Neither engine's gap was reachable from the other's fixtures. Both were reachable
from one afternoon of the product's own output.

## Finding 3 — both known relabellings now have a named cause

`a11y-own-sites` measured the two engines disagreeing on 24.6% of real pages
(revised to 22.9%, 27/118, after that directory's own stylesheet-argument fix
— the disagreement count itself is unaffected by contrast, only by unrelated
venture-source drift; see its README),
found every disagreement to be a relabelling rather than a miss, and left the
cause open as "a normative reading this environment cannot settle." It could
name the criterion pairs but not the defect behind them, because the defects
were whatever those pages happened to contain.

Here the defects are injected, so each pair is exact:

| Injected defect | probe cites | `audit.py` cites |
|---|---|---|
| A skipped heading level | 2.4.6 Headings and Labels | 1.3.1 Info and Relationships |
| A form control with no accessible name | 1.3.1 Info and Relationships | 3.3.2 Labels or Instructions |

Those two account for all three rows of that directory's divergence table — the
third row is a page carrying both defects. What was "24.6% of pages disagree,
cause unknown" is now two specific defects with two specific attribution
disagreements, which is the form the question has to be in before anyone can
settle it. `test_audit_generated_sites.py` pins the pair set, so a third
divergence fails the suite rather than appearing quietly in a customer's record.

This does **not** settle them. Both remain normative readings, the spec hosts
remain egress-denied (see [`a11y-engine-agreement/`](../a11y-engine-agreement/)),
and the deliverable is still a criterion-referenced record whose numbers depend
on which engine ran.

## Finding 4 — the probe's four newest rules pass their first genuine out-of-sample test

Added 2026-08-22.
[`eaa-wcag-triage`](../../pipeline/probes/eaa-wcag-triage/) built four rules
that day for criteria it had disclosed but never checked (2.2.1 Timing
Adjustable, 2.2.2 Pause/Stop/Hide, 2.4.1 Bypass Blocks, 3.1.2 Language of
Parts), then ran them over `a11y-own-sites`'s 118 build-directory pages and
found the corpus **could not exercise them at all**: a page's structure — the
`<nav>`/`<main>`/heading shape 2.4.1 needs — is not settled until the client
finishes rendering, and a build directory is pre-hydration output. That
README named the fix: *"a rendered corpus is what would settle it."* This one
already existed, was built for a different question, and is exactly that —
`render_corpus.mjs` renders the real component tree via Vite's SSR loader,
past the point a prerender would stop.

Four mutations were added to this directory's positive control, one per new
rule, matching the removal/injection split Finding 1 established:

| Criterion | Kind | Mutation | Result |
|---|---|---|---|
| 2.2.1 | injection | add `<meta http-equiv="refresh" content="5">` | caught 14/14 |
| 2.2.2 | injection | add `<marquee>` | caught 14/14 |
| 3.1.2 | injection | add `<span lang="engl">` (well-formed, not a language) | caught 14/14 |
| 2.4.1 | **removal** | strip the `<main>` landmark, every heading, and the in-page `#contact` link | caught 14/14 |

2.4.1 is the one that answers the actual question. This corpus's real
delivered pages already carry a `<nav>`, a `<main>`, headings, and a
`#contact` in-page link — the delivered pages pass the criterion honestly, not
by having nothing to bypass. Stripping all three suppressing mechanisms at
once (any one of them is sufficient on its own, per `rule_bypass_blocks`) puts
back exactly the defect the criterion names, on markup a real customer's page
actually renders to, and the rule fires on every page. That is a positive
control a build-directory corpus cannot offer this rule at all — the earlier
run's one finding was a false positive precisely because the artifact it
scanned had not finished becoming a page.

The other three fire only under injection here too, same as most of Finding
1's original mutation table, because this corpus's pages carry none of those
defects to remove. All four criteria's **delivered-page result is 0
findings**, and now it rests on a working positive control rather than an
unexercised one.

`audit.py` finds none of the four defects — not a fresh detection gap, its own
`COVERAGE` table already declares all four `unimplemented`, the same
disclosed asymmetry the probe's README describes. Pinned in
`test_the_four_new_rules_are_undetected_by_audit_py_on_purpose` so a rule
later added to `audit.py` for one of these shows up as a numbers change here,
not a surprise.

## Finding 5 — the fifth new rule found no real defect to remove, which is itself the finding

Added 2026-08-22, later the same day as Finding 4.
[`eaa-wcag-triage`](../../pipeline/probes/eaa-wcag-triage/) closed the last of
the eight criteria `a11y-external-coverage-reference` disclosed —
**1.4.1 Use of Color** — with `rule_use_of_color`, which flags a link inside
body text whose `text-decoration` is explicitly `none` and whose colour
decidably differs from the text around it.

Every mutation in Finding 4's table could be a removal, because this corpus
already carries the markup each criterion needs (a navigation block, a
heading, an in-page link). This one could not be. The delivered pages have
exactly one real body-text link with an underline —
`/docs/product-bundles`, in "See *project documentation* for implementation
plans." on the generic demo — and checking it directly (`decoration_line` and
`foreground_color` against the built stylesheet) shows why a removal mutation
here would be a no-op: the link carries no colour class of its own at all, so
stripping its `underline` class leaves it exactly the same colour as its
surrounding text, because it always was. There is no real colour-only link in
this corpus for a removal mutation to reach.

That is worth recording on its own, separate from what the control could
prove: the one place this corpus uses an underline, it is not standing in for
a colour distinction that would survive its removal. A finding a stripped
mutation cannot produce is not evidence the criterion is safe here — it is
evidence this corpus's one candidate does not happen to combine both defects
at once, which is a narrower and more honest claim.

| Criterion | Kind | Mutation | Result |
|---|---|---|---|
| 1.4.1 | **injection** | add a `<p>` with a link styled colour-only (`color:#06c;text-decoration:none`) against differently-coloured surrounding text | caught 14/14 |

Injection only proves the rule works, not that these delivered pages carry the
defect — same caveat Finding 1 gives every injected row. `audit.py` finds
nothing here either, the same disclosed asymmetry as the four criteria in
Finding 4, not a fresh gap: it declares no rule for 1.4.1 in its own
`COVERAGE` table. Pinned in
`test_use_of_color_fires_on_the_real_corpus_via_injection`.

The delivered-page result for 1.4.1 is **0 findings**, on a corpus verified
capable of exercising the criterion under injection, with the removal path's
absence itself recorded rather than silently skipped.

## What could not be measured here

- **Pre-hydration output only.** `renderToStaticMarkup` is what the server
  sends. A name attached by client JavaScript reads as missing; one removed on
  the client reads as present. Shared with every static engine in this
  portfolio. Visible in the corpus: the contact form's submit button renders
  `disabled`, which is initial state, not delivered state.
- **No render, no interaction, no assistive technology.** Every criterion the
  engines mark `manual` — keyboard operability, focus order and visibility,
  target size, error identification — is untouched. On the candidate's own
  economics that is the contractor step, and nothing here shrinks it.
  **Amended 2026-08-21:** contrast was in that list when this was written and
  no longer belongs in it. It is decided from the artifact once the engine is
  given the stylesheet, which this pass did not do — see the amendment to
  Finding 1 and [`a11y-delivered-contrast/`](../a11y-delivered-contrast/).
- **The embedded map is third-party.** The frame now has to carry a name, and
  it does. What Google serves *inside* it is not audited and cannot be.
- **Fixture leads, not customer records.** The fixtures cover every rendering
  branch, not every string a real intake will produce. A business name or
  service list from a live record could still be the thing that breaks a
  heading outline.
- **The saved measurements in the sibling directories predate today's engine
  changes.** Both changes can only *add* findings, and only on markup neither
  had: an untitled frame, or a control inside a text-less wrapping label. A
  source survey found the repository's only frame (above) and checked all 82
  wrapping `<label>` occurrences under `ventures/`, every one of which carries
  text — so those numbers are expected to stand. They have not been re-run.

## Effect on the pipeline

**No score moved and no verdict changed**, and no `local-site-studio` source
change was needed: the product is clean under everything both engines can
statically see.

> **Amended 2026-08-21.** Still true, and it was overstated when written: at
> the time the engines were reading no stylesheet, so "everything both engines
> can statically see" excluded colour contrast without saying so. Checked
> properly it is clean there too — 0 failures over 1018 text elements — so the
> verdict is unchanged and is now earned. See
> [`a11y-delivered-contrast/`](../a11y-delivered-contrast/).

Against
[`eaa-remediation-pipeline`](../../pipeline/candidates/eaa-remediation-pipeline.md)
(composite 7.25, verdict *build it as a `local-site-studio` product line*) and
through it
[`shopify-a11y-evidence`](../../pipeline/candidates/shopify-a11y-evidence.md),
which sells the same audit through another channel, two things are recorded:

1. **The engine's out-of-sample failure mode is a silent miss, not a false
   positive.** `a11y-own-sites` measured precision — 11.9% of findings were
   un-actionable — and prescribed a build-artifact filter. That is a real
   problem and it is the *visible* one. This corpus measures the other
   direction, and both gaps it found were misses: markup a customer has that
   the engine says nothing about. A record that omits a defect states its
   coverage inaccurately in the direction that flatters the seller, and unlike a
   false positive nobody reading the record can tell.
2. **A qualification audit needs a positive control per engagement, not per
   engine.** The control here is cheap — mutate the customer's own page, check
   the rule fires — and it is the only thing that distinguishes "your site is
   clean" from "our scanner could not read your site." Both gaps above would
   have produced a clean report on a page that was not clean.

The candidate's own liability rule — *state coverage limits in the product, not
in the terms* — is why both belong here rather than in a backlog.
