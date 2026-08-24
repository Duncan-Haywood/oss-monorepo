# Where to Sell Calculator

One item, every channel. Enter what an item cost you and what you would sell it
for, and see what **eBay, Etsy, Amazon, your own store and a direct sale** each
leave you after fees — plus the price each channel would need to charge to
match the best one.

It runs entirely in the browser: static ES modules, no build step, no
dependencies, no server, no account, no API key.

## Why this exists

The single-marketplace calculators in this repo each answer "what does this
order leave me on *this* channel". The question a seller with a listable item
actually asks is "where should I put it", and answering that with three
separate calculators means entering the same costs three times and reconciling
fee structures that are not comparable line by line.

Three things flat "X% fee" comparisons get wrong, all of which this models:

- **Per-listing fees are charged whether or not the item sells.** They dominate
  on cheap items and are invisible in a percentage comparison.
- **A monthly plan is not a per-order cost until it is spread over orders.** At
  10 orders a month a $39 plan is $3.90 an order; at 200 it is 20¢. Comparing
  an own store to a marketplace without that share is the most common error.
- **The fee percentage is not the decision.** What matters is the price each
  channel needs to leave you the same money — a channel with higher fees still
  wins if you can list higher there. That is the last column of the table.

## Using it

Open `index.html` in a browser, or serve the directory:

```sh
python3 -m http.server 8000     # then visit /ventures/where-to-sell-calculator/
```

Shared inputs (price, shipping, cost of goods, packaging, expected monthly
orders) apply to every channel. Anything a channel does differently — a higher
price on Etsy, no postage on a local sale, an FBA fee on Amazon — goes in that
channel's own panel under the table, along with its rates. Channels can be
switched out of the comparison; "Other channel" starts switched off and blank
for anything not listed (Mercari, Poshmark, Depop, a craft fair, wholesale).

Entries are saved in your own browser so the page remembers them next time.
Use **Copy share link** to put the current comparison into a URL you can send
to a partner or reopen elsewhere. The link contains the calculator inputs in
an encoded URL query value; there is no server-side save or account. Use
"Reset everything" to clear local entries.

## Rates are inputs, not a published schedule

Every rate ships with an **illustrative** US default and is editable. This
project does not track, mirror, or assert any marketplace's current fee
schedule — those vary by category, country, plan, and account, and they change.
Replace the defaults with the numbers on your own statements; that is what
makes the comparison yours rather than a generic estimate.

## What it deliberately does not model

Fees are the part that is easy to calculate, not the whole decision. This has
no way to know how many buyers each channel puts in front of you, how fast an
item sells there, or what returns cost. A marketplace fee is partly a payment
for demand you would otherwise have to create. Read the fee gap as one input.

## Tests

```sh
node --test
```

Covers each channel's fee shape, monthly-plan amortisation (including the
refusal to divide a plan by zero orders), per-channel overrides, break-even and
target-profit solving round-tripping through the calculator, ranking and the
gap against the best channel, the switched-off-channel rule, input validation,
and the usage counter's opt-out, Do Not Track / Global Privacy Control, and
hostile-storage behaviour.

## Privacy

Everything runs in the visitor's browser. Prices, costs and rates are never
uploaded — there is no server to upload them to. No accounts, cookies, tracking
pixels, or analytics vendors. Saved entries stay in `localStorage` on that
device.

The optional usage counter records only an event name (`comparison_calculated`,
`channel_rates_edited`, `channel_toggled`, `subscription_toggled`,
`share_link_copied`) and the
current day, in the visitor's own `localStorage`. It never records inputs, it
never leaves the device, it is off for anyone sending Do Not Track or Global
Privacy Control, and the footer checkbox turns it off and discards what was
already counted. It exists so a reading can be reported by hand if a user
volunteers one; there is no collection endpoint.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of any
kind, express or implied. It is not tax, financial, or business advice, and it
does not replace a qualified professional. **You are responsible for reviewing
and verifying its output before relying on it.** To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

## Cost and support

$0 to run: static files, no inference, no paid API, no database. Free with the
full feature set — there is no paid tier and no gated feature.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
changes nothing about what the tool does.

MIT licensed.
