---
kind: analysis
date: 2026-11-24
subjects: [open-tennis-robots]
---
# open-tennis-robots: collector made manufacturable on paper (agent note, 2026-11-24)

Part of the 2026-11-24 hardware revamp (open hardware as long-term goals for
hardware companies that outsource the physical work). Work is in
`ventures/open-tennis-robots/manufacturing/sourcing/`.

- **Robot chosen: the collector.** It throws nothing, has no pickup motor, and
  its fab package is complete; the feeder launches balls at up to ~47 m/s.
- **Sourced BOM:** `collector_bom_sourced.csv`, 30 lines, 24 priced with
  supplier part numbers and URLs. `cost_rollup.py` gives **$827 / $792 / $790
  per unit at 10 / 100 / 1,000** for priced bought-in parts. The 100 and 1,000
  figures are upper bounds because pages publish breaks only to about 100.
  Fabricated parts, most small fasteners, labour, freight and certification
  are not in the total.
- **Evidence grade: every price is `search_snippet`.** This container could
  not resolve Digi-Key, Mouser, Pololu, Adafruit, McMaster, SendCutSend or JLC
  (curl got code 000, WebFetch got ENOTFOUND). Figures come from search-engine
  summaries of the cited URL on 2026-11-24. **The next run with access must
  re-check each row live** and change the tag to `live_page`.
- **Four CAD fit gaps found** (in the sourcing README): the wheel is 144 x 29
  where the CAD has 150 x 40, the rod is 1/8 in in a 3.2 mm hole (0.025 mm
  clearance, so it will not fit), the mast is 3/4 in in a 20.4 mm bore, and
  the M4 insert is 4.7 mm against 5.7 mm. They need a CAD run, which was out
  of this run's scope.
- **The biggest cost lines:** the Schneider e-stop at about $125 and the
  battery with charger at $229.99. No UN 38.3 statement was found for the
  Bioenno pack.
- **Certification:** FCC 15B SDoC plus module integration costs $1,500 to
  $5,500 on cited vendor ranges. UN 38.3 runs $500 to $7,000 unless the pack
  maker supplies it. No published price was found for UL 3300, 62368-1 or
  62133. CE RED $300 to $4,000; UKCA GBP 1,500 to 4,000.
- **Owner decisions** (sourcing README): hardware form (open, kit or
  assembled), entity, insurance, first prototype budget, markets and all
  supplier accounts. Nothing was ordered, quoted or contacted.
- Deviation: no blog post, because the brief limits files to `manufacturing/`
  and this report. The tests (`test_cost_rollup.py`) live beside the script,
  outside the venture's CI-discovered `tests/`, so CI does not run them. Run
  them with `python3 -m unittest test_cost_rollup` from that folder.
