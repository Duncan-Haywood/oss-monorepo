# How many answers this actually takes

Every gate in [STATISTICAL-INTEGRITY.md](STATISTICAL-INTEGRITY.md) is a
statement about precision: below some rating deviation, a number is not worth
showing. That document says what the bar is. This one says what it costs to
clear it, because for most of this project's life the answer was "more
questions than anyone will ever answer", and nothing in the code said so.

## The arithmetic nobody had written down

An item needs roughly eight to twelve comparisons before its deviation falls
from the starting 350 to something a results screen can use. Each answer
supplies two item-appearances. So a survey of N items needs about **5N
answers** before *any* of it is usable — if the answers are spread evenly,
which is exactly what the coverage term in `selectNextPair` was doing.

| Survey | Items | Answers for an even spread to be usable |
| --- | --- | --- |
| relationship | 20 | ~100 |
| activities | 41 | ~200 |
| professions | 91 | ~450 |
| **combined** | **220** | **~1,100** |

The combined survey is the one a couple is pointed at. Nobody answers 1,100
questions. The result was not a partly-finished ranking — it was a *complete*
ranking of 220 items in which every single one sat just below its starting
deviation, uniformly worthless, and rendered with the same confidence as a
finished one.

## Measuring it instead of arguing about it

`src/lib/pairing.simulation.test.ts` drives the real `selectNextPair` and the
real Glicko-2 update against a synthetic respondent with fixed latent
preferences who answers probabilistically (Bradley-Terry — a respondent who
answered deterministically would make the system look better than it is).

The model is calibrated against reality, which is the only reason to trust it:
driving two real accounts through the 41-item activities survey against a local
Postgres reached a lowest rd of about **170** after roughly 90 answers, and the
simulation under the same conditions reaches **159**. It is measuring the thing
the app does.

## What progressive broadening bought

Only the first `activeSetSize` items are eligible for pairing; the set starts at
a core of 14 and grows as answers arrive. Medians over nine seeds:

| Survey | Answers | before, rd<200 | after | before, rd<150 | after |
| --- | --- | --- | --- | --- | --- |
| combined (220) | 60 | 0 | **14** | 0 | **1** |
| combined (220) | 90 | 0 | **22** | 0 | **4** |
| combined (220) | 150 | 1 | **33** | 0 | **13** |
| combined (220) | 300 | 26 | **57** | 0 | **34** |
| professions (91) | 90 | 4 | **23** | 0 | **4** |
| professions (91) | 300 | 81 | **58** | 13 | **35** |
| activities (41) | 90 | 21 | **23** | 0 | **5** |
| activities (41) | 300 | 41 | 41 | 40 | 40 |
| relationship (20) | 90 | 20 | 20 | 12 | 11 |

## What it cost, which is not nothing

Read the `professions (91) | 300` row. Items under rd 200 went **down**, 81 to
58. That is not noise and it is not a bug — it is the trade, stated plainly:

**Breadth of weak estimates is exchanged for depth of usable ones.** The same
row shows items under rd 150 going from 13 to 35. Since the couple comparison
needs `rd < 150` before it carries signal, and rd 200 is not good enough for
anything the app shows two people, this is the right direction. But a screen
that counts how many items have *any* estimate will report a smaller number
than it used to.

Surveys of 21 items or fewer are exempt entirely. Their whole set clears the
bar inside a session someone will sit through, so staging them would only
postpone items that were going to finish anyway — measured as a real, if small,
loss on the 16- and 20-item surveys.

## What this does not fix

The combined survey still reaches only ~34 items under rd 150 after 300
answers, out of 220. That is enough for the couple screen to say something
true, which it previously could not do at any budget. It is not a ranking of
220 items, and no amount of pair-selection cleverness makes it one — the
information is not there.

The remaining honest options are the ones
[IMPROVEMENT-PLAN.md](../IMPROVEMENT-PLAN.md) tracks:

- ~~**Pool evidence across the three perspectives.**~~ **Measured and closed.**
  It works — items under rd 150 go from 3–4 to 28–29 at a realistic budget —
  and it works by pulling PARTNER_GUESS onto SELF (correlation 0.97–0.99
  against a true 0.37), which is the egocentric bias the blind-spots screen
  exists to detect. See [POOLING.md](POOLING.md) and
  [decisions/0006](decisions/0006-no-pooling-across-perspectives.md). What is
  *not* closed is using other perspectives to choose which questions to ask,
  which cannot bias an estimate and has never been measured.
- **Shrink the combined survey.** 220 items is a superset of the other six. If
  the couple screen only ever needs the top of the ranking, it does not need
  the tail.
- **Make a smaller promise up front.** Tell people what 60 answers buys before
  they start, rather than showing a complete-looking ranking that is not one.

## Before changing pair selection

Run the simulation against the old behaviour and watch it fail. A
question-selection policy is exactly the kind of change that looks obviously
better and measures worse — the coverage term this document is about was itself
a reasonable idea, correctly implemented, that quietly made the product
impossible. The test is cheap; the intuition is not reliable here.
