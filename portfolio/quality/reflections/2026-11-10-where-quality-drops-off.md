# Where quality drops off, and what to change in the process

Reflection 1, 2026-11-10. The data is the 183 audit files in
[`../audits/`](../audits/) (158 subjects, 901 defects in the latest audit of
each subject), read with `python3 platform/ci/quality_audit.py metrics --md`.
The owner asked for it on 2026-11-10: "reflections on what parts of the process
seem to make the quality drop off and suggested fixes to the process."

**Limits.** Defect categories for these audits come from keyword rules. On
60 defects drawn at random and labelled by hand
([`../taxonomy-labels.json`](../taxonomy-labels.json)) the rules agree 45
times (75%), and 162 defects (18%) fall in `other`. Category counts below are
approximate. Gate and score counts are exact, but they are only as reliable as
the audits: two audits of one subject with no fix between give the same pass
or fail verdict in 19 of 22 pairs. Everything here is about subjects that were
audited. 2,264 of 2,423 subjects never have been.

## The headline

Of 147 uniformly sampled subjects, 25 meet the senior-professional bar
(Wilson 95% 12% to 24%). Almost all are *finished* (138 of 147 score 3 or more
on completeness). Below the bar, the code usually computes the right numbers:
correctness is 3 or more in 128 of 158 subjects. Quality is lost after that
point. Of the 130 subjects below the bar:

| gate | fails it | fails it alone | +1 on it alone clears the bar |
|---|---|---|---|
| claims | 89 (68%) | 35 | 35 |
| verification | 84 (65%) | 37 | 34 |
| correctness | 30 (23%) | 1 | 1 |

So **69 of the 130 subjects are one point below the bar on a single gate**,
either claims or verification. The binding gate differs by portfolio:
ventures fail on claims (46 of 64 sampled ventures), research fails on
verification (49 of 64) and on fitness (60 of 64 score below 3, mostly for
novelty and prior work).

## Five places quality drops

### 1. Tests are written to the author's belief (stage: tests)

