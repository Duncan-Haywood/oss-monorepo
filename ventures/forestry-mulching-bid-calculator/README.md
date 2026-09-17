# Forestry Mulching Bid Calculator

A browser worksheet for owner-operators bidding forestry mulching and land
clearing work. Static ES modules, no build step, no dependencies, no network
requests.

- **[`index.html`](index.html)** — the calculator.
- **[`how-much-to-charge-for-forestry-mulching.html`](how-much-to-charge-for-forestry-mulching.html)** —
  a worked 3-acre job, line by line.
- **[`calc.mjs`](calc.mjs)** — all the arithmetic, exported and unit-tested.
- **[`usage.mjs`](usage.mjs)** — the anonymous, opt-out, device-local counter.

```
node --test
```

## What it is for

After using this, you can quote a mulching job from your own acres per
machine-hour, which used to be a per-acre number carried over from the last lot
and hoped about.

The trade quotes in dollars per acre and then reasons in dollars per acre. The
machine is paid for by the hour. What sits between the two is the **production
rate** — acres per machine-hour — and that rate is not a property of the lot's
size. It is a property of what is standing on it.

On the shipped 3-acre example, one flat **$1,000 per acre** quote:

| what is standing | acres / hr | machine hours | break-even / acre | profit at $1,000/acre |
|---|---|---|---|---|
| light brush, saplings under 2 in | 0.506 | 5.9 | $313.57 | **$2,059.29** |
| medium brush, 2–4 in | 0.236 | 12.7 | $593.08 | $1,220.76 |
| heavy brush, 4–8 in | 0.112 | 26.7 | $1,169.57 | −$508.70 |
| heavy understory, 8–12 in | 0.056 | 53.4 | $2,270.13 | **−$3,810.40** |

A **$5,869.69 spread on one quote**, with the acreage unchanged. It compounds
because two things move at once: the advance speed falls by about three, and
the number of passes needed to bring the mat to a finished particle size rises
by about three. Three times three is the nine times the machine time.

The other two things the worked example shows:

- **Carbide teeth and the machine payment are $47.20 of a $123.70 machine
  hour** — more than fuel and the service reserve combined, and both are
  routinely absent from a hand-written quote. Teeth arrive as one bill months
  after the jobs that caused them; the payment is owed whether the machine
  turns or not.
- **Mobilization does not scale with acreage.** The same $207.00 trailer trip
  is 29% of the price on a half-acre lot and 2% on a ten-acre one, so the
  honest per-acre price runs from $838.12 to $1,443.20 on nothing but lot size.

## The arithmetic

Production rate is swath geometry and nothing else:

```
acres/hr = head width (ft) × advance (ft/min) × 60 × cutting share
           ──────────────────────────────────────────────────────
                        43,560 × passes
```

`advance` is forward progress **while cutting**, scaled by a terrain factor
(100% = flat, open, dry). `cutting share` is the part of the clock hour the
drum is actually in material rather than repositioning, refuelling or walking a
boundary. `advanceSpeedForAcresPerHour` inverts the whole thing, so an operator
who has timed a finished lot can enter their measured rate and see what speed
it implies on their own head width.

The rest:

```
machine hours   = acres / acres per hour
cost per hour   = operator + fuel + teeth + service reserve + ownership
  teeth         = set cost / set life hours
  ownership     = (monthly payment + annual insurance / 12) / billable hours a month
mobilization    = trips × (hours × operator rate + miles × truck cost per mile)
total cost      = machine hours × cost per hour + mobilization + other
price           = cost / (1 − margin)
price per acre  = price / acres          ← an output, read last
```

## Stated limits

These are on the pages themselves, not only here.

- **The density presets are starting points to overwrite, not survey data.**
  Real production moves with the carrier's horsepower and hydraulic flow, the
  head, the species mix, moisture and the operator — by more than the gap
  between two of the four classes. A rate you timed beats any published one,
  including these.
- **Stumps are not in it.** Mulching takes standing material down and leaves a
  mat; it does not remove a stump below grade. If the customer's idea of
  "cleared" includes grubbing, that is a different machine and a separate line.
- **Stems above the head's rating are not in it either.** The tool flags the
  gap between the largest stem on the lot and what the head is rated for, and
  says to price those separately or exclude them in writing. It does not
  estimate the felling time — see
  [`tree-service-bid-calculator`](../tree-service-bid-calculator/) for that
  half of the same lot.
- **Nothing about the site's permissions.** Permits, burn rules, stream and
  wetland buffers, erosion control, protected species, property lines, buried
  and overhead utilities: none of it is arithmetic and none of it is here.
  This is a quoting worksheet, not a determination that the work may be done.
- **Margin is taken on price** (`cost / (1 − margin)`), not as a markup on cost
  (`cost × (1 + markup)`). On the shipped example the two differ by $335.32.

## Privacy

Nothing is uploaded. The page makes no network request of any kind; there is no
account and no server. What a one-machine operation pays for fuel, what it owes
on the machine, how many hours a month it really bills and the margin it quotes
at are the commercially sensitive core of that business, so no figure the
worksheet touches is written anywhere but the page in front of the person
typing it.

The optional usage counter records only an event name and the day, in the
visitor's own browser. It is opt-out from the page and switches itself off for
browsers sending Do Not Track or Global Privacy Control.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or
implied. It is not forestry, engineering, environmental, legal, tax or financial
advice, and it does not replace a qualified professional. **You are responsible
for reviewing and verifying its output before relying on it**, for checking the
site yourself, and for meeting every obligation that applies to the work. To the
maximum extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

## Licence

MIT — see [`LICENSE`](LICENSE). Free and open source;
[sponsorship](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.
