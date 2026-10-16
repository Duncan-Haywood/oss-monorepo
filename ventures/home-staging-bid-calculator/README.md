# Home Staging Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/home-staging-bid-calculator/>

Independent home stagers (one or a few furniture packages, not a franchise
with a warehouse team) can use this free browser-local calculator to price a
vacant-listing staging job — from the included term, furniture carrying cost,
crew labor, mileage, and equipment cost — check whether the extension fee
actually covers what an extra month costs to keep that package off the
market, and plug in the real time on market once the listing sells.
**After using this, you can quote a staging job on what the included term
actually costs to cover and know before you send the quote whether your
extension fee protects your margin or quietly erodes it, which used to take
a guess at the next slow listing.**

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. The deterministic calculation works with no
account, API key, upload, or paid dependency.

## Why the staging price and the extension fee are two separate pricing problems

A vacant-listing staging job is quoted once, up front — a room count, an
included term, and a furniture package — but the package keeps costing
storage, insurance, and wear for every month it stays in the house, and the
market, not the stager, decides how long that is:

- **The base staging price only has to cover the included term.** Pricing it
  from an optimistic time-on-market guess instead double-counts carrying cost
  that should be billed separately as an extension.
- **The extension fee is a second price, with its own cost floor.** It has to
  clear the furniture package's own carrying cost per month, not just look
  reasonable next to what a competitor advertises — a rate set below the
  carrying cost loses money on every month over the included term, worst on
  the slowest listings where the most extension months pile up.
- **The actual time on market is the only source of truth.** The
  calculator's "expected time on market" section is a planning estimate; the
  "check a listing that already sold" section recomputes the actual profit
  once the real number exists, the same way a proposed price gets checked
  against a breakeven in the portfolio's other job-pricing calculators.

The extension-fee check is the sharpest number here: `maxExtensionMonthsBeforeLoss`
tells a stager whose extension fee is priced below their own carrying cost
exactly how many extension months on this specific listing would erase its
entire built-in profit — before quoting the job, not after the listing sits
for a season.

## Known limitations

This models a **vacant-listing furniture package** only. Occupied-home
staging consultations (arranging a seller's own furniture, no rental package)
are priced differently and are not covered by this calculator's arithmetic.
`roomsStaged` is descriptive only in this version — it labels the job but
does not scale the furniture carrying cost, which you set directly as a
single monthly figure for the whole package.

## Privacy and usage

Everything runs in your browser. Your job details, prices, and listing dates
are never uploaded, there is no account, and nothing is saved when you close
the tab — every field resets on refresh by design. We count anonymous local
feature events only (`quote-priced`, `term-checked`), with a visible opt-out.
Do Not Track and Global Privacy Control disable counting automatically. No
job details, prices, or dates are recorded. The counter is not sent to the
maintainers.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

This calculator produces arithmetic observations from numbers you supply. It
does not audit your books, verify a staging or listing agreement, predict how
long a home will take to sell, or replace your own contract, insurance, or
accountant.

MIT licensed. See `LICENSE`.
