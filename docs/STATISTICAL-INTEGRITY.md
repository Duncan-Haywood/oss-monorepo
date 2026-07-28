# The bar for showing a couple a number

Everything this app puts on screen is an estimate from a few dozen taps. The
failure mode is never a crash — it is a number that looks like a finding, reads
as authoritative, and is actually measuring something else. Nobody goes back to
check, because there is nothing to check against.

Three of those have now shipped and been found later, all in the same file:

| What was shown | What it was actually measuring |
| --- | --- |
| "This matters much more to them" | Which partner had swiped more |
| "100% match" | That only three items overlapped |
| "You see these very differently" | The width of the model's own error bars |

They were not careless. Each is a reasonable-looking line of arithmetic over
numbers that do not support it. So this document is about the checks that catch
that shape of mistake, since reading the code again will not.

---

## 1. Never subtract two people's raw ratings

Glicko ratings are stored per respondent. Their spread tracks how much someone
answered, not how much they care — after 200 answers a ranking might span
1200–1900, after 30 it barely leaves 1450–1550.

Anything crossing between two people goes through a within-person position
first (`strengthScores`, or the standardization inside `compareRankings`). A
position of 90 means "near the top of everything *they* rated" for both of them,
whatever the raw numbers were.

## 2. Carry the error bars into the statistic

A rating is an estimate and `rd` is its standard deviation. Any figure computed
from ratings inherits that uncertainty whether or not the code mentions it.

The specific trap is **attenuation**: a correlation computed from noisy
estimates is shrunk toward zero, by a factor equal to the reliability of the
measurements. It does not become noisy-but-centred. It becomes *systematically
too close to zero*, which looks like a moderate, plausible result.

Simulating two people with **identical** preferences, at the deviations this app
actually reaches:

| rd | reported agreement | truth |
| --- | --- | --- |
| 300 | 0.14 | 1.00 |
| 200 | 0.26 | 1.00 |
| 100 | 0.60 | 1.00 |
| 40 | 0.91 | 1.00 |

and symmetrically negative for two people who disagree completely. At the app's
real operating point a couple who want exactly the same things and a couple who
want opposite things were both shown roughly "50% match".

`reliabilityOf()` computes the factor — `1 - mean(rd²)/var(observed)` — and
`compareRankings` withholds the headline figure below 0.5, where more than half
of what would be reported is noise. Above it the figure still *understates* a
real similarity, which is the safe direction to be wrong in.

## 3. Raise the bar for the number of chances to be fooled

A per-row two-sigma test sounds strict. Applied independently to forty items it
is forty chances to be fooled, and it produced two or three phantom rows on
*every* screen for a couple with identical preferences.

`significanceThreshold(n)` is Bonferroni-corrected, so the family-wise error
rate is 5% **per screen** — which is what a person actually experiences — rather
than per row. At forty items that asks for about 3.2 standard errors instead of
2. Measured over 1000 simulated couples with identical preferences:

| | before | after |
| --- | --- | --- |
| Screens showing ≥1 phantom difference | 100% | 4% |
| Phantom rows per screen | 5.0 | 0.04 |

and for two people who genuinely disagree, at rd = 100, 97% of screens still
surface the real difference. The gate is not blanket silence; it moves the
threshold from "we have some answers" to "the answers can carry this".

## 4. Never sort by the quantity you are unsure about

`diverged` used to sort by the largest rank gap and take the top five. The
largest gaps are where the error bars are widest, so the list selected for the
least-measured items by construction — a winner's curse.

Rank by how far a difference exceeds *its own* uncertainty, not by its size.
The same applies to "you agree most on": without also requiring the estimate to
be precise, the strongest agreement is always the least-answered item.

## 5. Say what is being withheld

Withholding is right and hiding is not. See `absence-is-a-claim` in
`src/lib/developmentProcess.ts` — a section that renders nothing still says
something, and what it says is "there is nothing here", which is false.

Every gate above has a matching piece of copy naming what it is waiting for.
`CoupleView` renders an empty comparison list as a sentence, not as nothing.

---

## What this costs, and the open question

These gates are correct and they make the couple screen emptier than it was,
because the data genuinely does not support what was being shown. The
comparisons need roughly `rd < 100–150` to say anything; two accounts driven to
~90 answers reached a *lowest* rd of 170, with most items far above it.

**So the real work is not the threshold, it is convergence.** Getting the
measurement to that precision faster — better pair selection, fewer items,
pooling across the three perspectives, or a smaller promise up front — is the
open product question, and it is tracked as P1 in `IMPROVEMENT-PLAN.md`.
Loosening these gates instead would restore the old screen, which was full and
wrong.

## How to check a new statistic

Before a number reaches a couple, simulate it:

1. **Two people who are identical.** Whatever it reports is the floor of what it
   invents. It should report agreement, and no differences.
2. **Two people who are opposite.** It should report that, at the deviations the
   app actually reaches — not only at deviations it never sees.
3. **Sweep `rd` from 350 down to 20.** The reported value should move
   monotonically toward the truth. If it does not, the statistic is measuring
   something other than the thing it is named after.

`couples.test.ts` does all three with a seeded generator, so they are
deterministic. Fixtures written by hand default to `rd: 80`, which is finer than
this app has ever achieved for most items — a test suite built only from those
will pass while production shows noise.
