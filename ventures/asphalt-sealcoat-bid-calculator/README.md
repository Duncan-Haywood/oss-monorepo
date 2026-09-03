# Asphalt Sealcoating Bid Calculator

A free browser calculator for sealcoating contractors. It prices a driveway or
parking-lot job the way the trade actually loses money when they skip it —
square feet times coats and coverage, then oil-spot primer, crack fill,
striping, and the drive — and shows the margin before the price goes out.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/asphalt-sealcoat-bid-calculator -p 8080
# Run the tests
cd ventures/asphalt-sealcoat-bid-calculator && node --test
```

After using this, you can now quote a sealcoating stop from coats, condition,
and prep instead of a cents-per-foot guess, which used to take a spreadsheet
and still missed the drive.

## The problem it solves

Small sealcoating crews are told to bid by price per square foot. That rule
cannot see the job. An 800 sq ft oxidized driveway that needs two coats, four
oil spots, and forty feet of crack fill is not the same stop as a tight pad
sealed last year. The first coat on failing asphalt drinks sealer; the second
is thinner; cracks are linear feet; oil needs primer, not more sealer. A
neighborhood special of $0.18 / sq ft on that driveway is $144 — often below
the walk-away once loaded labor, materials, and an eight-mile round trip are
counted.

The second thing that sinks these bids is treating travel and setup as free.
The tanker still had to leave the yard. A tiny apron that “only takes twenty
minutes” still required the insurance, the blow-off, and the drive.

## How it works

1. **Per-surface gallons and coat hours.** Each row is a surface with square
   footage, coats, and first-coat coverage (sq ft per gallon). First-coat
   gallons = area ÷ (coverage × condition factor). Extra coats use the thinner
   second-coat coverage. Coat hours = area × coats ÷ crew sq ft per hour
   (squeegee vs spray).
2. **Prep that is not “included.”** Oil spots add primer gallons and scrape
   time. Crack fill is linear feet. Stalls add striping paint and time. Sand
   in the sealer adds mix time and bags.
3. **Loaded labor and the drive.** Hourly wage × (1 + payroll burden %). Miles
   are a round trip. If on-site time lands under the minimum, the minimum
   applies.
4. **Overhead, then margin as a share of price.** Overhead marks up direct
   cost. Price = cost ÷ (1 − target margin %).
5. **Sanity numbers.** Price per square foot, price per gallon, effective
   hourly rate, and the **walk-away price** (total cost). A price already on
   the table is scored against the same cost base. **Copy quote summary** and
   **Copy share link** turn the result into a draft or a URL that keeps coats,
   oil spots, and margin.

The arithmetic lives in [`calc.mjs`](calc.mjs) with no DOM or network
dependency. See [`calc.test.mjs`](calc.test.mjs).

## Coverage figures

The surface types ship with common ballpark first- and second-coat coverage as
a starting point. **They are not a manufacturer yield, a specification, or a
guarantee.** Real yield depends on sealer, dilution, pavement texture, and
weather. Every coverage figure is editable, and picking a surface type never
overwrites a yield the contractor has already changed.

This tool does not recommend coal-tar versus asphalt-emulsion sealer and does
not check local VOC rules. That choice stays with the contractor.

## Privacy

Nothing is uploaded. Every figure stays in the browser. The only thing stored
is an anonymous local tally of which features were used and the current date,
in `localStorage` under `asphalt-sealcoat-bid-usage` — never the lot, wages,
costs, or prices. It is opt-out from the footer, and it is skipped
automatically when the browser sends Do Not Track or Global Privacy Control.
See [`usage.mjs`](usage.mjs) and [`portfolio/usage/`](../../portfolio/usage/README.md).

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or engineering
advice, and it does not replace a qualified professional. It is not a
pavement-condition assessment, a specification, or a finding that any lot is
ready to coat. **You are responsible for reviewing and verifying its output
before relying on it**, and for meeting any obligation it helps you prepare
for. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.
