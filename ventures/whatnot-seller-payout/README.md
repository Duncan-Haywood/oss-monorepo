# Whatnot Seller Payout Calculator

A free browser tool that prices one Whatnot lot the way a payout statement
actually lands: commission on the hammer, payment processing on the checkout
total (item + buyer-paid shipping + tax) plus the flat 30 cents, leftover
after the label and what the lot cost you, and whether eating the label is
cheaper than paying processing on the postage. Nothing is uploaded; the
arithmetic runs on the visitor's own device.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/whatnot-seller-payout/

```
cd ventures/whatnot-seller-payout && node --test
```

Open `index.html` in a browser to use it — there is no build step.

## Why it exists

Whatnot's published US schedule is two lines, not one. Commission is a
percentage of the item's final sale price. Processing is 2.9% + $0.30 of
what the buyer paid at checkout. A "$50 sale costs $5.75" worked example is
on Whatnot's own help page. A $20 TCG card with $5 buyer-paid shipping is
not in that example, and it is not 8% of $20.

Two things this tool computes that a flat "Whatnot takes 8%" page misses:

**Processing on shipping and tax.** Buyer-paid postage is in the checkout
total. 2.9% of that postage is a fee you pay even when the label itself
washes out. Offering free shipping drops that slice and puts the label on
leftover instead. The cheaper path depends on the hammer and the label, not
on a rule of thumb.

**The $1,500 cap on selected categories.** Comics, TCG, sports singles, and
toys currently commission 8% only up to $1,500 of the hammer; the portion
above is 0%. A $2,400 graded lot is not 8% of $2,400. Coins run 4% with the
same cap. Rates are inputs — replace the preset with the line on your own
statement.

## What it does not do

It is not Whatnot's live fee schedule, a Seller Hub, a show planner, or tax
advice. It does not connect to Whatnot, submit a listing, or tell you what
to start a lot at. Presets are labelled starting points from a published
help article; they expire and they vary by region. Verify every figure
against your own payout statement before you price a show.

## First visitor

r/whatnot and r/whatnotapp, where "what do I actually keep after fees" is a
recurring weekly thread, and the search phrases "whatnot seller fees",
"whatnot fee calculator", and "whatnot commission 2026". Incumbent pages
either restate the headline 8% or run the $50 example without the
shipping-base trap or the $1,500 cap.

## Save and share your numbers

Retyping the category preset, your rates, and the lot every time you price a
show is the retyping this tool's own kill criteria asks whether a seller will
put up with twice in 90 days — so it keeps the form for you:

- **Restored on return.** Your category preset, rates, and lot are saved in
  your browser and reappear the next time you open the page. **Reset to
  defaults** clears them and puts back Whatnot's published $50 TCG example.
- **Shareable link.** **Copy shareable link** writes your current inputs into
  the page URL and copies it. A link's values always take precedence over
  whatever a browser had saved, because opening a link means you meant to see
  that lot.

The link and the saved copy contain only the numbers and preset you chose.
They travel in the URL's fragment (`#...`), which a browser never sends to a
server or a `Referer` header, so nothing is uploaded either way.

## Comparing this lot against other channels

Whatnot's commission-on-the-hammer-plus-separate-processing shape does not
fit the fixed-fee retail model the [marketplace fee compare](../marketplace-fee-compare/)
uses for eBay, Etsy, Amazon, Walmart, TikTok Shop and Shopify, so it stays out
of that ranking. The [where-to-sell calculator](../where-to-sell-calculator/)
models Whatnot the way this page does and ranks it against eBay, Etsy, Amazon,
Reverb and an own store, plus what each is worth per day of wait and per
month of shelf time. The link at the bottom of this page carries this lot's
sale price, shipping and cost over automatically — no retyping — via
[`to-where-to-sell.mjs`](to-where-to-sell.mjs), the reverse of that page's own
`handoff.mjs`. `to-where-to-sell.test.mjs` decodes the link through that
page's own decoder so a shape change there fails a test here instead of
arriving as a silently wrong number.

## Privacy

Everything runs in your browser. Hammers, costs, and leftovers are never
uploaded and never appear in a usage count — those are anonymous tallies of
which features were used, stored locally, including `handoff_where_to_sell`
when you follow the where-to-sell link (the lot itself is never counted). We
don't have accounts, tracking cookies, or an analytics vendor.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not legal, tax, financial, or selling
advice, and it does not replace a qualified professional. **You are
responsible for reviewing and verifying its output before relying on it.**
To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. Do not use
this as a system of record.

MIT licensed — see [`LICENSE`](LICENSE). Optional
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support does
not change what the tool does.

## Host your own copy

Your data stays in your browser either way, but you can serve the page from an address you control. It is a static
site: the server only hands out files and never sees a figure you type.

- **Docker:** `docker compose up -d`, then open <http://localhost:8080> (`Dockerfile` is nginx plus the page's files).
- **Fly.io:** `fly launch --copy-config --no-deploy --dockerfile Dockerfile`, then `fly deploy` (`fly.toml`).
- **Render:** deploy from your fork with `render.yaml` (static site, no paid plan needed).
- Nothing runs on the author's accounts. The Docker image has not been built in the session that added these files,
  so build it once and open the page before relying on it. Tests: `node --test deploy.test.mjs`.
