# The fix loop is open, and the bar moved with the instrument

Reflection 2, 2026-11-17. The data is the 382 audit files in
[`../audits/`](../audits/) (357 subjects, 2,496 defects across all files,
2,357 in the latest audit of each subject), read with
`python3 platform/ci/quality_audit.py metrics --md` and the short scripts
quoted below. The last reflection was
[2026-11-10](2026-11-10-where-quality-drops-off.md). `quality_audit.py mode`
forced this one, because none had been written for seven days.

**Limits.** No subject has been audited twice since 2026-11-10, so nothing
here measures whether a single subject got better. The before-and-after
comparisons are between different random draws from the same population,
taken with different instruments (see 1). The spot-checks in 3 and 4 are
small (8 high defects, 2 audit files) and are evidence for what kind of
error the blanket rule makes, not an estimate of how often. Counts are from
before this PR marked one `verifier-bribery` defect fixed. `metrics` now
reads 202 marked and 1,307 assumed.

## The headline

The sampled share meeting the senior-professional bar is now **33 of 306
subjects (Wilson 95% 8% to 15%)**, down from 25 of 147 (12% to 24%) a week
ago. That fall is mostly the measurement changing, not the work:

| sampled audit files | n | meet the bar |
|---|---|---|
| prose evidence (before 2026-11-11) | 151 | 26 (17%, 12% to 24%) |
| structured `checks` and `mutations` (from 2026-11-11) | 160 | 8 (5%, 3% to 10%) |

The structured schema made auditors recompute at least three outputs
against an outside source and seed at least two bugs. Under it, ventures
passing the correctness gate fell from 49 of 66 (74%) to 39 of 99 (39%), and
research projects passing verification from 15 of 66 to 6 of 97. The
populations are the same: both halves are uniform draws from never-audited
subjects. The likelier reading is that the prose-era scores were too
generous on exactly the dimensions the schema now forces a command for, and
**the structured 5% is the better estimate of where the repository is.**
`metrics --md` now prints this split ("Sampled share by instrument"), so
the weekly trend is not read as a collapse.

## Four findings

### 1. The headline mutation metric saturated (stage: the audit instrument)

Reflection 1's verification metric was "audits in which at least one seeded
bug survived": 65% then, 83% now. With structured mutations the auditors
seed 5.9 mutants an audit, and 193 of 196 structured audits have a
survivor. A metric at 98% cannot move, whatever the build process does.
The per-mutant kill rate can: **548 of 1,162 seeded bugs failed a test
(47%, 95% 44% to 50%)**; ventures 342 of 647 (53%), research 206 of 515
(40%). It also matches the scores. Mean kill rate is 0.22 in audits scoring
verification 1, 0.47 at 2 and 0.80 at 3, so the verification scores rest on
something countable.

**Shipped:** `metrics` prints the kill rate next to the old share
(`mutation_kill` in `platform/ci/quality_metrics.py`, with a test showing
two audits the old metric cannot tell apart).

### 2. Nothing re-audits a fix (stage: the audit loop)

Reflection 1's fix mode worked as a producer: audits listing a fix PR went
from 12 of 183 to 250 of 382, through 107 distinct PRs, and the queue shows
0 open high-severity defects. But the README's next step, "a later round
re-audits", never ran. **No subject has been audited twice since
2026-11-10.** Sample and census skip anything audited in the last 90 days,
the fix mode says "not this one", and no mode was given the job. Only 2
subjects have ever been re-audited after a recorded fix (both on 11-09).
So the reappearance rate (36%) and the re-audit agreement figures are frozen
at last week's 14 subjects, and no fix has been independently confirmed.

**Shipped:** a `reaudit` command and mode. `quality_audit.py reaudit` lists
the 248 subjects whose latest audit records a fix that no later audit has
checked, fixed highs first, shuffled by a seed so parallel sessions spread
out, with subjects an open PR names last. The mode takes 10% of quality
sessions from census (30% to 20%) and drops out of the draw when nothing
waits. A re-audit checks every earlier defect against the code as it is now
and writes a new file with `"drawn_by": "reaudit"`. **Metric:** subjects
re-audited after a fix, 2 now, out of 250.

### 3. Most "fixed" defects are assumed fixed (stage: the audit loop)

