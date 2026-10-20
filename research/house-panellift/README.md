# house-panellift: can a crane or telehandler lift a house's wall panels, and what limits it?

Project of track 12, open-source residential construction (`PROJECTS.md`). `house-offsite` split the walls of the [`house-framing`](../house-framing) house into eight panels and left their handling loads as a next step. This checks them: weight, where to pick, whether the plates survive the lift, and what the wind does to a hung panel. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/house-panellift/

**Headline.** The eight panels weigh **343 to 559 lb open and 376 to 877 lb closed** (3,753 lb and 5,031 lb for the whole shell). With two picks placed to minimise the moment, the top plate sees **4 to 12% of its allowable bending stress** at a 1.5 impact factor, ignoring the sheathing; plate bending alone would allow a solid panel of **60 ft with two picks (28 ft with one)**, so it never limits the 24 ft layout. What does limit the lift is weight and wind. At the NIOSH 51 lb recommended limit per person a panel needs **7 to 18 people**, so it is a crane, telehandler or vacuum lifter job. A 20 ft open front-wall panel (546 lb, 162 ft<sup>2</sup> of face) hung broad face to the wind swings 10° at about **12 mph** (15 mph closed, at a drag coefficient of 1.5; 11 to 14 mph over 1.2 to 2.0). That is low next to the 15% weather-loss days in `house-offsite`, which this project cannot connect to a wind record. Every density and coefficient is my assumption.

**Builds on.** [`house-offsite`](../house-offsite) for the panels, [`house-framing`](../house-framing) for the members and NDS values. No group in `prompt.md` covers construction and none is claimed.

**Not a lift plan.** Research code. Nothing here replaces a rigger's or engineer's lift plan, crane chart or a manufacturer's lifting-point rating, and nothing has been reviewed by a licensed professional. Life-safety caveat: a lifted panel is a falling-object hazard; this model does not check sling, shackle or anchor capacity, nail withdrawal at the stud ends, plate splices, tilt-up from flat, or a gust.

## Method (`src/house_panellift/model.py`)
- **Weight** (`weight_profile`): framing lumber from the `house-framing` takeoff (board feet at 28 lb/ft<sup>3</sup>) spread evenly per inch of wall, plus 1.4 lb/ft<sup>2</sup> OSB over the solid wall. Closed panels add 0.35 lb/ft<sup>2</sup> for wrap, batts and wiring and 6 lb/ft<sup>2</sup> of glazed unit over each opening. All four numbers are handbook-style assumptions, not measured.
- **Picks** (`moment_diagram`, `best_picks`): an equaliser or spreader bar gives each of n picks W/n. The bending moment along the panel follows from statics; `best_picks` searches pick positions (grid search; four picks only symmetric) for the smallest peak moment. For a uniform panel two picks land at 0.207 of the length from each end, the textbook value (tested).
- **Plate bending** (`plate_bending_stress`): flat lift-off, half the panel weight reaches the double top plate through the studs, and the plate spans between picks bent about its 5.5 in depth (S = 15.1 in<sup>3</sup>). Allowable is SPF No. 2 Fb 875 psi with the 2x6 size factor 1.3 and load-duration 1.25. The sheathing's stiffness is ignored, so this is a lower bound on capacity.
- **Hung in-plane** (`check_panel`): chord force M/d on the bottom plate, and whether a door opening cuts the bottom plate where the sag moment peaks. It never does here, and the force is under 50 lb.
- **Hands** (`hands_needed`): weight over 51 lb, the load constant of the revised NIOSH lifting equation (Waters et al. 1993, *Ergonomics* 36(7)). Ideal grip and posture, so it understates the crew.
- **Wind** (`wind_speed_for_swing`): drag F = 0.00256 V<sup>2</sup> C<sub>d</sub> A, a rigid pendulum with tan(swing) = F/W. No gusts, spin or boom motion.

## Reproduce
```bash
pip install pytest
cd research/house-panellift
python -m pytest -q tests                      # 7 tests; needs ../house-offsite and ../house-framing (set in pyproject)
python experiments/run.py > experiments/results.txt   # about 3 min, deterministic (the 3-pick search is slow)
```

## Results (from `experiments/results.txt`)
- **A. Panels.** 20 ft panels: 518 to 559 lb open, 751 to 877 lb closed; the 11.6 and 15.5 ft gable panels 343 to 554 lb. The heaviest, a rear-wall panel with the 74 in slider, is 877 lb closed because of the glazing. Pick loads are 257 to 419 lb each with two picks and the impact factor. Plate stress is 0.04 to 0.12 of allowable.
- **B. Length.** The longest solid panel within allowable plate stress: 28 ft with one pick, 60 (open) and 56 (closed) with two, 60 or more with three (search stops at 60 ft).
- **C. Hands.** 7 to 18 people at 51 lb each.
- **D. Wind.** Swing of 5/10/15° is reached at 8.8/12.4/15.3 mph (open) and 10.6/15.0/18.5 mph (closed) at C<sub>d</sub> 1.5. Heavier closed panels are steadier by about a quarter, for the same face area.

## Limitations
Densities and glazing weights are assumptions; the plate model leaves out the sheathing, nail slip and the stud-end connections that actually carry the weight to the plates; the equal-pick-load assumption needs an equaliser or spreader bar (rigid slings would load the picks unequally); tilt-up from flat, rigging hardware, ground bearing and boom capacity are not modelled; the wind figure is a static pendulum. The robust results are that weight is in the hundreds of pounds and that bending has a large margin; the 60 ft figure is a bound from one check, not a recommendation.

## Next steps
Measure a real panel's weight and compare; add the stud-end nail withdrawal and sheathing action to the lift check; tie the swing limit to an hourly wind record to replace `house-offsite`'s 15% weather-loss day rate; price a telehandler day against the $1,500 crane day.

## Owner steps
None required. Any real lift needs a rigger's plan and rated lifting hardware.

## Outside dependencies (vitamins)
Python standard library for the model; `pytest` for the tests. NDS design values as reprinted in `house-framing`; the NIOSH load constant is from the cited paper.