In 103 of the 158 audits that report it (65%, 95% interval 57% to 72%), at
least one bug seeded by hand in core logic survived the subject's own tests.
`untested-core` is the largest named defect category (155 defects, 8 high).
The same pattern recurs: tests check structure but not the number
(`house-truss`: five mutations to the design-value code, all green), tests
exercise a copy of the logic and not the shipped file
(`garmin-world-traveler-watchface`, `platform/edge`'s fake DB), and tests pin
only the author's own fixtures (`ai-bookkeeper`, `sales-agent`).

**Why the process allows it.** The build session writes code and tests
together, and "tests pass" is its definition of done. Nothing before merge
asks whether the tests would fail if the code were wrong. The mutation tool
exists (`prompts/redteam.py`), but only the red-team track runs it, on
platform files.

**Fix.** (a) A pinned-number test is part of done: every headline output has a
test that checks one value against a source the author did not write (a
publication table, a standard's worked example, a hand calculation shown in
the test), and the README names that source. (b) Before merge, seed one
mutation in core logic and record whether it is caught, as a cheap version of
the `redteam.py` loop run on the subject's own core file. **Metric:** the share
of audits with a surviving mutation, 65% now.

### 2. Claims are written before the evidence and never re-checked (stage: claims, maintenance)

Claims is the most common failing gate (89 subjects). `overclaim` (116) and
`stale-docs` (30) together are the second-largest group of defects. The high
ones are claims a user acts on: "should never disagree with Lighthouse"
(false), "minimum possible breaks" (not for double round robins), a product
page that says the renderers are placeholders when they work (unchanged across
three audits), and "the system chess.com uses" (Glicko-2, not backed by any
file).

**Why.** README, page, FAQ and `llms.txt` are written in the same pass as the
code, before verification, by the session that wants the work to look done.
Counts and runtimes are written in by hand ("42 tests", "about a minute") and
go stale on the next change. No check links a sentence to the file that
backs it.

**Fix.** (a) A claims pass is part of done: each number or comparative claim
on the page and README points at the test, result file or source that backs
it, and anything without one is cut or labelled as an estimate. (b) No
hard-coded test counts or runtimes in READMEs; generate them or leave them
out. **Metric:** claims-gate failures among subjects below the bar, 68% now.

### 3. Audit findings rarely turn into fixes (stage: the audit loop)

Only 12 of 183 audit files list a fix PR, and 43 high-severity defects are
open in the latest audits. Of 134 defects found in an audit that was later
repeated, 50 (37%) appear again in the next audit of the same subject. One
example: `shift-roster-builder`'s overtime-threshold test gap is described as
"third audit in a row to find this; no test was added." Meanwhile 22 audit files
(12% of the total) re-audited a flagship within two days with no fix between,
and 138 of those 154 dimension scores came back identical. That effort
measured the same thing again and changed nothing.

**Why.** The track was set up to measure. Fixing was allowed ("fix what is
small and safe") but no mode, queue or share of runs was given to it, and the
flagship rotation drew a flagship every round, so ~11 flagships were each
audited about daily.

**Fix (shipped with this reflection).** A `fix` mode working from
`quality_audit.py queue` (open defects, worst first, with build-rewritten
false positives left out). A `mode` command that routes about a quarter of
quality sessions to fixing, and twice that while high-severity defects are open.
Flagships are not re-drawn within 7 days. **Metrics:** audits with a fix PR
(12 of 183), open high-severity defects (43), the reappearance rate (37%).

### 4. Nobody names the professional, the standard or the prior work before building (stage: spec, design)

Fitness and domain have the lowest means (2.22 each; 41 and 38 subjects at 3
or more). The high domain defects are rules a practitioner checks first: the
Section 179 heavy-SUV cap scaled by business use (IRS Pub 946 does not),
rent priced for a disregarded entity that cannot pay its owner (the Augusta
rule), RFC 8659 CNAME handling, Chrome permission semantics, an invented AWS
Cognito price ladder and a stale Clerk rate card. In research, the usual
defect is a known result presented as new: classical Gilbert-Elliott or
interleaving results, textbook P-K formulas, with no references.

**Why (an inference from the defects, not yet measured).** The audit names
"the professional whose bar this is" before checking. The build guidance
(`ventures/CLAUDE.md`, `PRODUCT_PLAYBOOK.md`) does not ask for that, or for a
cited standard. So a session can pick a niche and write the rules from memory.
`research/PROGRAMMES.md` does ask for related work, but at the paper stage.
Single-session briefs outside a programme seem to reach results first and
prior work later, if at all.

**Fix.** Before code, the subject's README gets a short "Spec sources"
section: the professional who would sign it off, the standard or publication
the rules come from, and three worked examples copied from that source. Those
examples become the pinned tests of fix 1. For research, the nearest prior work
is named before the first experiment. **Metric:** domain and fitness means,
2.22 now.

### 5. Breadth outruns verification (stage: portfolio)

The repository holds 2,423 subjects (1,337 ventures, 1,066 research projects,
20 platform directories) and 159 have ever been audited (6.6%). If the
sampled share holds, roughly four in five of the rest are below the bar. Each
new subject joins the unaudited stock. Input handling is the clearest sign of
copied templates: 133 `input-handling` defects (a blank field silently
becomes the example value, "1,200" splits on the comma, month-first dates
assumed), the same bug in calculator after calculator.

**Fix.** (a) Quality's share of runs goes from 5% to 20% (control-plane PR
with this reflection), and a `census` mode audits never-audited subjects
first. At the 4-day pace so far (about 40 subjects a day), a first full pass
takes about 57 more days. (b) One shared, tested input parser for the
calculator template (thousands separators, blanks, quoted CSV, date order)
instead of a copy per venture. **Metrics:** coverage (6.6%), `input-handling`
defects (133).

## The audit process itself

- **False positives.** 76 defects (8%) are `source-only`: they describe a host
  in `llms.txt` or a relative sitemap or canonical URL that the Pages build
  rewrites at deploy. The served files for `cake-pricing-calculator`,
  `handyman-minimum-job-calculator` and `1099-k-threshold-checker` were
  correct when loaded on 2026-11-10. The README now says to load the
  served page before filing one.
- **Detail.** No audit has structured checks. The evidence is prose (median
  6,400 characters), and a median of 3 of 7 dimensions quote a command. From
  2026-11-11 `validate` requires `checks` (at least 8, of which 3 are
  recomputed outputs), `mutations` (at least 2), and a `category`, `origin`
  and `where` on every defect. That turns "correctness 3" into "11 of 12
  recomputed outputs matched".
- **Reliability.** The bar verdict flips in 3 of 22 close re-audits. Many
  subjects sit at 2 versus 3 on claims or verification, so one point decides
  the headline. Later auditors can read earlier files, so even this agreement
  may be inflated by anchoring. Suggested: one blind re-audit a week (the
  auditor does not open the earlier file), to measure real agreement.

## What to check in the next reflection

| fix | metric | now |
|---|---|---|
| pinned-number test and a pre-merge mutation | audits with a surviving mutation | 65% |
| claims pass, no hard-coded counts | claims failures among those below the bar | 68% |
| fix mode, queue, flagship window | audits with a fix PR; open high defects; reappearance | 12 of 183; 43; 37% |
| spec sources before code | domain and fitness means | 2.22, 2.22 |
| 20% share, census | coverage of the repository | 6.6% |
| shared input parser | `input-handling` defects | 133 |
| served-page rule | `source-only` share | 8% |
| detailed schema | audits with structured checks | 0 |
