# Stair Lift Bid Calculator

A free browser calculator for accessibility contractors and
aging-in-place remodelers. It prices a stair-lift / chair-lift
install the way the trade actually loses money — straight
one-flight versus mid-landing versus outdoor versus a curved
custom-bent rail, perch versus standard versus power-swivel
versus power-pack versus heavy-duty, then wood versus concrete
versus open-riser attach, folding rail, circuit, and pull-out —
and shows the margin before the price goes out.

**After using this, you can now** send a walk-away stair-lift
price that sees the rail and the chair, **which used to take**
matching a published $3,995 installed special that treats a
straight indoor rail as the same job as a curved-plus-circuit
install.

**Open [`index.html`](index.html) directly in a browser**, or serve this
directory statically. It is a self-contained, zero-dependency page: no build
step, no network calls, no accounts. Not yet deployed to a public URL —
publishing under the portfolio's name is owner-gated per
[`portfolio/DIRECTION.md`](../../portfolio/DIRECTION.md) — but it is ready to
deploy as-is.

```bash
# Serve it locally
npx http-server ventures/stair-lift-bid-calculator -p 8080
# Run the tests
cd ventures/stair-lift-bid-calculator && node --test
```

## The problem it solves

Owners shop contractors on a Facebook special: **$3,995 stair
lift installed**. Those numbers cannot see the rail or the chair.

- **Straight one-flight** is a kit rail on one run of stairs.
- **Straight with a landing** is a second piece. **Outdoor
  straight** is a weatherized rail. **Curved** is a template
  and a custom bend.
- **Standard seated** is the cheap special. **Perch** is
  cheaper. **Power swivel** is the last-minute upgrade.
  **Power-pack** adds a powered footrest. **Heavy-duty** is
  weight rating.
- **Folding rail, extra charge point, dedicated circuit,
  existing-lift removal, permit, and weather kit** are their
  own tickets. They do not live in a $3,995 dump.

Matching a cheap straight-rail quote on a curved-plus-circuit
job is how a sold aging-in-place install becomes a loss when
the custom rail and the electrician eat the margin.

This is distinct from a **wheelchair ramp** (carpentry:
rise-to-run, landings, slope — a platform, not a chair on a
rail), a **walk-in tub** (bathroom plumbing and an alcove), a
**walk-in shower** (tile, slope, glass), an **entry door**, and
a **home elevator** (a shaft). This prices a stair lift.

## How it works

1. **Stair.** How many lifts, plus travel miles.
2. **Rail.** Straight one-flight, landing, outdoor, or curved —
   hours and the rail invoice.
3. **Chair.** Perch, standard, power swivel, power-pack, or
   heavy-duty — hours and the chair invoice.
4. **Attach.** Wood treads, concrete, or open-riser — hours and
   the hardware invoice.
5. **Extras.** Folding rail, extra charge point, dedicated
   circuit, existing-lift removal, permit, weather kit.
6. **Loaded labor.** Hourly wage × (1 + payroll burden %).
7. **Price.** (Direct cost + overhead) ÷ (1 − target margin %), because
   margin is a share of the customer's price.

It then reports price per lift, effective hourly rate, the hour
split, a four-rail comparison on the same stair, a five-chair
comparison on the same stair (the power-swivel upgrade versus
the standard special), and the **walk-away price**. Entering a
price already on the table scores it against the same cost
base. **Copy bid summary** turns the result into a plain-text
draft ready to paste into a proposal.

The arithmetic lives in [`calc.mjs`](calc.mjs). See
[`calc.test.mjs`](calc.test.mjs).

Search phrase: [`how-much-to-charge-to-install-a-stair-lift.html`](how-much-to-charge-to-install-a-stair-lift.html).

## Privacy

Everything runs in your browser. Your data is never uploaded, and we don't
have accounts, tracking cookies, or an analytics vendor. We count anonymous
events (which features get used, nothing about who used them) — see
[Usage](#usage) to turn it off.

## Usage

The only thing stored is an anonymous local tally of which features were
used and the current date, in `localStorage` under
`stair-lift-bid-usage` — never the rail, wages, costs,
or prices. It is opt-out from the footer, and it is skipped automatically
when the browser sends Do Not Track or Global Privacy Control. See
[`usage.mjs`](usage.mjs) and
[`portfolio/usage/`](../../portfolio/usage/README.md).

Events counted: `bid_calculated`, `preset_applied`, `rail_changed`,
`chair_changed`, `attach_changed`, `proposed_price_compared`,
`summary_copied`.

## Limitations

- Single currency and no tax or HOA-color handling.
- One rail type per bid. A second flight is another lift count,
  not a polygon of the house.
- Starting rail, chair, and attach rates are ballpark figures, not a
  catalog.
- Accessibility clearances, structural engineering, and medical
  device fitness are not designed here — that is the contractor,
  the manufacturer, or the building official.

## Disclaimer

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not building-code, accessibility,
medical-device, legal, tax, or financial advice, and it
does not replace a qualified professional. **You are responsible for
reviewing and verifying its output before relying on it**, and for meeting
any obligation it helps you prepare for. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising
from its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to survive,
export your inputs and run it yourself.

MIT licensed — see [`LICENSE`](LICENSE).
