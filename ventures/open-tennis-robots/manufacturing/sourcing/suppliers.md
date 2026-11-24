# Fabrication, assembly and fulfilment options (read 2026-11-24)

Published terms only. Every line was read from a search engine's summary of
the linked page on 2026-11-24 (the supplier hosts do not resolve from this
container), so confirm each on the live page. No account was opened, no
quote requested, no supplier contacted.

## On-demand fabrication

| Service | 5052 at 3 mm / ~5 mm | Minimum | Lead time | Pricing published? |
| --- | --- | --- | --- | --- |
| [SendCutSend](https://sendcutsend.com/materials/5052-aluminum/) | 5052-H32, 0.040 to 0.500 in; one page lists 0.125 and 0.190 in, another 0.187: confirm in the quote tool | "No minimum quantities" | 2 to 4 days production | Instant quote; no per-part price. Part size 0.25 x 0.375 in to 30 x 44 in ([6061 page](https://sendcutsend.com/materials/6061-aluminum)) |
| [OSH Cut](https://www.oshcut.com/materialdetails/aluminum-5052-h32) | 5052-H32 page lists 0.02 to 0.1 in only; **3 and 5 mm not found** | Not stated | 2 business days standard ([2D laser](https://www.oshcut.com/services-copy-2/2d-laser-cutting)) | Instant quote |
| [Xometry](https://www.xometry.com/capabilities/sheet-metal-fabrication/aluminum-fabrication/) | 5052-H32, 0.020 to 0.500 in | "No minimums" | 3 business days standard per one page, varies ([FAQ](https://www.xometry.com/resources/blog/answers-to-most-frequently-asked-questions/)) | Instant quote |
| [Protolabs](https://www.protolabs.com/services/sheet-metal-fabrication/aluminum/) | 5052, 0.024 to 0.250 in | Not found | 3 days Express, 5 Select, +1 to 2 per finish ([lead times](https://www.protolabs.com/help-center/lead-times/)) | Online quote with DFM |
| [PCBWay](https://www.pcbway.com/rapid-prototyping/Sheet-metal/sheet-cutting.html) | 5052 and 6061; standard to 3.0 or 4.0 mm, laser page says 0.5 to 10 mm; **5 mm to confirm** | Not found | 3 to 5 business days | RFQ |
| [JLCCNC](https://jlccnc.com/capabilities/sheet-metal-fabrication) | 5052, 0.5 to 6.0 mm | Not stated | "As fast as 1 day" | Launch notice: "minimum price $0.4", scope unstated ([notice](https://jlccnc.com/news/sheet-metal-online-announcement)) |
| [JLC3DP](https://jlc3dp.com/) (printing) | PA12 SLS among others | Not stated | From 2 business days | "From $0.30" on one page, "from $1.00" on others; **no PETG price found** |

For a club product the laser parts suit SendCutSend or Xometry in the US and
JLCCNC if parts and assembly sit in China; the choice follows where assembly
happens, to avoid shipping plates twice.

## Contract manufacturing (box build)

| Assembler | Published terms | Fit |
| --- | --- | --- |
| [PCBWay](https://www.pcbway.com/oem/electronics-manufacturing.html) | Box build, electromechanical assembly, testing, burn-in, direct shipping to end users. Assembly MOQ 1 piece in the [help centre](https://www.pcbway.com/helpcenter/pcb_assembly_ordering/What_s_the_min_quantity_of_assembly_.html), "as low as 5" elsewhere. No markup on turnkey parts. No box-build price | Can also cut the plates and print the parts: one supplier for the whole robot |
| [MacroFab](https://macrofab.com/box-build-assembly) | "No minimum order quantities or long-term contracts" ([platform](https://www.macrofab.com/platform)); box build listed under "No minimum (or maximum!)" ([industries](https://macrofab.com/industries)); 1-year guarantee on box builds; online estimator | US assembly; the plates and prints would be bought in |
| [Seeed Fusion](https://wiki.seeedstudio.com/service_for_fusion_one_stop/) | One-stop manufacturing, warehousing and fulfilment; PCBA 1 to 8,000 pieces; project quotes by email. No box-build MOQ published | Manufacturing and fulfilment in one place |
| [Fictiv](https://www.fictiv.com/welding-assembly-capability) | Mechanical assembly for "high-mix, low-volume"; no MOQ or price published | Mechanical side only |

None publishes a box-build price; each needs an account and an RFQ, which
are owner steps.

## Fulfilment

The robot ships with a lithium pack of about 256 Wh (24 V nominal, 8 cells of
3.2 V = 25.6 V, x 10 Ah; arithmetic, not a source), above the 100 Wh line
that 49 CFR 173.185 treats differently. Every 3PL and marketplace will ask
for the pack's UN 38.3 test summary.

| Option | Published terms |
| --- | --- |
| [ShipBob](https://www.shipbob.com/ecommerce-fulfillment/fulfillment-costs/) | Storage $5 per bin, $10 per shelf, $40 per pallet a month ([onboarding guide, 2020](https://www.shipbob.com/wp-content/uploads/2020/06/1.-Intro-to-ShipBob-ShipBob-Onboarding-Guides.pdf)); first 4 or 5 picks free (pages disagree); dangerous goods carry extra charges, amount not published |
| [ShipMonk](https://shipmonk.com/pricing) | Monthly minimum = monthly orders x first-item pick fee, less 20%; no lithium fee published |
| [Amazon FBA](https://sellercentral.amazon.com/gp/help/external/200383420) | UN 38.3 test summary uploaded at ASIN setup; watt-hours and lithium content on the listing; SDS or exemption sheet ([DG documentation](https://sellercentral.amazon.com/help/hub/reference/external/G34151), [review](https://sellercentral.amazon.com/gp/help/external/G201749580)). The venture's listing tool (`../../sell/README.md`) already marks missing items BLOCKING |
| Assembler ships direct | PCBWay and Seeed Fusion both list direct shipping to end users (above) |

For tens of units to clubs, the assembler shipping direct is the least
handling; a 3PL earns its fees only once orders are steady.
