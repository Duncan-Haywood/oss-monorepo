# Delivery App Margin Calculator

One ticket, every path. Enter a typical check and see what **dine-in, pickup,
DoorDash, Uber Eats, Grubhub, and your own driver** each leave after
commission, card processing, packaging, and extra bagging time — plus the
delivery-menu price each app needs to match dine-in.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/delivery-app-margin-calculator/

After using this, you can price a delivery menu so a DoorDash order keeps the
same cash as dine-in, which used to take a messy spreadsheet and a guess at
whether the headline commission was the whole cost.

It runs entirely in the browser: static ES modules, no build step, no
dependencies, no server, no account, no API key.

## Why this exists

Marketplace seller calculators in this repo answer "what does this channel
take from a listed item." A restaurant has a different question: **does this
delivery ticket make money, and what do I have to charge so it does?**

Three things "DoorDash takes 30%" pages get wrong, all of which this models:

- **Packaging and extra bagging minutes are cash**, whether or not the app
  takes a cut. On a $32 ticket they often add a few dollars the percentage
  never shows.
- **The listed price on the app is a decision.** A channel with a higher
  commission can still match dine-in if the delivery menu is marked up
  enough. The table's "price to match dine-in" column is that number.
- **The monthly gap is the number owners actually feel.** Four hundred
  $32 DoorDash tickets at the dine-in price can give up four thousand
  dollars a month versus the same tickets sold in the room.

## Using it

Open `index.html` in a browser, or serve the directory:

```sh
python3 -m http.server 8000     # then visit /ventures/delivery-app-margin-calculator/
```

Shared inputs (ticket price, food cost, wage, expected monthly app orders)
apply to every path. Anything a path does differently — a higher DoorDash
menu, your own driver cost, a second commission plan — goes in that path's
panel under the table. Paths can be switched out of the comparison; "Other
channel" starts switched off and blank.

Entries are saved in your own browser so the page remembers them next time.
"Reset everything" clears them.

After calculating, use **Copy decision summary** to copy a compact owner-review
note with the winning path, monthly contribution, and each path's price needed
to match dine-in. Use **Copy shareable link** instead to hand the whole
comparison — the ticket and every path's rates, not just the conclusion — to
a partner or accountant so they can open it, change an assumption, and see
the result for themselves. The link carries the numbers after `#` in the
address, which a browser never sends to a server, so pasting it into a text
or an email is the only way it travels.

A worked example of the default ticket is on
[doordash-fees-for-restaurants.html](doordash-fees-for-restaurants.html).

## Rates are inputs, not a published schedule

Every rate ships with an **illustrative** US default and is editable. This
project does not track, mirror, or assert any app's current fee schedule —
those vary by plan, market, and contract, and they change. Replace the
defaults with the numbers on your own payout statements; that is what makes
the comparison yours rather than a generic estimate.

## What it deliberately does not model

Fees are the part that is easy to calculate, not the whole decision. This
has no way to know how many of those tickets you would have sold as dine-in
or pickup, what refunds and promotions cost, or how a full board of delivery
tickets crowds out the room. An app fee is partly a payment for demand you
would otherwise have to create. Read the gap as one input.

## Tests

```sh
node --test
```

Covers each path's fee shape, extra labor and packaging, listed-price
overrides, break-even and dine-in-matching price solving (round-tripped
through the calculator), commission-to-match solving, ranking and the
monthly dine-in gap, the switched-off-channel rule, input validation, and
the usage counter's opt-out, Do Not Track / Global Privacy Control, and
hostile-storage behaviour.

## Privacy

Everything runs in the visitor's browser. Prices, costs and rates are never
uploaded — there is no server to upload them to. No accounts, cookies,
tracking pixels, or analytics vendors. Saved entries stay in `localStorage`
on that device. A shareable link encodes the same entries into the URL
fragment (`#...`, never the query string) and is never sent anywhere; it
is built and copied entirely in the visitor's own browser.

The optional usage counter records only an event name
(`comparison_calculated`, `channel_rates_edited`, `channel_toggled`,
`summary_copied`) and the
current day, in the visitor's own `localStorage`. It never records inputs,
it never leaves the device, it is off for anyone sending Do Not Track or
Global Privacy Control, and the footer checkbox turns it off and discards
what was already counted. It exists so a reading can be reported by hand if
a user volunteers one; there is no collection endpoint.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not tax, financial, or business advice,
and it does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it.** To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, export your inputs and run it yourself.

## Cost and support

$0 to run: static files, no inference, no paid API, no database. Free with
the full feature set — there is no paid tier and no gated feature.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and changes nothing about what the tool does.

MIT licensed.
