---
title: "Start here: which hull carries a survey payload furthest? The marine-hull research"
seo_title: "Which hull carries a survey payload furthest per kWh?"
date: 2026-10-30
tags: [start-here, marine-hull, autonomous-boats, hull-resistance, ocean-engineering]
description: "For survey operators, naval architecture students and marine robot builders: open hull, glider and solar range models, and what they cannot tell you yet."
---

# Start here: which hull carries a survey payload furthest? The marine-hull research

This guide is for three kinds of reader. You might run ocean or lake surveys and choose between a small uncrewed boat, a glider and an AUV for the next job. You might study naval architecture and want a resistance model you can open, change and argue with. Or you might build marine robots and wonder whether a catamaran, a SWATH or a foil would get your sensor further on the same battery.

The repository's open research programme `research/marine-hull` asks one question for all three: which body carries a survey payload furthest per kilowatt-hour, and where does the answer flip when the drag inputs are uncertain? Its page is [on the live site](https://monorepo-projects-site.duncan-andrew-haywood.workers.dev/research/marine-hull/).

## The problem, in your words

"Everyone says catamarans are efficient. Are they, at one metre per second?" "The vendor quotes twelve hours of endurance. What does my payload do to that?" "Can deck solar keep a boat going all year, or only in summer?" "I have a resistance formula from a textbook, but it was fitted to ships a hundred times bigger."

Small survey craft sit in an awkward corner. They are slow, light and short, where friction dominates and where most published resistance data does not reach. The sensors, radios and computers on board draw power whether the boat moves or not. That hotel load, not the hull, often decides the answer.

## What you get

The models are standard-library Python in `src/marine_hull/`, with every input that lacks a source swept over a range rather than fixed. Headline results so far, all simulated:

- **Monohull against catamaran.** At equal displacement, 200 kg and 25% battery, a catamaran out-ranges a monohull in 0.4% of 6,561 swept cases with the placeholder wave term, and in 3.3% once Michell thin-ship wave resistance replaces it. It wins in none of the cases at equal length. At survey speed, below about 1 m/s, wetted area sets the drag, and the hotel load puts the best-range speed near 1 m/s.
- **Other hull forms.** A foilborne 200 kg craft never out-ranges the monohull in 2,916 swept cases. A SWATH loses in all 4,374 pairs tried. Seakeeping and stability, the usual reasons to build a SWATH, are not modelled.
- **Glider against AUV.** With Slocum flight coefficients from the MIT-licensed `gliderflight` package, the glider's range advantage turns out to be a hotel-load advantage, not a hydrodynamic one. With the same hotel load it has the longer best range in 0 of 2,430 cases. The glider also moves at roughly 0.2 m/s, so the programme scores time as well as energy.
- **Deck solar across real climates.** With NASA POWER monthly insolation at five sites, the central 5 m boat holds 1 m/s on solar alone in all 12 months at the equator and at 25 N, in 7 at 42 N and in 5 at 60 N. An annual average hides the winter collapse.
- **Which input to measure first.** In a one-at-a-time sensitivity study, hotel load, panel efficiency and derate moved daily distance 2 to 5 times more than the hull constants. The README's advice: source the hotel load and panel yield before the hull.
- **A first tank number.** Milestone 3a compared the model with one published Wigley hull point (Ju 1983, quoted in a 2017 comparative study). With no form factor the model lands within a few per cent. With the programme's central form factor of 0.25 it is about 22% high at 15 C. One point, second-hand, and a thin hull, so it is a check, not a validation.
- **Sea-state speed policies.** The newest milestones ask whether backing off on rough days, using yesterday's sea state as the forecast, recovers what a perfect forecast would. The answer depends on spell length: about a tenth of the gain when days are independent, about half at a 67% hit rate and about 90% at a 90% hit rate. The sea-state multipliers are swept choices, not sourced.
- **A paper skeleton.** `paper/DRAFT.md` targets OCEANS (IEEE/MTS). It is marked "not submittable".

## Your first ten minutes

1. **Read the status and limitations** in `research/marine-hull/README.md`. It says plainly what is swept and what is sourced.
2. **Fetch just this project** with a sparse clone. It has no dependencies beyond Python 3.9 or later.

   ```bash
   git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo.git
   cd oss-monorepo
   git sparse-checkout set research/marine-hull
   cd research/marine-hull
   ```

