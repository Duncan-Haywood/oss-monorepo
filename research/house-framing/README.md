# house-framing: how much lumber, labour and heat does advanced framing save in a house's exterior walls, and does it still carry the roof?

First project of track 12, open-source residential construction (`PROJECTS.md`, milestone 1). Framing is 16.6% of the construction cost of an average new US single-family home (NAHB, *Cost of Constructing a Home*, 2024). Optimum value engineering (OVE), or "advanced framing", is a set of measures the NAHB Research Foundation developed for HUD in the 1970s to frame with less wood. Some of its measures are now in the model codes, but builders still use few of them (Home Innovation Research Labs). This project is an open, testable takeoff of a stylised house's exterior walls under conventional and advanced framing. It counts every stud, plate, header, cripple and block, then computes the whole-wall R-value and the NDS structural checks that decide whether the lighter frame is enough. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-framing/

**Builds on.** The OVE measures as HUD's guideline describes them, NDS allowable-stress design for the stud and header checks, and the parallel-path method for the whole-wall R-value. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method (`src/house_framing/model.py`)
- **House** (`House`, `walls_of`): 28 x 40 ft, one storey, 8 ft walls (97 1/8 in plate height), trusses spanning the 28 ft width onto the two long walls. Eight 36 x 48 in windows, a 38 in door and a 74 in slider, spaced evenly. Six partitions meet the exterior walls.
- **Schemes** (`Scheme`): *conventional* means studs at 16 in, a double top plate, 4-stud corners (2 studs over the wall ends), 3-stud partition tees, a jack each side of every opening and a 2-ply 2x12 header over every opening. *Advanced* adds nine measures (`OVE_MEASURES`): 24 in spacing, a single top plate (trusses in line over studs), 2-stud corners, ladder blocking at tees, header hangers instead of jacks, the smallest 2-ply header that passes, a single flat 2x over openings in non-bearing walls, foam between header plies, and the left king stud of each opening on the layout.
- **Takeoff** (`frame_wall`, `takeoff`): lays out studs on the module and removes those in each opening's king-to-king zone. Studs inside the rough opening become cripples below the sill, and above the header where there are 3 in or more. Board feet are nominal, plus 10% waste. Plates are cut from 16 ft stock. Pieces are cut members, a rough proxy for labour.
- **Structure**: stud combined axial and bending check, NDS 3.9.2, with the column stability factor (Ylinen, c = 0.8) for strong-axis buckling. The sheathing braces the weak axis. Bearing on the plate is checked too. ASCE 7 ASD combinations D+S (C<sub>D</sub> 1.15), D+0.75(0.6W)+0.75S and D+0.6W (C<sub>D</sub> 1.6). Headers: bending, shear, L/240 total-load deflection and bearing on the jacks. Spruce-pine-fir No. 2: Fb 875, Fv 135, Fc⊥ 425, Fc 1150 and E 1,400,000 psi from NDS Supplement Table 4A as reprinted by NELMA. E<sub>min</sub> 510,000 psi is from the NDS Appendix D formula. The size factors are the NDS Table 4A values.
- **Thermal**: parallel paths through the cavity (R-13 in 2x4, R-20 in 2x6), the solid wood (R-1.25 per inch) and the headers (R-5 per inch foam between plies when insulated), plus air films, 1/2 in gypsum and 7/16 in OSB. Wall UA covers opaque wall only.

## Reproduce
```bash
pip install pytest
cd research/house-framing
python -m pytest -q tests                        # 11 tests
PYTHONPATH=src python experiments/run.py         # under a second; writes experiments/results.txt
python experiments/figure.py                     # experiments/ablation.svg from results.txt
```

## Results (from `experiments/results.txt`; deterministic)
| scheme | pieces | board feet | framing factor | whole-wall R | wall UA (Btu/h F) | stud ratio at 30 psf snow |
|---|---|---|---|---|---|---|
| conventional 2x4 @16 | 210 | 1258 | 0.237 | 11.3 | 82.8 | 0.40 |
| conventional 2x6 @16 | 210 | 1805 | 0.238 | 16.2 | 57.3 | 0.26 |
| advanced 2x6 @24 | 154 | 1052 | 0.134 | 18.6 | 49.9 | 0.39 |

