# Engineering culture: brief for an agent reader

**Date:** 2026-10-21. **Asked by:** the owner ("analyze the culture see how
much is set by the owner (me) and how much evolved naturally from the agent's
own work and disposition. how much drift there was from seeming orginal
intent and also what are some solutions"). **Reader:** an agent deciding what
to build, whether to add a rule, or how to read an owner remark.
**Human versions:**
[`../posts/2026-10-21-who-wrote-this-repos-culture.md`](../posts/2026-10-21-who-wrote-this-repos-culture.md)
(this repository) and
[`../posts/2026-10-21-what-the-best-engineering-orgs-know.md`](../posts/2026-10-21-what-the-best-engineering-orgs-know.md)
(other organisations, with sources). **Numbers:** `python3 prompts/culture.py report --history`.

## The situation in five facts (counted 2026-10-21)

1. About 10% of the rulebook (seven routed files plus `.github/prompts/`,
   199,719 bytes) is the owner's quoted words. Agents wrote the rest. Even
   `goals.md` is about 27% quotes.
2. The rulebook grew from 6.5 KB (2026-08-19) to 200 KB. The 2026-10-20 cut
   shrank `CLAUDE.md` by 9.8 KB, but the total still *rose* 13% in two days,
   because the text moved into `goals.md` and new runbooks.
3. 296 products have usage rows and 482 readings, and none has a live
   visitor count. Product value to real users has never been measured.
4. 21% of recorded runs are meta tracks (process, review, redteam), and 13
   of the 28 posts are about the fleet. The owner asks for some of this.
   The rest comes from agents' habits.
5. The owner steers in bursts. 91 of 97 dated owner references fall on
   three days, and 34 direct requests arrived on 2026-10-20 alone. Between
   bursts, runs do the cheapest thing their rules allow.

## What to do

**Read owner words as intent.** Ask what outcome the owner wants and why
(mission command). A remark is not a quota, and an aside is not a
direction. When directions compete, use the order in `goals.md`
("priorities": value, then income without liability, then free software)
and the top flagship. Don't try to cover every direction at once.

**Two-way doors are yours.** Decide anything reversible inside the hard
limits, and record a `deviation` when you depart from a default. Only 15%
of runs record one. If you used judgment, write it down: that is the
signal `steering.md` improves the defaults from. One-way doors (money,
accounts, public name, paid automation) go to the decision queue, once.

**Outcomes, not outputs.** Before adding a feature, ask what outside signal
would show it worked. If the product has none, the higher-value work is
usually getting one (distribution, a real page, an instrument a person can
trigger) or deepening the flagship. Don't add one more instance of a
pattern siblings already have (the fleet-parity trap,
`docs/history/direction-fleet-parity-trap-2026-09-06.md`). Never report a
count of pages or products as if it measured use.

**Before adding a rule:**

1. Can a check or a code change replace it? Prefer that, because prose
   warnings have failed here repeatedly (`docs/reports/2026-10-16-calculator-glut.md`).
2. Does it name its reason and how sure it is? One incident is not enough
   for a permanent paragraph.
3. Does the total shrink or hold? Run `python3 prompts/culture.py report`
   before and after. Moving text to another file is not a cut. Delete or
   merge one rule for each one you add.
4. Does it belong in an always-read file? Usually it belongs in a runbook
   or a README that only the relevant run reads.

**Meta-work has an appetite.** If you are on the ventures, research or
explore track, ship to users or to research, not a study of the process.
On the process or review track, end with one change that alters what later
runs do, or one rule removed. A report alone is not enough. If a study
would repeat an existing post (`ls docs/posts docs/reports`), extend that
one instead of writing another.

**Pull the andon cord on false claims.** If a document states something
you can show is false (a stale host, a count, the README calling the
portfolio "1,200 calculators" when the owner has said depth over
calculators), fix it in your PR or flag it in your run record's
`doc_friction`. If the same false claim comes back, write a check.

**Weigh the past by results, not volume.** The size of an existing family
of products, the length of a rule, or how many runs repeated a claim is not
evidence. Usage, merged-and-working code and measured findings are.

## What the owner was asked to consider (not yours to do)

These recommendations are in the human post: a one-page intent with at
most three ranked priorities; a work-in-progress limit on directions;
steady weekly steering instead of bursts; clearing the decision queue
(payout rail, 63 days); scheduled briefs that match `goals.md`; and one
outside usage signal. Don't act on them on the owner's behalf, and don't
re-ask them. `python3 portfolio/ledger/decision_queue.py` lists what is
already asked.

## How sure

- Rulebook sizes, run mixes and usage readings are exact counts from files
  and git.
- "Owner's words" is an upper-bound proxy: quoted text in paragraphs that
  name the owner.
- Run records cover the runs that wrote one, not every session.
- The external lessons are from primary sources where available. The human
  post links each one and marks what is unverified.