In the latest audits, 201 defects are marked fixed one by one (`fixed_by`),
**1,313 count as fixed only because their audit lists some fix PR and marks
no defect**, and 843 are open. That is `defect_fixed`'s older reading,
kept for files written before `fixed_by` existed. It covers 144 high
defects.

I checked how wrong it is in both directions. First, against the code on
`main` today: eight high defects drawn at random from blanket-fixed audits
(seed 20261117), plus the first two in file order:

| subject | the high defect | today |
|---|---|---|
| `vending-machine-planogram-optimizer` | blank "Max coils" became 8 | fixed: blank now means the machine's coil count (`calc.mjs:93`) |
| `workflow-audit` | two checker types mis-mapped or dropped | fixed: both mapped (`audit.py:43`, `:48`) |
| `hands-free-language-coach` | "Yo entiendo" passed for "No entiendo" | fixed: `NEGATIONS` check (`drill.mjs:142`) |
| `allergen-label-maker` | oatmeal, lactalbumin, filbert missed | fixed: all three listed (`calc.mjs:52`, `:68`, `:83`) |
| `ics-calendar-check` | cross-zone DTSTART/DTEND compared as wall clock | fixed: TZID to UTC (`calc.mjs:86`) |
| `tournament-pairing-manager` | FAQ promised no WWW/BBB over six rounds | fixed: FAQ now says penalty, not guarantee; a page test forbids the old claim |
| `quick-pick-survey` | Glicko-2 not pinned by tests | fixed: pinned to published values (`glicko2.test.ts:45`) |
| `veterinary-wellness-plan-pricing-calculator` | discount input never moves the fee | addressed by disclosure: the page now warns when the fee implies a different discount |
| `asphalt-driveway-pave-bid-calculator` | labour priced at one worker's wage | addressed by relabelling: inputs and output now say crew-hours |

So in the random draw the blanket rule was right about highs: the fix
sessions take the worst defect first. A targeted check finds where it fails.
Often the PR in `fix_prs` is the round's own audit PR, and for that subject it
only wrote the defects into the README under "Known gaps". **In 56 of the 186
blanket-fixed latest audits, the subject's README links the audit file under
"Known gaps" or "not yet fixed": 421 defects, 49 of them high, all counted as
fixed.** Two I read are plainly open. `gig-driver-net-pay-calculator`'s
"kept per hour, after the car" still has no depreciation term (README line
154 says so). `research/verifier-bribery`'s collusion-proof stake was still
wrong: its README said "not yet fixed", and PR 15464, the only fix PR on
file, was the round-63 audit PR. I fixed that one in this PR (below). The
README heuristic will also catch subjects whose Known gaps list only the
*remaining* defects (`caa-record-check`'s RFC 8659 high looks fixed), so 49
is an upper bound for this failure, not a count.

The blanket rule also fails below high. In the
veterinary audit, all seven defects count as fixed. At least three are open
in the code today: one utilisation rate still applies to every service
(medium, `calc.mjs:55`), the a la carte margin still leaves out card fees
(low, `:65`), and "1,200" still rejects the line (low). The 843 "open" is a
floor, and the queue cannot see the mediums and lows hidden behind a fix to
one high.

**Shipped:** `metrics` prints the marked/assumed/open split, so "0 high
open" is read with its basis, and `reaudit` flags each subject whose README
still lists the audit as open and puts those holding a high first (74 of the
248). The `verifier-bribery` high is fixed: `collusion_threshold_stake` now
returns the larger of the bribe threshold and the stake at which checking
pays at all, the paper's Result 1 says where 1/m stops, and a test pins the
audit's counterexample (m=4: stakes 0.6 and 0.9 leave the solver the whole
saving, by the closed form and the brute force). Seeding the old line back
fails that test (`quality_mutate.py`, `caught: true`). The defect carries
`fixed_by`, so the subject's five other defects are back in the queue, which
matches its README. The re-audit mode is the way to resolve the
1,313. Flipping the default would put about 1,300 defects back in the
queue, and the sample above says many of them really were fixed. **Metric:**
defects assumed fixed, 1,313 now; it should fall as re-audits mark each one
fixed or open.

### 4. Reflection 1's build-side fixes never shipped (stage: the process loop)

