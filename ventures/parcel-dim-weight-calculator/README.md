# parcel-dim-weight-calculator

What a parcel actually bills at, before you buy the cartons.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/parcel-dim-weight-calculator/

Carriers charge on the **greater** of a package's actual weight and its
*dimensional* weight — the cube of the carton divided by a contract constant
called the DIM divisor — rounded up to the next whole pound. For anyone
shipping light or bulky goods, the second number is almost always the one that
wins, and most sellers meet it for the first time on an invoice.

## What it does

- **Billable weight** per package and across a run of identical packages, with
  the per-package round-up applied per package rather than to a shared cube.
- **Pounds of air**: the gap between what is billed and what the goods weigh,
  stated in pounds rather than as a ratio, because that is the number that
  changes a carton decision.
- **The break-even cube** — actual weight times divisor — and, where the
  footprint allows it, the packed height that reaches it on the carton you
  already have. When no achievable height gets there, it says so rather than
  suggesting you pack a mug flat.
- **Girth and surcharge banding**: additional handling, large package, and over
  the carrier maximum, from dimensions alone. No dollar figures — those are rate
  card terms that would go stale here.
- **Carrier dimension rounding**, applied before the multiplication rather than
  after, which is where a naive implementation disagrees with an invoice.

## Why the divisor is an input

Because it is a contract term, not a constant. The published US domestic figure
for the major parcel carriers has been 139, but negotiated accounts routinely
carry 166, 194 or 250, and the divisor can differ between ground and air on the
same account. A better divisor is often worth more to a light-goods shipper than
a headline rate discount. `DEFAULT_DIVISOR` is a starting point the page lets you
change; every output is recomputed from whatever is passed.

## Privacy

No account, no network requests, no data leaves the browser. The last entry is
kept in `localStorage` so a refresh restores it, and the shareable link carries
values in the URL fragment — which browsers never send to a server or put in a
`Referer` header. Usage counting is a local tally of which features were used,
never dimensions or weights, and it is opt-out from the page footer.

## Layout

| File | What it is |
| --- | --- |
| `calc.mjs` | The engine: billable weight, cube, girth, surcharge flags, break-even lever. Pure. |
| `levers.mjs` | Turns a result into the dock-level instruction — cube ceiling, target height, or "smaller box, not flatter". |
| `share.mjs` | URL-fragment encode/decode for the inputs, numbers and the rounding checkbox. |
| `usage.mjs` | Local, opt-out feature tally. |
| `index.html` | The calculator, importing the engine rather than reimplementing it. |
| `how-dimensional-weight-is-billed.html` | The explainer, with the arithmetic and a worked example. |

## Tests

```
node --test
```

## Disclaimer

A planning estimate, not a quote. Divisors, rounding rules, surcharge thresholds
and minimum billable weights are carrier contract terms that differ by carrier,
service and account, and they change. Verify against your own rate agreement
before pricing a listing. Free and as-is, with no warranty.