- **Lumber.** Advanced 2x6 framing used 42% less exterior-wall lumber than conventional 2x6, and 16% less than conventional *2x4*, while insulating 40% better than the 2x4 wall. The saving holds across footprints from 24 x 32 to 36 x 56 ft (42 to 43%). It is large because this conventional baseline is generous: 2x12 headers everywhere, 4-stud corners and 3-stud tees. A leaner baseline would show less.
- **Which measures matter** (experiment B, figure). Added alone to conventional 2x6, 24 in spacing saved 210 bf, the single top plate 132, header hangers 141, ladder tees 82, 2-stud corners 68, sized headers 59 and flat headers in non-bearing walls 48. Foam in the headers saved no wood but cut wall UA by 2.0 Btu/h F, the largest thermal gain of any single measure. Putting openings on the layout saved 8 bf at 16 in and cost 22 bf at 24 in in this model, where a king stud usually replaces a layout stud anyway.
- **Money is mostly labour and floors and roof, not wall studs.** At assumed $0.60 to $1.20 per board foot (not sourced), the wall-lumber saving is $450 to $900 per house. NAHB's framing stage averaged about $71,000 in 2024 (16.6% of $428,215), and that includes labour, floors, roof and sheathing, none of which this model counts. The 27% cut in pieces is the better hint at what advanced framing saves, through labour, but the model has no labour rate and claims no labour dollars.
- **Energy is a small effect.** Advanced 2x6 walls cut heat loss through the opaque walls by 0.9 MMBtu a year relative to conventional 2x6, at an assumed 5,000 heating degree-days. Going from 2x4 to 2x6 framing, about 3 MMBtu a year at the same climate, matters more.
- **Structure.** At 30 psf roof snow, a 2x6 at 24 in carries the roof at 39% of capacity, about what a 2x4 at 16 in does (40%). With 30 psf of wind on the wall it stays at or below 0.90 up to 90 psf of roof snow. A 2x4 at 24 in reaches capacity at about 50 psf of snow with wind, which is why the codes pair 24 in spacing with 2x6 studs for loaded walls. Sized headers (experiment D): a 2-ply 2x6 carries a 36 to 48 in opening at 30 psf. The 74 in slider needs a 2x10, and at 50 psf a 2x12. No 2-ply header carries a 98 in opening at 30 psf or more under the L/240 limit used here. That opening needs a 3-ply, LVL or engineered header, which this model does not size. The conventional 2-ply 2x12 over a 36 in window works at 56% of capacity, now that its jack bearing is checked on the header's 3 in width (see Corrections).

## Corrections
- **2026-10-17, jack bearing.** `house-spans` found that the header bearing check took the jack's bearing area as 1.5 in x the stud depth (8.25 in<sup>2</sup> for a 2x6 wall). A 2-ply header is 3 in wide, so a jack bears on 1.5 x 3 = 4.5 in<sup>2</sup>. `header_check` now uses `min(header width, stud depth)`, and the conventional scheme adds jacks per side (up to 4) where one jack is overstressed, which happens only at the 74 in slider. Effect: conventional pieces 208 to 210, conventional 2x6 lumber 1789 to 1805 bf, the advanced saving 41.2% to 41.7%, and the conventional 2x12 over a 36 in window 0.31 to 0.56 of capacity. Advanced framing uses hangers, so its headers and lumber are unchanged.

## Limitations
- **Stylised and not a design.** One house shape, evenly spaced openings, trusses in line over studs and nothing above them. Results are not a code check. The model does not compare against IRC prescriptive tables, which are copyrighted, and it has not been reviewed by a licensed engineer. A wall built from it needs one, or the local code's prescriptive path.
- Exterior walls only. Floors, roof, sheathing, interior walls, nails, connectors, drywall backing and hold-downs are not counted. The 16 header hangers advanced framing needs are counted but not priced or checked; their capacity comes from the maker's tables.
- Lateral design (shear walls, bracing and hold-downs) is out of scope, though 24 in spacing and fewer studs at corners affect it. The stud wind check uses one strength-level face pressure, with no component and cladding zone or exposure calculation.
- The parallel-path R-value ignores thermal bridging through fasteners and the 2-D heat flow at corners. This model's framing factors are nominal. Carpenter and Schumacher (2003) audited 180 houses under construction because handbook and code values ranged from 10% to 25%; their measured values are not reproduced here, and comparing against them is a next step.
- Prices and climates are assumptions, shown as ranges. No lumber price here is sourced.

## Next steps
Lateral bracing and shear-wall checks (track milestone 5's FEA or the wind-and-seismic tables done from first principles). Floors and roof in the takeoff. A labour model from published time-and-motion data, if an openly licensed source exists. A comparison against measured framing factors. Two-storey walls, where studs at 24 in carry a floor.

## Owner steps
None required. Building a wall, or having a licensed engineer review the sized headers and stud checks, are owner steps if the numbers are to be used on a real house.

## Outside dependencies (vitamins)
Python, pytest. The NDS design values, the OVE measures and the NAHB cost shares come from outside the model; the R-values are typical handbook figures.

## References
- NAHB Research Foundation for HUD (1978/79). *Reducing Home Building Costs with OVE Design and Construction*. HUD Office of Policy Development and Research, Guideline 5. <https://www.huduser.gov/PORTAL/sites/default/files/pdf/Reducing-Home-Building-Costs.pdf> (catalogue record checked 2026-10-16; the PDF was not read in full)
- Home Innovation Research Labs. *Advanced Framing: An Examination of its Practical Use in Residential Construction*. <https://HomeInnovation.com/trends_and_reports/featured_reports/advanced_framing_-_an_examination_of_its_practical_use_in_residential_construction> (summary checked 2026-10-16)
- NAHB (2025). Cost of Constructing a Home in 2024. <https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/> (checked 2026-10-16: construction 64.4% of a $665,298 average price; framing 16.6% of construction cost; NAHB says the sample is not representative)
- American Wood Council. *National Design Specification for Wood Construction* and its Supplement (2018 and 2024 editions), Table 4A. SPF No. 2 values as reprinted in NELMA, *Base Design Values for SPFs and SPF*, <https://www.nelma.org/wp-content/uploads/2022/06/Base-Design-Values-for-SPFs-and-SPF.pdf> (checked 2026-10-16)
- Carpenter, S. C., Schumacher, C. (2003). Characterization of framing factors for wood-framed low-rise residential buildings. *ASHRAE Transactions* 109 (RP-904). <https://basc.pnnl.gov/library/characterization-framing-factors-wood-framed-low-rise-residential-buildings> (record checked 2026-10-16; full text not read)
- ASCE 7, *Minimum Design Loads*, ASD load combinations (2.4). Not re-read for this project.