Reflection 1 proposed eight fixes. The five that change the audit tooling
shipped: fix mode, census, the flagship window, the structured schema and
the served-page rule. Every fix aimed at how work is *built* stayed in the
reflection:

| reflection 1 fix | where it should live | shipped? |
|---|---|---|
| pinned-number test from an outside source | definition of done | no (`grep -rn "Spec sources"` finds only reflection 1) |
| seed one mutation before merge | definition of done | no |
| claims pass, no hard-coded counts | definition of done | no |
| "Spec sources" before code | build guidance | no |
| shared, tested input parser | calculator template | no shared parser found under `platform/` |
| 20% share for quality | `routing.json` | partly (5% today; the owner-held PR #14434 is still open) |

So the metrics those fixes were meant to move could not move, and did not.
Domain mean is 2.11 (2.22 then), fitness 2.05 (2.22), claims failures among
subjects below the bar 71% (68%). The quality track measures, and its fix
mode repairs individual subjects, but nothing carries a finding into the
instructions the *next* venture is built from. Every new venture starts
from the same guidance that produced the last 160 audits.

The binding constraint is ownership. Most build guidance (`CLAUDE.md`
files, `prompts/`) is under `.github/CODEOWNERS`, and a quality session's
reflection does not open the control-plane PR it would need.

**Shipped:** the two pre-merge checks go into
[`PRODUCT_PLAYBOOK.md`](../../../PRODUCT_PLAYBOOK.md) §7, "Definition of done",
which is not owner-held. One is a "Spec sources" line plus one test pinned
to a worked example from that source. The other is one seeded bug through
`quality_mutate.py` before merge, with the test that kills it if it
survives. Each line carries its number: `domain-rule` is the defect venture
auditors name most (126 since 2026-11-11), 209 of 657 recomputed venture
outputs failed, and 342 of 647 venture mutants were killed. **Still to do
(owner-held):** the research equivalent in `research/CLAUDE.md`. Research
verification passes in 6 of 97 structured audits, so research is where the
pre-merge mutation would matter most. It belongs in a small control-plane
PR of its own, not this one.

## What changed since reflection 1

| fix | metric | 2026-11-10 | 2026-11-17 |
|---|---|---|---|
| pinned test, pre-merge mutation | audits with a surviving mutation | 65% | 83% (saturated; use the next row) |
| (new) | seeded bugs killed per mutant | n/a | 47% (548 of 1,162) |
| claims pass | claims failures among those below the bar | 68% | 71% (not shipped) |
| fix mode, queue | audits with a fix PR | 12 of 183 | 250 of 382 |
| fix mode, queue | open high defects | 43 | 0 (144 assumed fixed: 8 of 8 drawn at random were addressed, but up to 49 are listed open in their own README) |
| fix mode, queue | reappearance in the next audit | 37% | 36% (no new re-audits) |
| spec sources | domain and fitness means | 2.22, 2.22 | 2.11, 2.05 (not shipped; new instrument) |
| census | repository coverage | 6.6% | 14.3% (355 of 2,484) |
| shared input parser | `input-handling` defects per audited subject | 0.84 | 0.77 (not shipped) |
| served-page rule | `source-only` share | 8% | 3.7% |
| detailed schema | audits with structured checks | 0 | 196 |

The audit-side fixes moved their metrics: coverage doubled, false positives
halved, the schema is in use. The build-side metrics stayed flat or fell, and
the fixes aimed at them never shipped.

## What to check in reflection 3

| fix | metric | now |
|---|---|---|
| reaudit mode | subjects re-audited after a recorded fix | 2 of 250 |
| reaudit mode | defects assumed fixed (no `fixed_by`) | 1,313 |
| reaudit mode | subjects awaiting re-audit whose README lists the audit as open | 74 of 248 |
| reaudit mode | of re-checked "fixed" defects, the share still open | not yet measured |
| kill-rate metric | seeded bugs killed, structured audits | 47% |
| definition-of-done lines | venture mutants killed, audits of ventures built after 2026-11-17 | 53% (all ventures so far) |
| definition-of-done lines | venture `domain-rule` defects per audit | 1.27 (126 in 99) |
| instrument split | sampled share, structured audits only | 5% (8 of 160) |
| research DoD (owner PR) | research verification pass, structured audits | 6 of 97 |
