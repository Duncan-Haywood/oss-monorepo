# Asbestos Abatement Bid Calculator

Free browser-local bid calculator for licensed asbestos abatement
contractors quoting a removal job. After using this, you can now price a
job from what actually drives the cost — OSHA/EPA containment class (Class
I friable, Class II non-friable, Class III minor/incidental), square
footage, number of containment areas, crew and supervisor rates, air
monitoring samples, waste disposal volume, and permit fees — which used to
take a flat rate per square foot or a gut-feel number copied from the last
similar job.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/asbestos-abatement-bid-calculator/

Open `index.html` directly, or serve this directory with
`python3 -m http.server`. See [`vs-a-flat-rate-per-square-foot.html`](vs-a-flat-rate-per-square-foot.html)
for the worked-example comparison against a flat per-square-foot quote, or
[`how-much-does-asbestos-abatement-cost.html`](how-much-does-asbestos-abatement-cost.html)
for why the same square footage prices so differently by containment class.
Run the tests with:

```
node --test ventures/asbestos-abatement-bid-calculator/*.test.mjs
```

## Why containment class, not square footage

The trade's own shorthand for pricing this work is a flat rate per square
foot. That number is what a customer asks for, and it is wrong for the
thing that actually moves the cost: which containment class the work falls
under. Class I friable material (pipe or duct insulation, sprayed-on
fireproofing) requires full containment, a negative-air machine, and a
three-stage decon chamber, and crews move far slower in full-face
respirators doing wet removal and HEPA-vacuum cleanup. Class III minor,
incidental disturbance of non-friable material can be glovebagged in an
afternoon with almost none of that. A 400 sq ft Class III patch and a 400
sq ft Class I boiler-room pipe-insulation job are nowhere near the same
price, and a flat $/sq ft rate prices them identically. The calculator
prices the job both ways and shows the gap: how much a flat rate would
have left on the table, or overcharged, on the exact job you just priced.

## Share a link to a priced job

"Copy share link" encodes the whole form — containment class, footage, crew
and supervisor rates, air monitoring, waste disposal, permit, and the
proposal panel's deposit/terms — into this page's own URL. Nothing is sent
to a server; the link is only ever built and read in the browser. Send it to
a partner, the office, or reopen it on your own next visit to see the same
job without retyping it.

## Hand the customer a proposal

Once the price is calculated, the page can also print (or "Save as PDF") a
one-page customer proposal — scope lines drawn from the containment class
and square footage you entered, the price, a deposit split, a date the
price is held until, and a line for the customer to sign. It uses the
portfolio's shared `platform/proposal/` module, the same one every other
bid calculator in this catalogue carries, so the format is familiar to a
customer comparing several bids from different contractors.

## Privacy and usage

Everything runs in your browser. Your job details, rates, and price are
never uploaded, there is no account, and nothing leaves the page. We count
anonymous local feature events only (`quote_calculated`, `reset`,
`share_link_copied`, `sponsor_link_clicked`, plus the shared proposal
module's own events), with
a visible opt-out. Do Not Track and Global Privacy Control disable
counting automatically. No job, price, or client figures are ever
recorded, and the counter is not sent to the maintainers. Your business
details (name, phone, licence number) are saved on your own device so you
only type them once; the customer's details are never saved.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not asbestos inspection, environmental,
engineering, or legal advice, and it does not replace a qualified licensed
contractor's own judgment. **You are responsible for reviewing and
verifying its output before relying on it**, and for meeting any
professional, contractual, or regulatory obligation your work is subject
to. To the maximum extent permitted by law, the authors accept no
liability for any loss or damage arising from its use.

This is a pricing worksheet based on your own assumptions, not an asbestos
inspection, a bulk-sample identification, a check against any federal,
state, or local regulatory requirement, or a substitute for a licensed
contractor's own certification, competent-person determination, or
professional judgment about scope and liability on a given job.

MIT licensed. See `LICENSE`.
