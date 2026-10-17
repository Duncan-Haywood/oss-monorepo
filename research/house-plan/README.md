# house-plan: can a house plan be data, and which plan needs the least lumber per square foot?

Third project of track 12, open-source residential construction (`PROJECTS.md`, milestone 3). A single-storey house plan is a few parameters (footprint, bedrooms, roof pitch, member spacing). From them the code builds rooms, walls and openings, takes off the framing, writes a bill of materials, checks the layout against room-size and light rules, and exports an IFC4 model through IfcOpenShell. Then a search looks for the plan with the least framing lumber per square foot of floor, against a random-search baseline and the exhaustive answer. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-plan/

**Headline.** With at least two bedrooms, the best plan in a 182,520-plan grid needs 4.8 to 5.2 board feet of framing lumber per sq ft of floor at 640 to 1,024 sq ft, then 5.9 at 1,216 sq ft, and no stick-framed plan in the grid reaches 1,400 sq ft. At 1,000 to 1,150 sq ft a (1+1) local search finds the exact optimum in 36 of 40 runs with 2,000 evaluations and random search in none (median gap 0.000 against 0.207 bf/sq ft).

**Builds on.** [`house-spans`](../house-spans) (joists, rafters, girders and headers are sized by its NDS checks) and [`house-framing`](../house-framing) (studs by its column check). IfcOpenShell for the IFC export. Prior art on plans as code: parametric BIM scripts, and OVE framing (NAHB Research Foundation, 1978/79) for why lumber per sq ft is the right first number. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Not a design.** This is research code. The plan is a stylised rectangle with a fixed layout; structure is life safety, and the layout rules are paraphrased from the IRC from memory (the code text is copyrighted and was not consulted). Nothing here has been reviewed by a licensed architect or engineer or checked against any building code, and a real house needs both, plus a permit, before anyone builds from it.

## Use it
```bash
cd research/house-plan
PYTHONPATH=src:../house-spans/src:../house-framing/src python -m house_plan.cli --width 28 --depth 28 --beds 2
PYTHONPATH=src:../house-spans/src:../house-framing/src python -m house_plan.cli --width 32 --depth 28 --pitch 4 --stud-oc 24 --joist-oc 24 --ifc house.ifc   # needs ifcopenshell
```
The command prints the room sizes, the members chosen, the bill of materials (count x size x length, board feet, sheets of sheathing), the lumber per sq ft, and any failed check; it exits 1 if any fail.

## Method
- **Plan as data** (`plan.py`). `Params` makes a `Plan` of `Room`, `Wall` and `Opening` records in feet. Layout: a living/kitchen zone along the front; along the back a zone of depth `bed_depth` holding `n_bed` equal bedrooms and a 6 ft bathroom. Doors and windows are placed from the parameters (windows spread evenly, one or two per bedroom). The ridge runs front to back and the roof bears on the two side walls.
- **Takeoff** (`takeoff.py`). Per wall: three plates, studs at the spacing outside the openings, two corner studs on exterior walls, and per opening two kings, jacks, a 2-ply header, cripples and (windows) a sill. Bearing-wall headers are sized by `house_spans` (roof-snow30, half the span plus a 1 ft overhang as tributary width, one jack a side, then two if bearing governs); non-bearing openings get an assumed doubled 2x4 that is not checked. Bearing-wall studs are the smaller of 2x4 and 2x6 that passes `house_framing.stud_check`. Floor joists span the depth if a 2x joist can, otherwise half of it over a 3-ply girder on posts 8 ft apart. Rafters are sized by `house_spans` (30 psf snow, ceiling not attached). Ceiling joists span the width, or half of it over a bearing wall down the middle, which the takeoff then adds as lumber (3 plates and studs, no openings; it is not drawn in the plan or the IFC model). Sheathing is area over 32 sq ft with no waste.
- **Layout rules** (`rules.py`). A 120 sq ft habitable room, 70 sq ft and 7 ft in each direction for bedrooms, glazing at least 8% of each habitable room's floor, an egress window per bedroom (5.7 sq ft net, 24 in clear height, 20 in width, sill at most 44 in; net opening assumed 80% of the frame), plus a geometry check that openings fit their wall with 0.5 ft between neighbours. A failed member (no 2x header, joist or rafter can do the job) also makes a plan infeasible.
- **IFC** (`ifc.py`). IFC4 in metres: an `IfcWall` per wall, an `IfcOpeningElement` voiding it with an `IfcDoor` or `IfcWindow` filling it, and one `IfcSlab`. The tests read the file back and count the entities; one run also checked the walls' world-coordinate bounding boxes against the plan. Studs and plates are not separate members, and the file was not opened in a BIM viewer.
- **Search** (`search.py`). Nine parameters on a grid (footprint 16 to 40 ft each way, 1 to 3 bedrooms, bedroom zone depth, window width, roof pitch, and 16 or 24 in spacing for studs, joists and rafters). Score = net framing board feet over floor area, with infeasible plans scored 100 plus their violations. A plan must have floor area from the target to 1.15 times it (so the search cannot win by building bigger). Methods: random search, a (1+1) local search with restarts that moves one parameter one step, and exhaustive enumeration. No LLM is in the loop.

