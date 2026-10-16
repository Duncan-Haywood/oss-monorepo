# OSHA TRIR & DART Rate Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/osha-trir-dart-calculator/>

A free browser tool that turns a company's own OSHA 300 log counts —
recordable cases, DART cases, and total hours worked — into its Total
Recordable Incident Rate (TRIR) and DART rate, the two numbers a general
contractor's prequalification form, a bid package, or an insurance renewal
actually asks for. It also computes how many more injury-free hours it would
take to dilute the current rate down to a stated target. Nothing is
uploaded; the arithmetic runs on the visitor's own device.

```
cd ventures/osha-trir-dart-calculator && node --test "*.test.mjs"
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

TRIR and DART are defined by OSHA's own recordkeeping rule (29 CFR 1904) and
are the standard rates a GC prequalification form, a bid package, or a
workers' comp renewal asks for — many general contractors set a TRIR ceiling
(often 3.0, or a trade's published industry average) below which a
subcontractor cannot bid. The formula is simple arithmetic
(`recordable cases × 200,000 ÷ total hours worked`), but it is easy to get
the base rate or the DART-is-a-subset-of-recordable relationship wrong by
hand, and a company otherwise only computes it once a year when the OSHA 300A
summary is due — often for the first time on the same form that is about to
gate a bid.

The dilution figure — how many more injury-free hours it takes to bring the
current rate down to a target — is the number that makes the arithmetic worth
returning to mid-year rather than only at the annual posting deadline: a rate
in isolation is a fact about the past, and the hours-to-target figure is
something a safety program can actually plan around.

## What it does not do

It does not decide whether any specific injury or illness is OSHA recordable
— that determination is made against 29 CFR 1904.7's own criteria (first aid
vs. medical treatment, work-relatedness, the general recording criteria) and
stays the employer's own judgment call, case by case. This tool starts from
counts already on a company's own OSHA 300 log and does the rate arithmetic;
it never reviews a case description, never claims a company is compliant with
any OSHA rule, and is not a substitute for a Certified Safety Professional.

## Files

| File | What it is |
|---|---|
| `calc.mjs` | The arithmetic. Pure, no DOM. |
| `usage.mjs` | Anonymous, device-local event counts. |
| `index.html` | The calculator. |
| `how-to-calculate-trir.html` | The search-intent page with the formula, a worked example, and an `FAQPage` node. |

## Privacy

Everything runs in your browser. Your case counts, hours worked, and company
are never uploaded and never appear in a usage count — those are anonymous
tallies of which features were used, stored locally. We don't have accounts,
tracking cookies, or an analytics vendor.

## Disclaimer

This free tool is not legal, safety-compliance, insurance, or financial
advice, and it does not determine whether any case is OSHA recordable or
represent that any company is compliant with any OSHA rule. It is arithmetic
on the numbers you type. Verify every figure against your own OSHA 300 log
and a qualified Certified Safety Professional before relying on it or
submitting it on a bid or insurance form. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** This tool is free, experimental, and may be
slow, broken, moved, or taken offline without notice. Do not use it as a
system of record.

MIT licensed — see [`LICENSE`](LICENSE).

## Distribution

No paid acquisition. The intended channels are r/safety (an active
occupational-safety subreddit where TRIR/DART questions recur), EHS
professional forums and LinkedIn groups (ASSP-adjacent), and the search
phrases "TRIR calculator", "how to calculate TRIR", "DART rate calculator",
and "OSHA recordable incident rate calculator" — existing results are mostly
lead-gen forms in front of safety-consulting or EHS-software vendors rather
than a free, private, no-signup calculator. Unmeasured until the tool is live
and discoverable in the apex catalogue's sitemap.
