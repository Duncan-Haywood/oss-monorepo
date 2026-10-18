# Where to Sell Calculator

One item, every channel. Enter what an item cost you and what you would sell it
for, and see what **eBay, Etsy, Amazon, Mercari, your own store and a direct sale** each
leave you after fees — and after that channel's return rate — plus the price
each channel would need to charge to match the best one, and, when you expect
different volumes on each channel, which one actually keeps more cash in a
month. Then it asks the question a fee table cannot: **how often does it
actually sell there**, and what is one listing worth per month of shelf once
you count that.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/where-to-sell-calculator/

**Walmart Marketplace** (seller-fulfilled, added 2026-10-17, off by default;
it hands the item to [`../walmart-marketplace-calculator`](../walmart-marketplace-calculator/)
for the WFS-versus-ship-it-yourself question, and `channel-parity.test.mjs`
checks its profit against that calculator's seller-fulfilled path) joins
**Depop and Facebook Marketplace** (added 2026-10-16, both off by default; each
opens its dedicated calculator with the item already filled in) join
**Reverb, TikTok Shop, Whatnot, Poshmark and StockX** as more channels,
each switched off until you turn it on. Reverb only applies to musical
instruments and audio gear; Poshmark only to clothing, shoes and accessories;
StockX only to sneakers, streetwear and graded cards; TikTok Shop and Whatnot
only if you sell through those platforms — a channel a seller cannot list on
is noise in a ranking rather than information. None of their fee assumptions
are restated here — `channel-parity.test.mjs` imports them from
[`../reverb-fee-calculator`](../reverb-fee-calculator/),
[`../tiktok-shop-fee-calculator`](../tiktok-shop-fee-calculator/),
[`../whatnot-seller-payout`](../whatnot-seller-payout/),
[`../poshmark-fee-calculator`](../poshmark-fee-calculator/) and
[`../stockx-seller-payout-calculator`](../stockx-seller-payout-calculator/)
and fails if any of the six tools ever quote the same marketplace differently.

### StockX is the one channel where postage is not yours to charge

StockX is a bid/ask marketplace rather than a storefront: the buyer pays
StockX for delivery at checkout, so **no postage a buyer pays ever reaches
the seller**, and the StockX row pins shipping charged to zero rather than
inheriting the shared figure. What the seller *does* pay — the label to a
verification centre — is a real cost and is inherited as normal. Getting this
wrong in the other direction would be expensive rather than untidy: crediting
StockX with postage revenue it never pays out would float it up a ranking the
reader then acts on.

Its seller fee is also the one rate on this page that is genuinely different
per seller — it falls as your own Seller Level rises, and Fast Shipping
enrollment takes more off it again — so the preset is a starting point to
replace with the rate on your own dashboard, and the dedicated calculator is
where the level-versus-Fast-Shipping decision gets made.

### Poshmark is the one channel whose fee is not a rate

Poshmark charges a **flat $2.95 on a sale under $15, and 20% at $15 or more**,
on the item price only. That is a cliff, not a marginal band: the whole sale is
taxed by whichever rule applies. Two consequences the seller can act on, and
neither is visible in a headline-rate table:

- Below **$14.75** — where 20% would have been exactly $2.95 — the flat fee
  costs *more* than the percentage would. A $10 sale pays an effective 29.5%,
  a $5 sale 59%. That is often the worst rate on the whole comparison, and it
  is exactly the price band a closet clear-out lives in.
- Because the switch is at exactly $15.00, the price this page says Poshmark
  needs to reach a target profit can land on either side of it. The solver
  works both branches and returns the one that actually holds, rather than
  dividing by one rate and printing a price the fee schedule does not agree
  with.

This is also why [`../marketplace-fee-compare`](../marketplace-fee-compare/)
leaves Poshmark out and says so on the page: that tool ranks channels by a
single headline rate, and Poshmark does not have one. This page prices a
specific item at a specific price, where the cliff is exactly computable — so
the same fact that disqualifies Poshmark there is what makes it rankable here.

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
- **A monthly plan needs a volume reality check.** The table shows the minimum
  whole-order count needed for this item's economics to recover a subscription,
  or `—` when no order volume can recover it.
- **Per-sale profit is not monthly cash.** A direct sale that keeps $33 and
  happens four times a month loses to a marketplace that keeps $26 and happens
  forty times. Put expected sales on each channel; a monthly plan is spread
  over that same number so a $39 store plan on 20 sales is $1.95 a sale.
- **A completed sale is not the mix you live in.** A channel that lets you
  list higher can win on every completed order and still lose once you count
  its return rate, return postage, and units that cannot be sold again. The
  table ranks on expected keep after returns unless you turn that overlay off.
- **A sale you never make is worth nothing.** Ranking channels on what they pay
  per sale assumes every channel sells the item. They do not, and the ones that
  sell it slowly charge listing renewals and tie up your cash while they fail
  to. At the shipped defaults Etsy keeps $3.36 more per sale than eBay and is
  worth about a third as much per month of shelf.

## Using it

Open `index.html` in a browser, or serve the directory:

```sh
python3 -m http.server 8000     # then visit /ventures/where-to-sell-calculator/
```

Shared inputs (price, shipping, cost of goods, packaging, expected monthly
orders, plus how long you would leave it listed, what your cash is worth, and
what the item is still worth to you unsold) apply to every channel. Anything a channel does differently — a higher
price on Etsy, no postage on a local sale, an FBA fee on Amazon — goes in that
channel's own panel under the table, along with its rates. Channels can be
switched out of the comparison; "Other channel" starts switched off and blank
for anything not listed (Mercari, Depop, a craft fair, wholesale). Poshmark has
its own row, since the portfolio prices it in depth.

Entries are saved in your own browser so the page remembers them next time.
"Reset everything" clears them.

Use **Copy share link** to send a calculation to someone else. The link carries
only the numeric assumptions and channel settings needed to reproduce the table;
it does not include local usage counts or browser-saved data. Anyone with the
link can read those assumptions, so do not include confidential costs.

Use **Download comparison CSV** to take the ranked table into a spreadsheet.
The file has one row per compared channel and includes fees, keep, expected
keep after returns, monthly keep, days to sell, profit per day, orders to
cover a monthly plan, and the break-even / match-the-leader prices. It is
calculated results only — not your saved usage counts.

### Reading the table

Alongside net profit and margin, each channel reports two figures that answer
questions the ranking alone does not:

- **Break-even price** — how low you can list before the sale costs you money.
  This is the floor for a discount or a "best offer", and it is *different on
  every channel*, because a per-listing fee, a fixed payment fee and a share of
  a monthly plan all have to be recovered before a percentage fee is even
  covered. It turns red when your current price is already below it.
- **Return on cash** — profit against the cash you actually laid out to source,
  pack and ship. Fees come out of the sale rather than your pocket, so they are
  not counted as invested; that keeps the figure comparable across channels
  whose fee structures differ. It reads "—" when nothing was invested (a
  giveaway, or an item with no per-unit cost), rather than an infinite return.
- **Orders to cover plan** — the minimum whole-order volume needed to recover a
  monthly subscription from this item's profit before that plan. It is `0` for
  channels without a monthly plan and `—` when the economics cannot recover it.
- **Monthly keep** — per-sale profit times the sales you expect on that
  channel. Leave the per-channel field blank to use the shared monthly-orders
  figure. When volumes differ, the hero can name a different winner for the
  month than for a single sale.
- **You keep / day** — profit divided by the days you expect that channel to
  take to sell. A no-fee local sale can still lose this comparison if the item
  sits for a month while a marketplace sells next week. Each channel ships with
  an illustrative pace you are expected to replace with how long your last
  similar listings actually took. The column reads "—" when no pace is set,
  rather than inventing one.
- **After returns** — expected keep once some share of orders come back.
  Return postage, unsellable units, and fees the channel does not refund are
  counted on the returned share; a completed sale still keeps the sold profit.
- **Return drag** — the gap between a completed sale and that expected keep.
  It is the number that explains a ranking flip.

Margin answers "how good is this sale", return on cash answers "how hard is my
money working", break-even answers "how far can I move the price", cash
per day answers "do I wait on the cheaper channel or list where it moves",
and after returns answers "does the completed-sale winner still win in the
mix I actually ship".

On a narrow screen the comparison becomes one card per channel instead of a
wide table, with the channel as the card's heading and every figure on its
own labelled line. "Where should I sell this?" is often asked while standing
over the item — at a thrift store, a garage sale, a storage unit — so the
phone layout shows the same numbers rather than a table dragged sideways.

### The second table: what a listing is worth, not what a sale is worth

Everything above ranks a *sale*. A seller with stock is ranking a *listing*,
and a listing only pays out if it sells. The second table ranks the same
channels on that basis:

- **Sells within horizon / days to sell** — your two estimates, per channel.
  These matter more than any fee rate on this page and vary far more by
  category than by channel, so replace them from your own sold-listing history.
- **If it does not** — what a listing costs when it never sells: the
  per-listing fee charged again on every renewal cycle inside your horizon
  (an Etsy listing renews at four months), plus your cash tied up in the item
  for the whole time. Postage, packaging and fulfilment are *not* counted
  here — they are only spent on a sale, and they are already in the figures
  above.
- **One listing is worth** — the two outcomes weighted by sell-through.
- **Per 30 days** — that value spread over the shelf the listing actually
  occupies (shorter when it sells fast). This is what the second ranking uses,
  and it is why a cheaper, faster channel can beat a richer, slower one on the
  same inventory dollar.
- **Sell-through to match** — how often this channel would have to sell to
  earn the leader's rate. Read it as a test of your own estimate: at the
  shipped defaults Etsy needs 72.4% against its assumed 35%, so the ranking
  survives a large error. It reads "—" where no sell-through catches the
  leader.

The two rankings often disagree, and the page says so instead of picking. Take
the higher rate per 30 days when cash or shelf is your constraint; take the
higher keep when you have one item and nothing else the money would be doing.
`does-it-actually-sell-there.html` works one flip through in full.

## Carrying the item into a channel's own calculator

This page answers *which* channel. It does not answer what a promoted listing,
a return, or free shipping then does to that number — the channel's own
calculator in this portfolio does, with twenty-odd scenarios in it.

The gap between those two was retyping. Price, postage, what you paid,
packaging: enter it again or do not go. Most people do not go, so the deeper
tool sits unused and the comparison ends at a ranking nobody acts on.

So under the verdict, every channel that has a dedicated calculator **and** can
accept inputs from a link gets a "keep going with this item" link, built from
what is on screen. Today that is eBay, Etsy, Amazon, Mercari, Reverb, TikTok
Shop, Whatnot, Poshmark, StockX and an own store (Shopify); a channel gains
one the day its calculator learns to read a link.

**The handoff now runs both ways for every channel that has one.** Each of
`../ebay-fee-calculator/`, `../etsy-profit-calculator/`,
`../amazon-fba-calculator/`, `../reverb-fee-calculator/`,
`../shopify-fee-calculator/`, `../tiktok-shop-fee-calculator/`,
`../whatnot-seller-payout/`, `../poshmark-fee-calculator/`,
`../stockx-seller-payout-calculator/` and `../mercari-fee-calculator/`
carries its own item back into this page with
that channel already switched on (each ships its own `to-where-to-sell.mjs`,
mirroring this page's `handoff.mjs` in reverse). Reverb was first; eBay, Etsy,
Amazon and Shopify followed the same day. TikTok Shop and Whatnot followed
later, then Poshmark, StockX on 2026-09-22, and Mercari after that — each
calculator had already exported the field-name
contract this handoff needs (see each one's own `FIELD_IDS` / `INPUT_IDS`), but
none had a where-to-sell channel preset or a `to-where-to-sell.mjs` module
wired up, so a seller who landed on any of those pages first had no way into
this comparison at all, in either direction. Poshmark took longest because it
needed more than wiring: its fee is a cliff rather than a rate, so the ranking
engine had to learn to price, break even and solve for a target on whichever
side of $15 the item sits. This is the direct test of this venture's first
untested hypothesis — until now a seller who searched their way to a
single-channel calculator first (which, for the highest-traffic channels, is
the more likely entry point) had no way into this comparison without
retyping, so the "deeper scenarios never get opened" failure the hypothesis
names could happen from either direction and only one was fixed.

Two details that are not obvious:

- **A channel without a prefillable calculator gets no link at all**, rather
  than a link to a page that would quietly show its own defaults. A wrong
  number that looks like your number is worse than an extra click.
- **A cost the target has no field for is folded in, not dropped.** Etsy has no
  separate packaging input because packaging is part of what it calls
  materials, so packaging is added to `materialCost` on the way over. Dropping
  it would understate cost and overstate profit on arrival.
- **A number the target has no *concept* for is left out, and that is not the
  same thing.** Poshmark's buyer buys a prepaid label at checkout, so postage
  is neither seller revenue nor a seller cost and its calculator has no
  shipping input at all. Folding postage in anywhere would put it inside a
  payout that never sees it, so both shipping fields stay behind — and this
  page's own Poshmark preset starts them at zero for the same reason, so the
  row a seller sees here already agrees with the page they land on.
- **And when the target has no home for a cost that is genuinely real there,
  the right fix is to give it one, not to pick the least-wrong field.** StockX
  resellers pay for a box, tape, a replacement lace bag and label stock, and
  `../stockx-seller-payout-calculator/` had no bucket for any of it — so
  adding the StockX handoff meant adding an `otherCost` input there first.
  The alternative was folding packaging into a field labelled "shipping to
  verification", which preserves the total and prints a line the seller knows
  to be false; a tool that is wrong in a way the reader can see is worse than
  one that is merely incomplete. Its own round-trip test now asserts the net
  profit on the two pages is the same number.

Nothing is uploaded. The values ride in the URL fragment — the same mechanism
the "Copy share link" button already uses — which browsers never send to a
server, and they only travel inside your own browser as you follow the link.

Field names differ between calculators (`itemCost` here is `costOfGoods` on
eBay and `materialCost` on Etsy), and a name the receiver does not recognise is
*silently dropped* rather than raising an error. `handoff.test.mjs` therefore
imports each target's own field list and fails if a name stops matching, so
that drift breaks a test here instead of a number there.

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

Each channel ships with an **illustrative** days-to-sell figure, not a claim
about how fast your category actually moves there — how fast a channel moves
*your* category is an observation only you have. Replace it with how long your
last similar listings actually took. Leave it at zero (or blank) for a channel
you have not timed — that reads as unknown, and the channel simply sits out
the speed ranking rather than winning on a blank.

## What it deliberately does not model

Fees are the part that is easy to calculate, not the whole decision. You can
put your own expected sales on each channel so volume can flip the ranking.
Days to sell is your estimate of demand, not a measured marketplace statistic.
Returns and sell-through are inputs, not measurements: this has no way to know
how many buyers a channel puts in front of *you*, or how fast your items
actually move there. Every such rate is a starting point you replace with your
own return report and sold-listing history. A marketplace fee is also partly a
payment for demand you would otherwise have to create. Read the fee, volume,
cash-per-day, return and shelf-time gaps as inputs to the decision, not the
decision.

Also absent: warehouse or storage rent per unit (the FBA-style cost), price
decay on aging stock beyond the single "value you still have if it does not
sell" input, and any interaction between channels — listing the same unit in
two places at once is a real strategy this models as two separate questions.

`returns-change-the-ranking.html` works the Amazon-vs-eBay flip in full;
`does-it-actually-sell-there.html` works the margin-versus-turnover flip.

## Tests

```sh
node --test
```

Covers each channel's fee shape, monthly-plan amortisation (including the
refusal to divide a plan by zero orders), per-channel overrides, break-even and
target-profit solving round-tripping through the calculator, ranking and the
gap against the best channel, per-channel expected volume and the case where
monthly cash ranks a different winner than a single sale, the switched-off-channel
rule, input validation, profit-per-day from expected days to sell (including
the refusal to invent a pace when days are missing), the case where the
fastest channel is not the highest-fee-profit channel, and the usage
counter's opt-out, Do Not Track / Global Privacy Control, and hostile-storage
behaviour.

`handoff.test.mjs` checks the links into the channel calculators, against
each target's *own* field list imported from that venture — so a rename
there fails a test here rather than silently dropping a number there.

`handoff-arrival.check.mjs` is the browser half: it opens each of the 13
target calculators with a handoff link in Chromium and reads the inputs back,
so a target that renames an input id or stops reading the URL fragment fails
there. Not part of `node --test` (it needs a browser and a local server; usage
is in the file header). Last run 2026-10-18: 13 of 13 arrive with the values
sent.

`page.test.mjs` adds structural checks on `index.html` itself, because
`calc.test.mjs` imports `calc.mjs` directly and never looks at the page. It
asserts that the results table declares exactly as many columns as the row
template emits cells (a mismatch silently renders every value under the wrong
heading), that every figure named in the page's schema.org `featureList` is
actually rendered, and that the fields which can be `null` are rendered
defensively.

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
`channel_rates_edited`, `channel_toggled`, `subscription_toggled`,
`channel_volume_edited`, `returns_compared`, `shelf_time_compared`,
`share_link_copied`, `comparison_csv_downloaded`, `handoff_ebay`, `handoff_etsy`,
`handoff_amazon`, `handoff_reverb`, `handoff_own-store`, `handoff_tiktok`,
`handoff_whatnot`, `handoff_poshmark`, `handoff_walmart`) and the
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

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do not
use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

## Cost and support

$0 to run: static files, no inference, no paid API, no database. Free with the
full feature set — there is no paid tier and no gated feature.
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional and
changes nothing about what the tool does.

MIT licensed.

## Host your own copy

Your data stays in your browser either way, but you can serve the page from an address you control. It is a static
site: the server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
