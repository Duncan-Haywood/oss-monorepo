# house-spans: how far can a 2x joist, rafter, header or beam span, and what limits it?

Second project of track 12, open-source residential construction (`PROJECTS.md`, milestone 2). Span tables for floor joists, ceiling joists, rafters and headers are how a builder picks lumber, and the common ones sit in copyrighted code books. This is an open sizing tool for simple-span sawn-lumber members, derived from beam formulas and National Design Specification (NDS) base design values, with no table copied. It checks bending, shear, deflection and bearing, says which check governs, and runs from a command line. Produced with AI assistance (Claude).

**Builds on.** NDS allowable-stress design (bending, shear, bearing, size and repetitive-member factors, load duration), ASCE 7 minimum live loads, and the stud and header checks of [`house-framing`](../house-framing). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** Structure is life safety. This tool is research code: it has not been reviewed by a licensed engineer or checked against the published span tables, and it does not show that anything complies with a building code. A real member needs a licensed engineer's or architect's review, or the local code's prescriptive path, and a permit, before anyone builds from it.

## Use it
```bash
cd research/house-spans
PYTHONPATH=src python -m house_spans.cli table --case floor            # span table, SPF No. 2
PYTHONPATH=src python -m house_spans.cli span --size 2x10 --spacing 16 # one member's longest span and what governs it
PYTHONPATH=src python -m house_spans.cli size --span 14 --case floor   # smallest 2x that carries 14 ft
PYTHONPATH=src python -m house_spans.cli span --size 2x12 --plies 2 --spacing 180 --case roof-snow30  # header, 15 ft tributary
```
Cases (`CASES` in `model.py`): `floor` (10 dead + 40 live psf, L/360 live and L/240 total), `floor-sleeping` (30 live), `ceiling` (5 + 10, L/240), `roof-snow30` and `roof-snow50` (15 dead, L/180). Species: `SPF` and `DF-L`, No. 2 grade. For a header or beam, `--spacing` is the tributary width in inches and `--plies` is 2 or 3.

## Method (`src/house_spans/model.py`)
- Simple span under uniform load, design span = clear span + bearing length (NDS 3.2.1).
- **Bending** fb = M/S against F<sub>b</sub>&prime; = F<sub>b</sub> C<sub>D</sub> C<sub>F</sub> C<sub>r</sub>. C<sub>r</sub> = 1.15 for a single member at 24 in or less; none for built-up headers. Lateral stability factor taken as 1.0, so the compression edge must be held (sheathing, blocking); `lateral_note` prints what NDS 4.4.1 asks for at the member's depth-to-breadth ratio.
- **Shear** fv = 1.5V/A with V taken at distance d from the support face (NDS 3.4.3.1).
- **Deflection** 5wL<sup>4</sup>/384EI against L/x on live load alone and on total load. Optional 1.5 creep factor on dead load. A pitched rafter takes loads on plan; bending is unchanged and perpendicular deflection grows by 1/cos<sup>2</sup>&theta; (derived in the tests). Ridge thrust and axial load are ignored.
- **Bearing** R/(b l<sub>b</sub>) against F<sub>c&perp;</sub>, with no bearing-area factor.
- `max_span` bisects on the span (every ratio grows with span), so it is exact to 0.01 ft. `size_member` returns the smallest 2x size that passes.
- Values: SPF and DF-L No. 2 (F<sub>b</sub> 875 and 900, F<sub>v</sub> 135 and 180, F<sub>c&perp;</sub> 425 and 625, E 1.4 and 1.6 million psi); size factors C<sub>F</sub> 1.5, 1.3, 1.2, 1.1, 1.0 for 2x4 to 2x12. The SPF numbers match `house-framing`, which took them from NELMA's reprint of NDS Supplement Table 4A. **The DF-L numbers were not checked against a copy of the Supplement.**
- Worked check, in the tests: 2x10 SPF at 16 in under 10 + 40 psf has w = 66.7 plf, S = 21.39 in<sup>3</sup>, F<sub>b</sub>&prime; = 1107 psi, so M<sub>allow</sub> = 1973 ft-lb and bending allows 15.38 ft of design span (15.25 ft clear). Live deflection allows 15.67 ft design span. Bending governs, and the tool agrees.

## Reproduce
```bash
pip install pytest
cd research/house-spans
python -m pytest -q tests                        # 13 tests
PYTHONPATH=src python experiments/run.py         # under a second; writes experiments/results.txt
python experiments/figure.py                     # experiments/floor_spans.svg from results.txt
```

