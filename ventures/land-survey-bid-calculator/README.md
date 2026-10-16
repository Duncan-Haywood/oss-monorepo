# Land Survey Bid Calculator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/land-survey-bid-calculator/>

Free browser-local bid calculator for independent licensed land surveyors
(one-to-three-person crews, not large multi-office firms) quoting a boundary
retracement, topographic, or ALTA/NSPS land title survey. After using this,
you can now price a survey job from what actually drives the hours — corners
located vs. corners set from scratch, terrain and access, deed/plat record
research, crew and office rates, drafting time, and travel — which used to
take a flat per-acre guess or a gut-feel number copied from the last similar
job.

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. Run the tests with:

```
node --test ventures/land-survey-bid-calculator/*.test.mjs
```

## Why corner count and record research, not acreage

The trade's own shorthand for pricing this work is a flat rate per acre. That
number is what a client asks for, and it is wrong for the two things that
actually move the hours: how many boundary corners have to be found versus
set from scratch (a corner with no recoverable monument can run two to three
times the field time of one that is simply relocated and confirmed), and how
much deed, plat, and easement research the title chain needs before anyone
drives to the site. A ten-acre parcel with six easy corners and a clean title
chain and a two-acre infill lot with three lost corners and a tangled
1950s deed can cost the same to survey — acreage alone does not see that. The
calculator prices the job both ways and shows the gap: how much a flat
per-acre quote would have left on the table, or overcharged, on the exact job
you just priced. See
[this calculator vs. a flat per-acre quote](vs-a-flat-per-acre-quote.html)
for two worked examples where the gap runs in opposite directions, or
[how much does a land survey cost](how-much-does-a-land-survey-cost.html)
for why a small, hard parcel can cost more than a large, easy one.

## Hand the customer a proposal

Once the price is calculated, the page can also print (or "Save as PDF") a
one-page customer proposal — scope lines drawn from the corners and survey
type you entered, the price, a deposit split, a date the price is held until,
and a line for the customer to sign. It uses the portfolio's shared
`platform/proposal/` module, the same one every other bid calculator in this
catalogue carries, so the format is familiar to a customer comparing several
bids from different trades.

## Privacy and usage

Everything runs in your browser. Your parcel details, corner counts, rates,
and price are never uploaded, there is no account, and nothing leaves the
page. We count anonymous local feature events only (`quote_calculated`,
`reset`, `sponsor_link_clicked`, plus the shared proposal module's own
`proposal_printed`/`company_forgotten` events), with a visible opt-out. Do Not
Track and Global Privacy Control disable counting automatically. No parcel,
price, or client figures are ever recorded, and the counter is not sent to
the maintainers. Your business details (name, phone, licence number) are
saved on your own device so you only type them once; the customer's details
are never saved.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not surveying, engineering, or legal
advice, and it does not replace a qualified licensed professional. **You are
responsible for reviewing and verifying its output before relying on it**,
and for meeting any professional, contractual, or regulatory obligation your
work is subject to. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

This is a pricing worksheet based on your own assumptions, not a legal
boundary determination, a check against any state's minimum technical
standards, or a substitute for a licensed surveyor's own professional
judgment.

MIT licensed. See `LICENSE`.
