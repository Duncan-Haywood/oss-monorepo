# wildlife-exclusion-bid-calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/wildlife-exclusion-bid-calculator/>

A browser calculator for independent nuisance wildlife control operators
(NWCOs). It prices a bat, raccoon, squirrel, bird or ground-animal exclusion
job the way the flat "removal fee" this trade is shopped against never does —
from the visits it actually takes, the height the seal is at, the attic that
has to be cleaned, and the warranty that was sold with it.

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the calculator
- [`what-to-charge-for-wildlife-exclusion.html`](what-to-charge-for-wildlife-exclusion.html)
  — the question people search, worked through
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter

```
node --test          # calc, pages and usage assertions
```

Open `index.html` in a browser to use it — there is no build step.

## Why this is not the pest-control calculator

[`pest-control-bid-calculator`](../pest-control-bid-calculator/) prices a
**recurring route account**: a stop, a drive, a frequency, repeated forever.
This prices a **project** that happens once and then carries a warranty. They
share almost no arithmetic, and pricing a wildlife job with a route tool is how
it ends up quoted at a pest-control stop price.

## The mistake it exists to catch

The customer has a "$395 raccoon removal" ad open. That ad prices **one visit**.
On the worked example the page opens with — a raccoon in a two-story attic,
three traps out for five days, 45 feet of seal, 250 sq ft of decontamination
and insulation replacement, three years of warranty — the job is **eight**:

| Visit | How many | Who goes |
|---|---|---|
| Inspection | 1 | 2 |
| Install: set traps, seal, hang the one-way door | 1 | 2 |
| Trap check, one per day the traps are out | 5 | 1 |
| Pull the device, close the last hole | 1 | 2 |
| **Total round trips** | **8** | |

That is 224 miles and **$306.53 of paid drive time** before anyone touches the
roof — more than the entire on-site trapping labor ($124.77). The walk-away
price is **$2,896.07** and the bid at a 22% net margin is **$3,712.91**, so the
ad is $2,501.07 short of what the job costs to do.

| Cost the flat removal fee misses | Amount |
|---|---|
| Driving, all eight visits | $306.53 |
| Seal and device labor (45 ft at a two-story eave) | $264.86 |
| Attic decontamination, labor and material | $280.00 |
| Insulation out and back in, 250 sq ft | $825.00 |
| Disposal and soffit repair | $250.00 |
| Warranty reserve, 8% of the warranted work | $36.31 |

## The three modelling decisions worth knowing

**Visits are counted, not assumed.** Trap days times checks per day become
return trips, each one a round trip with paid drive time. Most states require a
set trap to be checked every 24 hours — that is the operator's figure to enter,
not a rule this tool asserts.

**Height multiplies exclusion labor and nothing else.** The same 45 feet of
seal is $155.80 of labor at ground level and $264.86 at a two-story eave (a
1.7× tier). The multiplier does not touch trap checks in the yard or
decontamination in the attic, because reaching the roof does not change how
long those take.

**The trap-check crew is separate.** A two-person crew does the seal; one tech
usually goes back for the daily check. Charging the full crew for all five
would overstate the job by about $220 here — and overstating is the way this
tool would lose the argument it exists to win.

## The flags

Each is a prompt to look at something, never a determination:

- a job scheduled in a month when the chosen species commonly has young that
  cannot leave on their own (sealing then traps them inside — the real window
  is set by the operator's state wildlife agency, and this tool does not know
  it);
- traps set for days with no check visits budgeted;
- traps quoted on a species nobody traps (bats and birds are excluded through
  one-way devices);
- one-way devices installed with no trip back to pull them;
- a warranty offered with a 0% reserve against it.

## What it does not do

It makes no determination about what a state's wildlife code requires, how
often traps must be checked, whether a species may lawfully be excluded on a
given date, or what licence, permit or insurance a job needs. It is arithmetic
on figures the operator types, and the figures it starts with are an
illustrative example rather than market data.
