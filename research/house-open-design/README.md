# house-open-design: what does an open, reproducible plan set for a 480 sq ft backyard cottage (ADU) look like when it is generated from code?

Ninth milestone of track 12, open-source residential construction (`PROJECTS.md`). One command generates a plan set for a small accessory dwelling unit (a 24 x 20 ft, one-bedroom, 480 sq ft cottage): a floor plan and south elevation as SVG, a framing bill of materials as CSV, an IFC4 model, and a report with the lateral (wind and seismic) check, envelope energy and a cost index. It adds no new engineering. It composes the track's earlier models ([`house-plan`](../house-plan), [`house-spans`](../house-spans), [`house-framing`](../house-framing), [`house-structure`](../house-structure), [`house-energy`](../house-energy), [`house-cost`](../house-cost)) on one concrete design, to see whether they fit together and where they break. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-open-design/

**Headline.** The 24 x 20 ft plan passes every layout rule and member check in the track's models and needs 2,614 board feet of framing (5.45 bf/sq ft). Its two south and north walls, with 6.5 ft of solid wall each between openings, carry 1,164 lb of wind per line at 6 in nailing under house-structure's assumed coefficients; a tighter envelope (advanced 2x6 wall with R-5 foam, R-49 attic, U-0.27 windows, 3 ACH50, R-30 floor) cuts modelled heating and cooling cost by 36% to 37% against a 2x4 / R-30 / U-0.35 / 5 ACH50 baseline in every climate tested ($72 to $158 a year, assumed prices). Everything rests on the sibling models' assumptions; this is a worked example, not a buildable design.

**Builds on.** The six sibling projects above, and IfcOpenShell for the IFC. Prior art on open building designs: WikiHouse and Open Source Ecology (open licences, builder-facing documents). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** This is research code. Structure, fire, egress and energy are life-safety or code matters. Nothing here has been reviewed by a licensed architect or engineer, or checked against any building code, and a real house needs both, plus a permit, before anyone builds from it. The room rules are paraphrased from the IRC from memory and were not checked against the text. Foundation, roof framing connections, hold-downs, plumbing, electrical, mechanical, fire separation, stairs and site work are absent.

## Licence
Code: MIT (`../LICENSE`). The generated plan set in `experiments/` (drawings, bill of materials, report, IFC): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). You may copy, change and build from it, with credit. The licence grants rights in the files; it is not a warranty, it does not make the design safe or code-compliant, and it gives no right to any third party's code or tables.

## Use it
```bash
cd research/house-open-design
python experiments/run.py        # writes the plan set into experiments/ (about a second)
```
`experiments/` then holds `floor-plan.svg`, `south-elevation.svg`, `bom.csv`, `report.md`, `summary.json` and, if `ifcopenshell` is installed, `adu.ifc`. To change the plan, edit `ADU` in `src/house_open_design/plan_set.py` (`house_plan.plan.Params`).

