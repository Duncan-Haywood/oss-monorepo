# Collector: manufacturable on paper (2026-11-24)

The plan to make the ball-collecting rover a product for **tennis clubs and
coaches**, run with as little in-house physical work as possible: bought
parts from distributors, fabricated parts from on-demand services, assembly
and fulfilment outsourced. **Paper only.** Nothing has been ordered, no
supplier account exists, no quote has been requested and no supplier has
been contacted.

**How far to trust the numbers.** This container's network blocks every
supplier host (Digi-Key, Mouser, Pololu, Adafruit, McMaster, SendCutSend,
JLC and others did not resolve on 2026-11-24). Every price here was read from
a search engine's summary of the page in its row, on 2026-11-24, and is
tagged `evidence=search_snippet`. Nothing is invented and every figure has
its URL, but none was confirmed on a live page, some summaries were cached
and two pairs disagreed (noted per row). **Re-check each row on the live
page before spending money.** That re-check is the first item for any run or
person with access to those hosts.

## Why the collector

The venture has two robots. The collector is the lower-risk one to sell
first:

- it throws nothing. The feeder launches balls at up to about 47 m/s
  (`../../hardware/safety.md`), which brings projectile guarding, a catch net
  that is a sail in wind, and coasting 150 mm wheels;
- its fab package is complete and checked: 7 laser parts (10 pieces), 6
  printed designs (10 pieces), every fastener, a 14-step assembly guide
  (`../collector/`, `../../README.md`, "Manufacture it");
- it has no pickup motor: a rolling rod-cage drum traps balls, so the moving
  parts are two drive wheels and the drum;
- the buyer is clear. A club or coach running a ball machine or a basket
  feed spends court time picking up balls; the collector holds about 118
  (`../collector/README.txt`).

It is still a 24 V lithium robot that drives near people, with two radios,
so it carries a real compliance list ([`certification.md`](certification.md)).

## Files

| File | What |
| --- | --- |
| [`collector_bom_sourced.csv`](collector_bom_sourced.csv) | One row per BOM line: supplier, supplier and maker part numbers, URL, date read, pack size, MOQ, up to four price breaks, fit notes |
| [`cost_rollup.py`](cost_rollup.py) | Rolls the CSV up to a per-unit cost at 10, 100 and 1,000 builds; `--check` fails on a priced row with no URL or date. Stdlib only |
| [`test_cost_rollup.py`](test_cost_rollup.py) | `python3 -m unittest test_cost_rollup` |
| [`suppliers.md`](suppliers.md) | Fabrication services, contract manufacturers and fulfilment, with their published terms |
| [`certification.md`](certification.md) | Certification gap list with cited costs |

## Unit cost (bought-in parts that have a published price)

`python3 cost_rollup.py`, 2026-11-24:

| Group | per unit @10 | @100 | @1,000 |
| --- | ---: | ---: | ---: |
| drive | $157.07 | $135.62 | $135.62 |
| drum | $42.50 | $42.50 | $42.50 |
| electronics | $221.85 | $216.92 | $216.92 |
| fasteners | $26.42 | $22.22 | $22.22 |
| frame | $9.39 | $9.39 | $9.39 |
| power | $229.99 | $229.99 | $229.99 |
| safety | $140.09 | $135.06 | $133.07 |
| **Priced total** | **$827.31** | **$791.70** | **$789.71** |

Not in the total (no published price found): battery_strap, laser_parts,
m5_rivet_nut, other_fasteners, pi_active_cooler, printed_parts.

How to read it:

- **These are upper bounds at 100 and 1,000.** The rollup uses only breaks a
  page published; most retail pages stop at 25 or 100, so the 1,000 column is
  the 100 price. Real volume pricing has to come from distributor quotes,
  which this plan does not request.
- **The two biggest lines are the e-stop and the battery.** The Schneider
  XB5AS8442 e-stop at about $125 is a sixth of the priced total; a
  certified 22 mm NC mushroom from a cheaper line is the first cost cut to
  look for. The battery-and-charger bundle ($229.99) is retail; a pack
  maker's quote at 100+ would differ, and must come with a UN 38.3 test
  summary.
- **Fabricated parts are not in it.** No service publishes a per-part price
  for these DXFs and STLs; the number comes from running the package through
  an instant quote (SendCutSend, Xometry, JLCCNC), which takes an account.
  `../../hardware/bom-collector.csv` carries a $140 laser and $25 print
  planning estimate from an earlier run; it is not a quote.
- Excluded too: assembly labour, test, packaging, freight, duties, payment
  fees, warranty reserve and certification (below).

## Fit gaps the sourcing found

