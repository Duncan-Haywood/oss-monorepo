# Certified Payroll Calculator

A free browser calculator for Davis-Bacon and prevailing-wage government
contractors. For one worker classification, one week, it checks whether cash
wages plus fringe meet the project's wage determination, computes overtime
**correctly** when part of the required fringe is paid in cash instead of a
bona fide benefit plan, and flags apprentices who exceed the approved
apprentice-to-journeyman ratio.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts.

```bash
# Serve it locally
npx http-server ventures/certified-payroll-calculator -p 8080
# Run the tests
cd ventures/certified-payroll-calculator && node --test
```

**Value:** After using this, you can now catch the exact overtime shortfall a
DOL Davis-Bacon audit would find — before you submit the week's certified
payroll — which used to mean trusting whatever a general-purpose payroll
system defaulted to.

## The problem it solves

A Davis-Bacon or prevailing-wage wage determination sets a required base rate
and a required fringe benefit rate for each labor classification. A
contractor can satisfy the fringe portion with a bona fide plan contribution,
cash paid straight to the worker, or a mix of both — and that choice changes
the overtime math. Under 29 CFR 5.32 and 778.7, a bona fide plan contribution
is excluded from the overtime "regular rate" and never gets a time-and-a-half
premium; cash paid in lieu of fringe is included and must get the premium.
General-purpose payroll systems default to applying overtime to the base rate
only, which underpays every week a contractor uses cash-in-lieu-of-fringe —
one of the more common findings in a DOL Davis-Bacon audit.

This is a different problem from a bid or margin calculator: it is not
pricing a job, it is checking whether a week that has already happened paid
what the wage determination requires.

## How it works

1. **Classification and the wage determination.** Enter the required base
   rate and fringe rate from the project's wage determination (or the
   worker's registered apprenticeship agreement if this row is an
   apprentice) — this page never looks either up for you.
2. **What was actually paid.** Actual base rate, the portion of fringe paid
   into a bona fide plan, the portion paid in cash instead, and this week's
   straight-time and overtime hours.
3. **Compliance check.** Required rate vs. actual rate (base plus every form
   of fringe), the per-hour shortfall if any, and the total dollar
   underpayment for the week.
4. **Correct overtime.** The overtime premium applies to the base rate plus
   cash-in-lieu-of-fringe — never to a bona fide plan contribution — and the
   page also reports what the common shortcut (premium on base only) would
   have cost, so the gap is visible rather than implied.
5. **Optional apprentice ratio check.** Enter the approved ratio and the
   journeymen/apprentice counts on site, and the page reports how many
   apprentices exceed the ratio. It does not silently recompute their pay at
   a different rate — it reports the count, and, if you also provide the
   full journeyman rate and the excess apprentices' hours, the dollar gap.

**Copy week summary** turns the result into plain text. **Copy share link**
puts the same inputs in a URL fragment so a compliance officer or future-you
can reopen the exact week — nothing is sent to a server either way.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency; see [`calc.test.mjs`](calc.test.mjs).

## Opportunity and evidence

The target user is a certified payroll clerk, project accountant, or small
subcontractor's office manager on a federal or federally-assisted
construction contract who has to file a weekly WH-347-style certified
payroll report. This is a well-populated search area — "certified payroll
software," "WH-347 calculator," "Davis-Bacon overtime fringe benefits" — with
existing paid competitors (LCPtracker, eMars, ELB Consulting) that assume an
ongoing subscription and a live project setup, and government-contracting
forums (r/GovernmentContracting, r/Construction, and trade-association
compliance guidance pages) where the fringe-benefit overtime rule and the
apprentice ratio rule are recurring points of confusion. This is not yet
validated by a real visitor — see `kill_criteria` in `VENTURE.yaml`.

This is a different job from every `*-bid-calculator` venture in this
portfolio, which price a job before it starts; this checks a week of pay
after the fact against a compliance floor, for a buyer (certified payroll /
compliance staff) that no existing venture here targets.

## Privacy and usage

Everything runs in your browser. Your data is never uploaded, and there are
no accounts, tracking cookies, or analytics vendors. The product counts only
aggregate local `week_calculated`, `ratio_checked`, `summary_copied`,
`share_link_copied`, and `shared_link_opened` events, never people, IPs,
content, or cross-site identifiers. A shareable link encodes the week's
inputs in the URL hash; it is not sent to a server. The checkbox in the
footer turns counting off; clearing browser storage removes the local count.
See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.

## Limitations

- **Does not determine Davis-Bacon coverage, the applicable wage
  determination, or a worker's classification.** Those come from the
  contracting officer's wage determination on SAM.gov and the project's own
  solicitation — entered here, never guessed.
- **Does not generate a filed WH-347 report.** It computes the underlying
  arithmetic so you can check or fill in a report correctly; it does not know
  your project name, contract number, or DOL's exact form layout.
- **Does not look up an approved apprentice ratio.** That comes from the
  specific registered apprenticeship program.
- One worker classification, one week, at a time.
- Single currency.
- Starting figures are an illustrative example, not a wage determination for
  any real project.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, payroll, or compliance
advice, and it does not replace a qualified professional. It does not
determine whether a contract is covered by Davis-Bacon, which wage
determination applies, or a worker's approved apprentice rate or ratio.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any certified payroll or wage obligation it helps
you check. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

MIT licensed — see [`LICENSE`](LICENSE).