## Reproduce
```bash
pip install pytest ifcopenshell        # ifcopenshell wheels need Python 3.13 at the time of writing
cd research/house-plan
python -m pytest -q tests              # 14 tests (the IFC test skips without ifcopenshell)
python experiments/run.py              # about a minute; writes experiments/results.txt
python experiments/figure.py           # experiments/search_gap.svg from results.txt
```

## Results (from `experiments/results.txt`; deterministic)
- **The default plan** (28 x 28 ft, two bedrooms, 16 in studs and joists, 24 in rafters, 6:12): 784 sq ft, 4,385 board feet of framing (5.59 bf/sq ft), 2x4 studs, 2x10 joists on a 2x12 girder, 2x12 rafters, 2x8 ceiling joists over a middle wall, plus 30 sheets of wall, 32 of roof and 25 of subfloor sheathing. It passes every rule and member check.
- **Best plans by size** (exhaustive, two or more bedrooms; target to 1.15 x target): 4.92 bf/sq ft at 640 sq ft (32 x 20), 4.83 at 896 (32 x 28), 5.17 at 1,024 (32 x 32), 5.90 at 1,216 (38 x 32), and none feasible for 1,400 to 1,610 sq ft. Every best plan has 24 in studs and a 4:12 roof (the lowest pitch uses the least rafter), and uses a middle bearing wall. The cost per sq ft rises past 1,000 sq ft because floor joists and rafters hit the 2x12 limit, so the grid needs the next structural system, not more lumber.
- **Feasibility is narrow.** At 1,000 to 1,150 sq ft only 2,286 of the 182,520 plans (1.3%) pass everything. Most of the grid fails on area; of the rest, bedroom size rules (R304.3 and R304.1) and "no 2x member fits" stop the most.
- **Search.** At the same number of evaluations, local search beats random search (figure, `experiments/search_gap.svg`): median gap to the optimum 0.442 (local) against 0.863 (random) at 100, 0.022 against 0.588 at 500, and 0.000 against 0.207 at 2,000; at 2,000 local search hit the exact optimum in 36 of 40 seeds, random in none. Random search found a feasible plan in only 24 of 40 runs at 100 evaluations (local: 30). The grid is small enough that exhaustive search (about a minute here) is simply better: the loop pays off when a plan has parameters a grid cannot list.

## Limitations
- **The lumber number is a proxy.** It has no prices, labour or sheathing, and it is the first number only; `house-cost` is the project that prices a build. Fewer board feet per sq ft is not a cheaper house if the lumber is harder to handle.
- **The structure is stick framing only.** No trusses, I-joists, LVL or engineered beams, which is why large plans fail. Rafters get no credit for ridge beams, collar ties or the central wall. The wall load is gravity only (no wind or seismic), and I did not run lateral or foundation design. Gable-end framing, rakes, fascia, posts, footings, hangers and fasteners are not in the takeoff. Roof sheathing, wall sheathing and the subfloor are shown as sheets, not priced.
- **The layout is one stylised rectangle,** not a search over floor plans. Fixed 8 ft ceilings, a 6 ft bathroom, doors in set places, no kitchen, hall or stair rules, no accessibility, and no energy check. The room rules are paraphrased from memory and unchecked against the IRC.
- Everything inherits the limits of [`house-spans`](../house-spans) (including its unverified DF-L values and no floor-vibration check) and [`house-framing`](../house-framing) (whose header bearing area is suspect, see the first's README).
- The IFC file is untested in a viewer; the entity counts and wall bounding boxes are what was checked.

## Next steps
Price the takeoff (`house-cost`). Let the search change the layout (room order, extra rooms) and add a CMA-ES baseline. Replace the stick roof with a truss option so plans above 1,200 sq ft become feasible. Add wind and a shear-wall check (`house-structure`). Draw studs and plates as IFC members. Open the file in FreeCAD or BlenderBIM.

## Owner steps
None required. A licensed architect's or engineer's review, and a permit, before anything is built is an owner step.

## Outside dependencies (vitamins)
Python, pytest, IfcOpenShell (optional, for the IFC export). Design values and loads come through `house-spans` and `house-framing`; the IRC room rules were written from memory and need to be checked against the adopted code.