3. **Rerun the tank comparison.** `PYTHONPATH=src python3 experiments/run_wigley_tank.py` finishes in under a second. Compare it with `experiments/results_wigley_tank.txt`; when this guide was written the two were identical. The 15 C line shows the model at +2% with no form factor and +22% at 0.25.
4. **Rerun the first sweep.** `PYTHONPATH=src python3 experiments/run.py` took under a second here and matched `experiments/results.txt` exactly. Its first line reads "cases 6561; catamaran out-ranges monohull in 27 (0.4%)".
5. **Try your own boat.** Save this as `boat.py` in the project folder and run `PYTHONPATH=src python3 boat.py`:

   ```python
   from marine_hull import hull

   volume = 200 / hull.RHO_SEA          # a 200 kg boat
   for v in (0.5, 0.75, 1.0, 1.25, 1.5, 2.0):
       r = hull.resistance(v, length=4.0, volume=volume, c_s=3.0, k_form=0.25)
       print(v, "m/s", round(r, 1), "N", round(hull.range_km(5000, v, r, p_hotel=30.0)), "km on 5 kWh")
   ```

   For this 4 m hull with a 30 W hotel load it printed a best of 414 km at 1.0 m/s, falling to 241 km at 2.0 m/s. Change `p_hotel` to your sensor load and watch the best speed move. The propeller and motor efficiencies default to 0.55 and 0.85, which are assumptions. The wave term in `hull.py` is a placeholder; `michell.py` has the thin-ship version. Treat the result as a comparison between options, not a prediction of a real boat's range.
6. **Run the tests** if you have `pytest`: `PYTHONPATH=src python3 -m pytest tests -q`.

## How to get involved

The programme is short of measurements, not ideas. The log records data hosts that would not answer and papers the sessions could not open. Useful contributions from this audience:

- **Measured hotel loads.** The README calls the measured hotel load of a fielded glider and AUV the number milestone 4 needs most. The same goes for a small survey boat with its sensors running.
- **Resistance data for small hulls.** A Wigley curve over Froude numbers 0.2 to 0.4, or tank or towing data for a fuller 3 to 5 m hull, would test the Holtrop-Mennen hypothesis (H3), which is still untouched.
- **A wave-height series** from a site you work at, under a licence that allows reuse. How long rough spells last decides what a sea-state policy is worth.
- **Field reports.** Endurance from a real deployment, with speed, payload power and battery size, is the kind of number the models are missing.

Send data or an idea through [the feature form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=feature.yml), and a wrong number or a broken script through [the bug form](https://github.com/duncan-haywood/oss-monorepo/issues/new?template=bug.yml). The maintainer reviews pull requests from forks by hand; the AI agents never act on them. Every idea is read, but none is promised.

## Cost and data

Free and MIT licensed. Everything runs on your machine. The NASA POWER climatology used for the solar sites is stored in `experiments/data/` as fetched. The 2017 study quoted for the tank point is licensed CC BY-NC-ND and was read, not copied into the repository.

## What it does not do

- **Nothing has been in the water.** The README says so in those words: simulation only, nothing built or tested.
- **Most hull constants are unvalidated.** Form factors, efficiencies and the wetted-area constant are swept. One tank point is all the programme has, and it suggests the central form factor is too high for slender hulls.
- **No stability, seakeeping, deck area or payload layout.** Range per kilowatt-hour is one criterion among many.
- **It is not engineering advice.** Do not size a battery or plan a mission on these numbers alone. Any real operation also has to follow the flag state's and local authority's rules: COLREGs, harbour masters and permits.
- **It was produced by AI coding agents** with the owner steering. No lab has reviewed it, and it claims no affiliation with any author or vendor it cites.

## Where to go next

- The programme: `research/marine-hull/README.md`, `PROPOSAL.md` (hypotheses H1 to H5) and `LOG.md`
- The paper skeleton: `research/marine-hull/paper/DRAFT.md`
- A sibling study on holding a survey line in a current: `research/marine-path`
- All open programmes: `research/PROGRAMMES.md`
- How to rerun, reuse and cite any project: [Start here: the open research](2026-10-29-start-here-research.md)
- How outside contributions land: [Start here: contributing](2026-10-29-start-here-contributing.md)

The rest of the series is on the hub page: [Start here](2026-10-29-start-here.md).
