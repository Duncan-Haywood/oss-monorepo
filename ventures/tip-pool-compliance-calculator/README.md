# tip-pool-compliance-calculator

A browser calculator for restaurant and bar owners that checks a mandatory
**tip pool** against the two federal FLSA rules that govern who can legally
be in it, and works out the tip-credit back-wage exposure a non-compliant
pool creates.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/tip-pool-compliance-calculator/

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the calculator
- [`vs-guessing-from-a-staff-meeting.html`](vs-guessing-from-a-staff-meeting.html)
  — the rule a verbal policy is most likely to get backwards
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter
- [`share.mjs`](share.mjs) — saves a roster to this browser and to a shareable link

```
node --test          # 43 assertions across calc, pages, usage and share
```

Open `index.html` in a browser to use it — there is no build step.

## After using this, you can now...

...tell whether a role belongs in your tip pool without re-reading the FLSA,
which used to mean guessing from a staff meeting or a payroll vendor's blog
post — and see the dollar figure a wrong guess puts at risk before it becomes
a DOL finding instead of after.

## The mistake it exists to catch

Most owners treat "mandatory tip pool" as one rule. Federal law actually
splits it into two, and they do not track each other:

1. **A manager or supervisor is never eligible**, whether or not you take a
   tip credit. Congress added this as a flat prohibition in 2018
   (Consolidated Appropriations Act, 2018, amending 29 U.S.C. 203(m)).
2. **Back-of-house staff (cooks, dishwashers, prep) are eligible only if you
   take no tip credit at all** — pay full minimum wage in cash. DOL's 2021
   rule (29 CFR 531.54) is what allows this "nontraditional" pool. The
   moment a tip credit is taken, the pool narrows back to employees who
   customarily and regularly receive tips: front-of-house.

Getting either wrong while taking a tip credit does not cost a warning. DOL
and the courts that have ruled on this treat an invalid pool as forfeiting
the tip credit for every front-of-house employee it was taken against, for
the whole period the pool ran.

On the roster this calculator opens with — servers and bartenders
front-of-house, dishwashers back-of-house, a shift manager, a $5.12 tip
credit taken, four weeks run:

| | |
|---|---|
| Front-of-house hours pooled | 230/week |
| Weekly back-wage exposure | **$1,177.60** |
| **Exposure across four weeks** | **$4,710.40** |

That exposure exists because a manager and the dishwashers are both drawing
from the pool while a tip credit is taken — two separate violations, on one
roster, that a staff meeting rarely checks for.

## Why it ships no wage table

The tip credit an employer is actually taking is a number only their own pay
stubs can supply — several states (California, Nevada, Washington, Oregon,
Montana, Alaska, Minnesota, and others) do not allow a tip credit at all, and
this tool has no way to know a visitor's state from a browser. So the tip
credit, hours, and headcounts are all inputs, exactly as this portfolio's
occupancy-tax and IFTA calculators treat their own rates as inputs.

## What it is not

**No warranty.** This free tool is not legal, tax, accounting, or financial
advice. It makes no determination about a specific restaurant's
classification of any role, or about any state law beyond the federal FLSA
baseline it checks against. Verify every role's classification against DOL
Fact Sheet #15, your state's wage-hour agency, and a qualified employment
attorney before relying on it. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. Do not use this as a
system of record.

**Nothing leaves your browser.** A roster's roles, wages, and hours are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally, and switched off automatically for
browsers sending Do Not Track or Global Privacy Control.
