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
"Reset everything" clears them.

## Rates are inputs, not a published schedule

Every rate ships with an **illustrative** US default and is editable. This
project does not track, mirror, or assert any marketplace's current fee
schedule — those vary by category, country, plan, and account, and they change.
Replace the defaults with the numbers on your own statements; that is what
makes the comparison yours rather than a generic estimate.

## How fast it sells is part of the answer

The highest net per sale is not the same as the most money per month. A channel
that nets $6 less but sells in three days instead of ninety returns your cash
thirty times more often, and a reseller with finite cash feels that far more
than the six dollars.

So each channel has an optional **days to sell**, and the table shows what it
keeps *per day of waiting* alongside what it keeps per sale. Ranking can be
switched between the two. When they disagree — the usual case once real
turnaround numbers go in — the page says so in words above the table, because
that disagreement is the whole reason to look.

Speed is stated as a **turnover count** ("the same cash goes round 122 times a
year") rather than an annualised percentage. Annualising a three-day flip is
arithmetically true and reads as a promise; the count says the same thing
without implying it compounds.

The holding period ships **identical on every channel** (21 days), so out of
the box it changes nothing. How fast a channel moves *your* category is an
observation only you have; inventing per-marketplace figures here would be
exactly the stale published-schedule claim the rest of this tool refuses to
make. Enter what you have actually seen, and leave it at zero for a channel you
have not timed — that reads as unknown, and the channel simply sits out the
speed ranking rather than winning on a blank.

## What it deliberately does not model

Fees and speed are the parts that can be calculated, not the whole decision.
This still has no way to know how many buyers each channel puts in front of
you, or what returns cost. A marketplace fee is partly a payment for demand you
would otherwise have to create. Read the gap as one input.

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

The holding-period tests cover the same ground: that the shipped default
changes no ranking until it is edited, that profit-per-day and turnover divide
by the period, that a blank period reads as unknown rather than instant and
sorts last on speed rather than winning, that a faster channel can outrank a
more profitable one, and that no speed upset is claimed against a channel the
seller never timed.

## Privacy

Everything runs in the visitor's browser. Prices, costs and rates are never
uploaded — there is no server to upload them to. No accounts, cookies, tracking
pixels, or analytics vendors. Saved entries stay in `localStorage` on that
device.

The optional usage counter records only an event name (`comparison_calculated`,
`channel_rates_edited`, `channel_toggled`, `subscription_toggled`) and the
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
