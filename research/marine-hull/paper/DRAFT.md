# Draft: which hull carries a small survey boat furthest per kWh, and how much of the answer is the drag model?

Status: **skeleton of milestone 7, not submittable.** Every number below is copied from
[`../LOG.md`](../LOG.md) and the `experiments/results_*.txt` file named beside it. Nothing is new
in this file. Target: OCEANS (IEEE/MTS), 6 to 10 pages. The hull constants are unvalidated against
tank data (milestone 3 is open), and that gap decides what the paper can claim, as section 5 says.

## 1. Claim the paper can currently support

For a 200 kg, 4 to 5 m survey craft on stored energy plus deck solar, the **ranking of body types
is robust to the unsourced inputs, and the absolute range is not**:

- Ranking (2,916 to 6,561 swept cases per rung): catamaran out-ranges the monohull in 3.3% of
  6,561 cases and none at equal length (`results_michell.txt`); SWATH in 0 of 4,374
  (`results_swath.txt`); planing hull 0 of 48 (`results_planing.txt`); hydrofoil 0 of 2,916
  (`results_foil.txt`).
- Glider against propeller AUV: the glider wins on energy per metre only through hotel load. At
  equal hotel load it wins 0 of 2,430 cases with Slocum coefficients (`results_slocum.txt`); against
  a REMUS-100-class AUV whose non-propulsion load is read from vendor endurance (104 to 175 W) it
  wins all cases, at about a tenth of the speed (`results_remus.txt`).
- Absolute range: with every power-side input drawn jointly from its range, 5 m km/day at five
  NASA POWER sites is about 133 / 125 / 97 / 77 / 69 (Equator to Gulf of Alaska), each within
  roughly +-10% (`results_solar_mc.txt`); the unsourced hull box adds another +-10%
  (`results_solar_hull_uncertainty.txt`). Site ordering held in 500 of 500 draws.

## 2. Sections still to write

1. Introduction and related work (PROPOSAL.md has the checked list).
2. Model: ITTC 1957 friction, form factor, Michell thin-ship wave term (Wigley, torpedo), Savitsky,
   lifting-line foil, quasi-steady glider, solar harvest with daily series.
3. Experiments, one table per rung from section 1.
4. Sensitivity: input ranking hotel > eta_pv > derate > c_s > k_form > wave scale
   (`results_solar_sensitivity.txt`); best speed moves 0.0 to 0.2 m/s per input while km/day moves
   up to 50%.
5. **Threats to validity**, to be written in full: wave term not compared with a published tank
   curve; Holtrop-Mennen not run; hotel-load and module sources opened only as search snippets;
   derate, soiling and temperature factors are the author's ranges; glider and foil coefficients
   partly swept; no seakeeping or stability; sea-state loss only as a free resistance multiplier (milestone 6a: f = 2 costs 21% of km/day, shifts the best speed down 0.2 to 0.3 m/s, keeps the site ordering; running the calm-water speed in f = 2 water loses 12 to 27%; milestones 6b/6c: a day-by-day back-off beats the best constant speed by 3 to 8% with a 10 kWh pack and up to 15% with a 1 kWh pack when rough spells last a week, as an in-sample perfect-foresight upper bound with swept, not sourced, spell lengths); milestone 6d: a forecast of finite skill recovers only part of that bound, about a third of the gain at 75% of days called correctly and more than half only near 87%, with independent errors and skill swept, not sourced; milestone 6e: a no-parameter persistence call, yesterday's sea state, recovers 0.68 to 0.80 of the gap at 7-day spells, hit rate 0.85, because its errors fall on spell boundaries; its spell-1 cells are a deterministic alternation of the Markov chain and must not be quoted; milestone 6f: on a genuinely iid sea the same call has hit rate 0.50 and recovers a median 0.06 of the gap, rising to 0.28 at 3-day and 0.75 at 7-day spells).

## 3. What would make it submittable

1. Milestone 3: one published small-hull resistance curve (Wigley or a tank series) reproduced to
   a stated error. Data hosts tried and refused or unreachable from the session: eprints.soton.ac.uk
   (401), jtse.utm.my (connection reset), mdpi.com and jmr.unican.es (earlier sessions).
   A run with a reachable host, or the owner supplying a table, unblocks it.
2. Open and cite the Wave Glider sheet, the module datasheets and the Renewable Energy 2022 paper
   instead of the snippets.
3. Sea-state resistance added to the solar-range model (milestone 6).
