# Draft: which hull carries a small survey boat furthest per kWh, and how much of the answer is the drag model?

Status: **milestone 7b: introduction, model and results-table drafted, not submittable.** Every number below is copied from
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

## 2. Drafted sections (milestone 7b)

Prose below is a draft of paper sections 1 to 3. Every figure is quoted from `../LOG.md`; no
experiment was run for this text. Citations are the PROPOSAL.md list and still need the open-and-read
pass its "Citation status" describes.

### 2.1 Introduction (draft)

Small autonomous survey craft of 100 to 500 kg are usually chosen for deck area and stability, not
endurance. If the payload's fixed power draw dominates at survey speed, the hull matters little;
if not, it matters a great deal. Published comparisons fix one resistance method and one vehicle
(Manley 2008; Liu et al. 2016), and the regression methods in common use (Holtrop and Mennen 1982)
were fitted to ships of tens of metres. We put the hull types on one energy basis, a 200 kg craft
with a 25% battery mass fraction, and sweep every input we cannot source, so that the result is
the region where the ranking holds rather than one number. Contributions, stated narrowly:
(i) a common energy-per-kilometre comparison of seven body types with every unsourced input swept
and every sourced one named; (ii) the finding that the ranking is stable where absolute range is
not; (iii) a first contact with tank data, one Wigley point, showing the swept form-factor box is
conservative for slender hulls; (iv) a seeded, one-command-per-table artefact.

### 2.2 Model (draft)

Displacement hulls: ITTC 1957 friction line times a form factor (1 + k), plus Michell thin-ship
wave resistance for Wigley hulls, with Havelock two-hull interference for the catamaran. Planing:
Savitsky (1964) prismatic surface, no mean-bottom-speed correction. Hydrofoil: Prandtl lifting
line plus flat-plate struts, no ventilation. Glider: steady glide at best-glide incidence with
pump work B tan(gamma) / (2 eta) per metre, independent of dive depth; the AUV is a same-mass,
same-battery propeller body. Range is battery energy over (propulsive power / efficiency + hotel
load) times speed, maximised over speed. Deck solar adds a daily-mean harvest with NASA POWER
insolation at five sites. All coefficients that are not sourced are swept on a grid or drawn jointly
(milestone 5m).

### 2.3 Headline results (draft table, 200 kg, 25% battery, 30 W hotel unless stated)

| Rung compared with the 4 m Wigley monohull | Cases | Wins over monohull | Source |
|---|---|---|---|
| Catamaran (Michell + Havelock) | 6,561 | 216 (3.3%); 0 of 729 equal-length | `results_michell.txt` |
| SWATH | 4,374 | 0 | `results_swath.txt` |
| Planing (Savitsky) | 48 | 0 | `results_planing.txt` |
| Hydrofoil | 2,916 | 0 (foil/mono range ratio 0.064 to 0.248 where foilborne) | `results_foil.txt` |
| Glider vs AUV, equal hotel, Slocum coefficients | 2,430 | glider 0 | `results_slocum.txt` |
| Glider vs REMUS-100-class AUV, vendor hotel 104 to 175 W | 810 glider cases per AUV power row | glider longer in 100% of rows (total AUV power 125 to 188 W) | `results_remus.txt` |

Monohull best range 560 to 1,188 km (median 836 km) at a median 1.05 m/s in the milestone-1 box.
Hypotheses: H1 refuted as stated (milestone 7c: range spreads 20.6% over 27 hull-form combinations, each constant alone under 10%; propulsion is 0.33 to 0.37 of power at the best speed); H2 held; H3 untested; H4 "crossover
in 0.4 to 0.9 m/s" refuted, with the glider's edge being a hotel-load edge (break-even AUV hotel
multiple median 4.87); H5 refuted (0 mono/catamaran rank swaps in 2,187 cases over 150 to 250 Wh/kg, because range is proportional to pack energy; a flip needs a term that is not).

## 2.4 Still to write

4. Sensitivity: input ranking hotel > eta_pv > derate > c_s > k_form > wave scale
   (`results_solar_sensitivity.txt`); best speed moves 0.0 to 0.2 m/s per input while km/day moves
   up to 50%.
5. **Threats to validity**, to be written in full: wave term compared with one published Wigley tank point only (milestone 3a: no-form-factor model within +1 to +5%, central k = 0.25 about 20% high, so the hull box is conservative for slender hulls; one speed cannot separate wave term from form factor); Holtrop-Mennen not run; hotel-load and module sources opened only as search snippets;
   derate, soiling and temperature factors are the author's ranges; glider and foil coefficients
   partly swept; no seakeeping or stability; sea-state loss only as a free resistance multiplier (milestone 6a: f = 2 costs 21% of km/day, shifts the best speed down 0.2 to 0.3 m/s, keeps the site ordering; running the calm-water speed in f = 2 water loses 12 to 27%; milestones 6b/6c: a day-by-day back-off beats the best constant speed by 3 to 8% with a 10 kWh pack and up to 15% with a 1 kWh pack when rough spells last a week, as an in-sample perfect-foresight upper bound with swept, not sourced, spell lengths); milestone 6d: a forecast of finite skill recovers only part of that bound, about a third of the gain at 75% of days called correctly and more than half only near 87%, with independent errors and skill swept, not sourced; milestone 6e: a no-parameter persistence call, yesterday's sea state, recovers 0.68 to 0.80 of the gap at 7-day spells, hit rate 0.85, because its errors fall on spell boundaries; its spell-1 cells are a deterministic alternation of the Markov chain and must not be quoted; milestone 6f: on a genuinely iid sea the same call has hit rate 0.50 and recovers a median 0.06 of the gap, rising to 0.28 at 3-day and 0.75 at 7-day spells; milestone 6g: with three sea states the shares are 0.10, 0.48 and 0.89 at hit rates 0.34, 0.67 and 0.90, so the shape carries over, though the chain's spell lengths differ from 6f's).

## 3. What would make it submittable

1. Milestone 3: one published small-hull resistance *curve* (Wigley or a tank series) reproduced to
   a stated error (one point, Ju 1983 via Wang et al. 2017, is done: milestone 3a; zenodo.org was reachable). Data hosts tried and refused or unreachable from the session: eprints.soton.ac.uk
   (401), jtse.utm.my (connection reset), mdpi.com and jmr.unican.es (earlier sessions).
   A run with a reachable host, or the owner supplying a table, unblocks it.
2. Open and cite the Wave Glider sheet, the module datasheets and the Renewable Energy 2022 paper
   instead of the snippets.
3. Sea-state resistance added to the solar-range model (milestone 6).