## Results (from `experiments/results.txt`; deterministic)
- **Floor joists, SPF No. 2** (figure): the longest clear spans at 16 in are 9 ft 2 in (2x6), 12 ft 1 in (2x8), 15 ft 3 in (2x10) and 17 ft 8 in (2x12). Going from 16 to 24 in costs 2x10 joists 2 ft 10 in.
- **What governs.** Over 32 size/spacing/species cells, floors are governed by bending in 22 and live-load deflection in 10. Ceiling joists are governed by total-load deflection in 31 of 32, and snow-loaded rafters by bending in 29 of 32. At 50 psf snow bending governs all 32. Shear and bearing never govern a joist or rafter.
- **Deflection limits are policy, and they only bind some members.** For a 2x10 at 16 in, dropping the live-load limit from L/360 to L/240, or removing deflection limits entirely, leaves the span at 15 ft 3 in, because bending already governs. Tightening to L/480 cuts it to 14 ft 1 in. The 1.5 creep factor on dead load changes nothing for this joist. A lone joist without the 1.15 repetitive factor spans 14 ft 3 in.
- **Least lumber for a floor span** (experiment C, SPF). The cheapest passing joist is not 2x10 at 16 in. It is the deepest, widest-spaced one that passes: 2x8 at 24 in at 10 ft (0.67 board feet per sq ft), 2x10 at 24 in at 12 ft (0.83), 2x12 at 24 in at 14 ft (1.00), against 1.25 for 2x10 at 16 in. The saving over 2x10 at 16 in is 20% to 50% of joist lumber at 8 to 14 ft and none at 16 ft. **This ignores floor vibration and subfloor span**, which in practice are why builders use 16 in; the tool does not check either.
- **Headers on a bearing roof wall** (30 psf snow, 15 ft tributary, 3 in bearing): a 2-ply header needs 2x6 up to 4 ft, 2x8 at 5 ft, 2x10 at 6 ft, 2x12 at 7 ft and none at 8 ft, where a 3-ply 2x10 works.
- **Cross-check with `house-framing`.** Its header sizes (2x6, 2x6, 2x8, 2x10, 2x12 for 3 to 7 ft) match this tool's for 3 to 5 ft. At 6 and 7 ft they differ because `house-framing` takes the jack stud's bearing area as 1.5 in x 5.5 in (8.25 in<sup>2</sup>), but a 2-ply header is 3 in wide, so a 1.5 in jack bears on 4.5 in<sup>2</sup>. On 4.5 in<sup>2</sup> a single jack per side is overstressed at those spans (about 460 psi against 425 psi allowed at 6 ft). This was an error in `house-framing`'s header bearing check; it was fixed on 2026-10-17 (see that README's Corrections), and its headline lumber saving moved from 41.2% to 41.7%.

## Limitations
- **Not validated against published tables.** The ICC and AWC tables are copyrighted, so none is copied and none was read for this run. A reader with the IRC span tables can compare them with `table`; differences should be explained by the table makers' load, deflection and species assumptions, which this tool states. That comparison is the first next step.
- Dry service, normal temperature, no wet-use, flat-use, incising or temperature factors. No lateral-stability factor (support assumed). No point loads, cantilevers, continuous or multi-span members, notches or holes. No floor vibration, no ponding, no roof ridge thrust, no wind uplift. Sawn 2x lumber only: no LVL, glulam, I-joists or trusses.
- Header bearing assumes the length you give (1.5 in = one jack), and no hanger capacity.
- Loads are the usual minimum assumptions, not a load calculation for any site. Snow, wind and seismic loads depend on location (ASCE 7).
- Two species at one grade. DF-L values unchecked (above).

## Next steps
Compare with the published IRC span tables for the same inputs. Add Southern Pine and hem-fir, and the other grades. Continuous spans over a beam. Floor vibration, which is what often governs a real floor. Point loads and cantilevers. Beam sizing in engineered lumber. Fix `house-framing`'s header bearing check. Feed this tool to `house-plan`'s framing takeoff.

## Owner steps
None required. A licensed engineer's review of any member before a house is built is an owner step.

## Outside dependencies (vitamins)
Python, pytest. The NDS base design values, size factors, load-duration factors and ASCE 7 live loads come from outside the model.

## References
- American Wood Council. *National Design Specification for Wood Construction* and its Supplement (2018 and 2024 editions), Table 4A, and NDS sections 2.3.2 (load duration), 3.2.1 (span), 3.3 (bending), 3.4.3.1 (shear), 3.10 (bearing), 4.3 (adjustment factors) and 4.4.1 (lateral support). Section numbers cited from memory of the 2018 edition; the standard was not read for this run.
- SPF No. 2 values as reprinted in NELMA, *Base Design Values for SPFs and SPF*, <https://www.nelma.org/wp-content/uploads/2022/06/Base-Design-Values-for-SPFs-and-SPF.pdf> (the same source `house-framing` used, checked there 2026-10-16).
- ASCE 7, *Minimum Design Loads and Associated Criteria*, Table 4.3-1 (residential live loads). Not re-read for this project.
- [`research/house-framing`](../house-framing), this repository: the stud and header checks this tool extends.
