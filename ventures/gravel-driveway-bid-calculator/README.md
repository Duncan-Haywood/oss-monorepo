# Gravel Driveway Bid Calculator

A free browser calculator for excavation and landscape shops. It prices a
gravel drive the way the trade actually loses money — compacted depth to
tons, then whole truckloads, soil prep, fabric, and a street apron — and
shows the margin before the price goes out.

**After using this, you can now** send a walk-away gravel-driveway price
that sees trucks and dirt work, **which used to take** matching a published
$4-a-foot special that treats a 4-inch crusher-run pickup on ready grade as
the same job as 8-inch excavate-and-haul.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/gravel-driveway-bid-calculator -p 8080
# Run the tests
cd ventures/gravel-driveway-bid-calculator && node --test
```

## The problem it solves

Homeowners shop excavation shops on a Facebook special: **$4 a square foot
installed** or **$45 a ton dumped**. Those numbers cannot see the depth or
the dirt.

- Quarries sell **whole truckloads**. A 600 sq ft, 4-inch pad after 25%
  compaction is about 14 tons — one 16-ton load leftover. An 8-inch
  excavate job on 1,120 sq ft is several leftover tons on the last truck.
- **Ready grade** is a site walk. **Grade-and-compact** is a crew morning.
  **Excavate-and-haul** adds dump tickets and roughly twice the dirt hours.
- **Crusher-run, clean stone, recycled concrete, and pea gravel** are
  different quarry invoices and different spread rates. Pea gravel migrates
  and lays slower.
- **Fabric, a street apron, a culvert, and slope** are their own tickets.
  They do not live in a per-foot special.

Matching a cheap 4-inch pickup on an 8-inch excavate-and-haul drive is how
a sold job becomes a two-day loss after the first dump ticket.

This is distinct from **asphalt paving** (hot-mix tons, mill, overlay),
**concrete driveway pours** (cubic yards of slab), **sealcoat** (coats and
cracks), and **paver patio** (interlocking units and a sand setting bed).
This prices loose stone.

## How it works

1. **Drive.** Length × width, then finished compacted depth.
2. **Tons.** Loose cubic yards × (1 + compaction %), then × tons per yard.
3. **Trucks.** Ordered tons ÷ tons per truck, rounded up on quarry
   delivery. You pay for the leftover tons on the last load.
4. **Dirt and stone.** Grade hours from the method; spread hours from the
   stone. Slope adds 20% to those two only.
5. **Extras.** Fabric with overlap, street apron, culvert, dump tickets,
   delivery trips.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per square foot, price per ton, effective hourly
rate, the hour split, a four-stone comparison on the same drive, and the
**walk-away price**. Entering a price already on the table scores it against
the same cost base. **Copy bid summary** turns the result into a plain-text
draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-for-a-gravel-driveway.html`](how-much-to-charge-for-a-gravel-driveway.html).

## Come back to a bid

**Copy link to this bid** puts every number you entered into the URL after the
`#`, and reopening that link restores them. It is how you get back to a bid
tomorrow, and how you hand one to whoever prices with you.

Browsers never send a fragment to a server &mdash; not in the request, not in
the `Referer` header a click through to another site would carry &mdash; so the
link keeps the same promise as the rest of the page: nothing you typed is
uploaded. Anyone holding the link can read the numbers in it, so treat it like
the bid itself.

Nothing is written to the link that is not on the page. The snapshot is taken
from the form itself rather than from a list of field names, so a field added
to this calculator later travels the day it ships &mdash; a field silently
missing from a link is a wrong price for the recipient, not an error message.

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under `gravel-driveway-bid-usage`
— never the drive, wages, costs, or prices. It is opt-out from the footer,
and it is skipped automatically when the browser sends Do Not Track or
Global Privacy Control. See [`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `stone_changed`,
`prep_changed`, `delivery_changed`, `proposed_price_compared`,
`summary_copied`, `bid_link_copied`,
`bid_link_opened`.

## Limitations

- Single currency and no tax or permit handling.
- One rectangular drive. Odd shapes are the compaction percent, not a
  polygon.
- Starting quarry rates are ballpark figures, not a catalog.
- Drainage is a culvert checkbox — not a full civil design.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not excavation, civil, drainage,
construction, legal, tax, or financial advice, and it does not replace a
qualified professional. **You are responsible for reviewing and verifying
its output before relying on it**, and for meeting any obligation it helps
you prepare for. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
export your inputs and run it yourself.

MIT licensed — see [`LICENSE`](LICENSE).