Four bought parts differ from what the CAD (`../../cad/otr_cad/params.py`)
was drawn around. Each needs either a CAD parameter change and a package
rebuild (`python -m otr_cad collector`) or a different part. They are left
for a CAD run: this one is scoped to `manufacturing/`.

| Part | CAD | Sourced | Consequence |
| --- | --- | --- | --- |
| Drive wheel | 150 x 40 mm (`wheel_d`, `wheel_w`) | Pololu 3281, 144 x 29 mm | Ride height and the drum's ground-contact check change; rebuild with 144/29 or find a 150 x 40 non-marking wheel |
| Drum rods | 3.0 mm (`rod_d`), disc holes 3.2 mm | 1/8 in (3.175 mm) music wire | 0.025 mm clearance: rods will not go in. Rebuild with `rod_d` 3.175 or source 3 mm metric wire |
| Mast tube | 20 mm OD (`mast_d`), socket bore 20.4 mm | 3/4 in (19.05 mm) | Loose by 0.7 mm a side; the socket's grub screw holds it, or rebuild with 19.05 |
| M4 heat-set insert | 5.7 mm long, 5.6 mm pocket | 4.7 mm long | Seats 0.9 mm deeper; check thread engagement |

Also open: the camera cable found is 500 mm, not the BOM's 1 m; the
battery's dimensions were not published against the 80 x 180 x 100 mm bay;
the relay standing in for the contactor needs its DC break rating checked
against two stalled gearmotors.

## Which parts are fabricated, and how

| Part (qty) | Process | Material | Services that list it ([`suppliers.md`](suppliers.md)) |
| --- | --- | --- | --- |
| base plate (1), drum discs (2), yoke arms (2) | Laser or waterjet, flat, no bends, no tapping | 5052 aluminium 5 mm (0.190 in) | SendCutSend (5052 to 0.500 in; confirm .190 vs .187), Xometry, Protolabs (to 0.250 in), JLCCNC (0.5 to 6 mm) |
| electronics tray, rod clamp rings (2), drum cover, drum hatch | Same | 5052 aluminium 3 mm (0.125 in) | Same, plus PCBWay (to 3 or 4 mm standard) |
| motor clamp cradles and caps (4), pivot blocks (2), switch towers (2), caster adapter, mast socket | FDM print, or SLS | PETG (as designed); PA12 SLS is a common service alternative but changes the insert pockets' behaviour, so check | JLC3DP, PCBWay, Xometry |
| drum rods (18), mast tube | Cut to length from stock | Music wire, aluminium tube | In-house or the assembler; a single cut each |

All seven laser parts are clearance-hole-only flat profiles by design, so any
2D laser service can make them; none needs bending, tapping or welding.

## Owner decisions

What only the owner can decide or do. None is asked here; this is the list
for when the collector is chosen to go further.

1. **Whether to sell hardware at all, and in what form.** Options, in order
   of compliance surface: (a) keep it open hardware and let builders and
   sellers carry it (`../../sell/README.md`), (b) sell a kit of fabricated
   parts with no battery, (c) sell an assembled, tested robot. Clubs will
   want (c); (c) carries every item in [`certification.md`](certification.md).
2. **Entity.** A company to be the manufacturer of record, hold insurance,
   sign with an assembler and own the FCC SDoC responsibility. Not something
   an agent can open.
3. **Product liability insurance.** Published averages for small businesses
   run about $42 to $68 a month, and about $1,200 a year for small
   manufacturers ([`certification.md`](certification.md), "Insurance"); a
   lithium robot that drives near people will be rated on a quote, not an
   average.
4. **First prototype spend.** One prototype is the priced bought-in parts at
   single quantity (about $830 by the rollup at 10, a little more at 1),
   plus the laser and print quotes, plus the unpriced fasteners. A
   reasonable first budget is that, approved by the owner, for one robot
   built and run by a person, because a first build "will find things"
   (`../collector/README.txt`). The four fit gaps above should be fixed in
   CAD first.
5. **Certification budget and markets.** US only first (FCC SDoC, UN 38.3
   via the pack maker) is the smallest set; EU and UK add CE/RED and UKCA.
6. **Accounts.** Distributor, fabrication-service, assembler and 3PL
   accounts all need a card and an identity: owner only.

## Next steps that do not need the owner

- Re-check every row on its live page from a network that reaches the
  supplier hosts, and replace `search_snippet` with `live_page`.
- Price the remaining fasteners, the strap and the M5 rivet nuts in USD.
- Fix the four fit gaps in CAD and rebuild the package.
- Find a cheaper certified e-stop and a 1 m Pi 5 camera cable.
- Find a pack maker that publishes a UN 38.3 test summary and IEC 62133
  status for a 24 V 10 Ah LiFePO4 pack that fits the bay.