## Method
- **Plan, takeoff, rules, IFC:** `house-plan`, unchanged. The parameters were picked by hand from its search result (24 in studs and a 4:12 roof use the least lumber) and checked, not searched.
- **Drawings** (`drawings.py`): the floor plan is drawn from the plan's rooms, walls and openings, with door swings drawn into the room each door serves; the elevation from the south wall's openings and the pitch. Both are plain SVG strings, labelled "Not for construction".
- **Lateral check** (`analysis.lateral`): `house-structure`'s wind pressure, base shear and nailing capacity, applied to this plan's own exterior walls (openings taken from the plan, not house-structure's default house). Piers narrower than height/3.5 do not count; interior partitions get no credit; hold-down and overturning checks are not done. The maximum wind speed is found by scaling demand with V squared. house-structure's roof rise is fixed at 4:12 over 28 ft, slightly high for this 24 ft building, so it errs conservative.
- **Envelope energy** (`analysis.envelope`, `annual_energy`): `house-energy`'s degree-day method and constants, with areas taken from this plan. Whole-wall R comes from `house-framing`'s takeoff. The floor sits over a vented crawlspace with an assumed batt derate (0.9) and R-2 for films and subfloor, which is this project's assumption, not house-energy's slab. Climates are `house-energy`'s eight stand-ins (four shown).
- **Cost index** (`analysis.cost_index`): `house-cost` with area 480, one storey, aspect 1.2, with and without a lot price. It reports an index (reference house = 100), never dollars, because `house-cost` has no dollar anchor.

## Reproduce
```bash
cd research/house-open-design
PY=$(python3 ../../platform/ci/pyenv.py pytest ifcopenshell | tail -1)   # ifcopenshell needs Python 3.13
$PY -m pytest -q tests          # 15 tests (the IFC test skips without ifcopenshell)
$PY experiments/run.py
```

## Results (from `experiments/report.md`; deterministic except the IFC's timestamp and ids)
- **Plan:** living 24 x 10 ft (240 sq ft), bedroom 18 x 10 (180), bath 6 x 10 (60). All layout rules and member checks pass. Members: 2x4 studs at 24 in, 2x8 joists at 16 in over a 2x10 girder on four posts, 2x10 rafters, 2x12 ceiling joists spanning the full 24 ft (no central wall), 2x12 ridge. 2,614 bf of lumber, plus 22 sheets of wall, 19 of roof and 15 of subfloor sheathing.
- **Lateral** (115 mph, Sds 0.5, house-structure's assumed coefficients): south and north walls, 6.5 ft of full-height wall each, need 6 in edge nailing for 1,164 lb of wind and 290 lb of seismic per line (the limit is about 188 mph at that nailing); east and west walls, 16 ft each, need 6 in nailing for 1,023 lb (about 322 mph). Seismic never governs.
- **Envelope:** baseline UA 155.7 Btu/h F, tight 98.8. Annual heating and cooling cost with a heat pump (assumed $0.16/kWh): Houston $195 to $123, Baltimore $297 to $189, Chicago $364 to $231, Minneapolis $433 to $275. Gas furnace plus AC (assumed $1.30/therm) is $175 to $111 in Houston and $325 to $206 in Minneapolis. The windows are the largest single loss in the tight package (31 of 99 Btu/h F).
- **Roof option** (added 2026-10-18, from `house-truss`): the stick roof (2x10 rafters, 2x12 ceiling joists over the full 24 ft, 2x12 ridge) is 1,070 board feet; 11 lightest-passing W trusses at 24 in (2x6 top and bottom, 2x4 web, 60.6 bf each) are 667 bf, 38% less roof lumber, at an assumed 30 psf ground-snow roof load on plan. Lumber only: plates, bracing, waste, the heel detail and a truss manufacturer's sealed design are not counted, and `house-truss` has not been checked against a truss design program.
- **Cost index:** 54.0 with a lot and 37.5 on one's own lot (reference 100 for a 2,000 sq ft two-storey house); 225 and 156 per sq ft against 100. Treat it as a lever, not a price (below).

## Limitations
- **The composition found rough edges rather than agreement.** `house-structure` and `house-energy` were written around the 28 x 40 ft `house-framing` house, so the lateral and energy numbers here re-derive areas from this plan but reuse constants (roof rise, ground coupling, infiltration rule) fixed for that house.
- **Cost is an index extrapolated** from a model fitted to a 2,000 sq ft house; ADUs have real fixed costs (utilities, permits) that its fixed/area splits only approximate. No first cost, no price, no dollars for the envelope upgrade, so "saves $72 to $158 a year" is not a payback.
- **The takeoff's 2x12 ceiling joists over 24 ft** are what house-spans' unverified design values allow; a real design would use trusses or a bearing wall. The takeoff ignores waste, hangers, fasteners and sheathing waste.
- **The plan is one stylised rectangle** with no kitchen, no closet, no accessibility, no stair or porch, doors in fixed places and uneven windows on the south wall. The IFC was checked by entity counts and has not been opened in a BIM viewer; it holds walls, openings, doors, windows and a slab, not studs.
- Every figure inherits the limits of the six sibling projects, including unverified design values, interior walls given no shear credit, degree-day climates from memory, and every price assumed.

## Next steps
Price the BOM line by line (`house-cost`'s next step) so the envelope upgrade has a payback; price the truss option against the stick roof; give the plan a kitchen and closets and let the search move them; add a foundation and hold-down sizing; export studs and plates to IFC and open the file in FreeCAD; take it to a licensed engineer.

## Owner steps
Everything physical or professional: a licensed architect's or engineer's review and stamp, the local code's prescriptive path or an engineered design, a permit, site and foundation design, and any construction. No purchases were made or priced.

## Outside dependencies (vitamins)
Python, pytest, IfcOpenShell (optional, for the IFC). All numbers come through the six sibling projects. A real plan set also needs a surveyed site, soils, a foundation design, plumbing, electrical and mechanical drawings, and a licensed reviewer, none of which this project can make.
