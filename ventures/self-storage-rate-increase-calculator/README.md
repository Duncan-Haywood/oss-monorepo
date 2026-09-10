# self-storage-rate-increase-calculator

A browser calculator for independent self-storage operators. It prices an
**existing-customer rate increase** the way the decision is actually made —
against the move-outs it will cause — and reports the one number nobody has:
how much induced churn the increase can absorb before it stops paying.

Everything runs in the visitor's browser. No account, no network requests, no
build step, no dependencies.

- [`index.html`](index.html) — the calculator
- [`how-much-can-i-raise-storage-rent.html`](how-much-can-i-raise-storage-rent.html)
  — the question people search
- [`calc.mjs`](calc.mjs) — every figure, as pure functions
- [`usage.mjs`](usage.mjs) — an anonymous, opt-out, local-only counter

```
node --test          # 49 assertions across calc, pages and usage
```

Open `index.html` in a browser to use it — there is no build step.

## The mistake it exists to catch

An operator deciding whether to send a rate-increase letter prices a move-out
at the departing tenant's rent: *if six of them leave, that's eight thousand
dollars a year gone.* That figure assumes the unit earns nothing for the rest
of the year, which is only true if it is never re-let.

It gets re-let, at the **street rate** — and on a tenant who has been in place
long enough to be worth raising, the street rate is usually **above** what they
are paying. So the real cost of losing them is the gap, and the gap has a term
that runs the other way.

On the worked example the page opens with — 42 units at $118, a 15% increase to
$135.70, a $149 street rate, 45 days to lease up, a free first month, a $45 turn
— one induced move-out costs:

| Term | Amount |
|---|---|
| Rent and ancillary lost over 45 days empty | $238 |
| Free first month for the replacement tenant | $149 |
| Turn: clean-out, lock, listing, admin | $45 |
| Re-rent at $149 street instead of their $135.70 | -$160 |
| **What one induced move-out costs** | **$272** |

$272, against the $1,772 of rent and tenant-protection income the naive view
counts. That difference is the whole product.

## What it reports

- **The break-even induced move-out rate.** On the example, **60.8%** — about
  25 of the 42 units would have to leave, on top of the 22% who were going
  anyway, before the increase finishes level. Set against the two or three an
  operator would actually expect, the decision stops being close.
- **What the increase is worth** across the group over the horizon: $6,272 over
  twelve months at the entered 6% induced response, $6,958 if it caused none.
- **The margin of safety** in percentage points, so a thin call reads as thin.
- **The same decision at 5%, 8%, 10%, 12%, 15%, 20% and 25%**, each with the
  move-out rate it would have to survive, and a flag on any rung that prices the
  raised rent **above your own street rate** — the point where the re-rent term
  flips from a credit to a cost.

## What it will not do

It will not tell you how many tenants an increase will cost you. Induced churn
depends on tenure, unit size, the competitor down the road, the wording of the
letter, and how much slack the local market has; no arithmetic can know it, and
a tool that guessed would be guessing with your revenue.

What it does instead is convert an unanswerable question — *how many will
leave?* — into an answerable one: *would more than 25 of these 42 leave over
$17.70 a month?* That is a question an operator who has sent increase letters
before can answer.

It also makes no determination about **what your lease or your state's
self-storage act permits**, or what notice a tenant is owed before an increase
takes effect. Those are questions for the lease and, if it is not plainly
written, a lawyer.

*After using this, you can defend a rate-increase decision with a break-even
move-out rate instead of a hunch, which used to take a spreadsheet nobody had
built.*

## Privacy and usage

Everything runs in your browser. Your rents, street rates, unit counts and the
answers worked out from them are never uploaded, and there are no accounts,
cookies, tracking pixels, or analytics vendor. Unless you opt out, the page
stores an event name and the day in this site's own local storage — never a
figure, never an identifier. Do Not Track and Global Privacy Control switch it
off automatically.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not legal, tax, accounting, or financial advice,
and it does not replace a qualified professional. It does not tell you what to
charge, what notice your lease or your state's self-storage act requires before
an increase takes effect, or whether raising a tenant's rent is a good idea.
**You are responsible for reviewing and verifying its output before relying on
it**, and for meeting any obligation it helps you prepare for. To the maximum
extent permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may be
slow, broken, moved, or taken offline without notice. We do not promise uptime,
backups of anything you type, or that a URL will keep working. Do not use this
as a system of record. If a tool needs to survive, export your inputs and run it
yourself.

## Support

Free and open source under an MIT licence.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
never changes what the tool does.
