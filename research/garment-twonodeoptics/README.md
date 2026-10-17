# garment-twonodeoptics

Follow-up to [`garment-twonodealign`](../garment-twonodealign) (track 6, `PROJECTS.md`), taking the last item of its next steps: "re-run `garment-thermal`'s fabric comparisons with the reference's choices to see whether its conclusions about optics change." `garment-twonodealign` rebuilt the repository's two-node thermoregulation model with nine switchable design choices, each set to `garment-thermal`'s version ("ours") or to the version in `pythermalcomfort` 4.6.1 ("ref"). Here the fabric-optics extension of `garment-thermal` (infrared transmittance, outer emissivity, solar absorptance, radiant temperature, solar load) is added to that switchable model, and the optical effects are compared under all-ours and all-ref choices. Everything is a model on a CPU; no person or fabric was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodeoptics/

**Builds on.** `research/garment-thermal`, `research/garment-twonodecheck` and `research/garment-twonodealign` in this repository, and the `pythermalcomfort` package (MIT; 4.6.1), whose `two_nodes_gagge` documents itself as the model of Gagge et al. (1986). The reference's choices were read from its installed source (in `garment-twonodealign`); I did not read Gagge et al. (1986). It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** The only source is the `pythermalcomfort` package, run and read; its docstring names Gagge et al. (1986), which I did not look up. The optical extension has no published reference (as in `garment-thermal`).

## Method
`src/garment_twonodeoptics/flex.py` is `garment-twonodealign`'s switchable model with five extra arguments: radiant temperature `tr`, absorbed solar irradiance `solar`, outer emissivity `eps`, infrared transmittance `tau` and solar absorptance `alpha`.
- With the `ours` radiation choice the optics are exactly `garment-thermal`'s (outer-surface balance with emissivity-scaled, `(1-tau)`-reduced fourth-power radiation, absorbed solar, plus direct skin radiation through the cloth).
- With the `ref` radiation choice the same three physical effects are written in the reference's linearised form (my construction, since the reference has no optics): the linear radiative coefficient is scaled by `eps/0.95 (1-tau)`, the operative temperature uses `tr` and gains `alpha*solar/f_cl/(h_r+h_c)`, and a direct skin-to-surroundings term `f_cl h_s tau (tsk - tr)` is added with `h_s` computed at skin emissivity 0.97.

Checks (`tests/`, 31 pass): with all flags `ours` the model matches `garment-thermal`'s `two_node` to 1e-6 for four climates and four optical settings including `tr`≠`ta` and solar load; with all flags `ref` and neutral optics it matches `pythermalcomfort` within 0.05 C (skin, core) and 0.3 W/m2 (dry loss) including radiant temperature 6 C below to 8 C above air; optics have the expected signs under both choice sets; every flag still changes the output. The `ref` optics themselves have no external check.

Scenarios are those of `garment-thermal` (cool room 16 C, warm room 28 C, warm air with 34 C walls, sun at 32 C and 200 W/m2 on the body), run for 60 minutes with im = 0.45. Each property is moved across the plausible span used there (tau 0 to 0.8, eps 0.95 to 0.2, alpha 0.9 to 0.15, and clo 0.7 to 0.3 for comparison), others at baseline (eps 0.95, tau 0, alpha 0.5, clo 0.5).

## Reproduce
```bash
python3 -m pip install numpy scipy pytest pythermalcomfort==4.6.1
python3 experiments/run.py      # writes experiments/results.txt
python3 -m pytest -q
```

## Results (from `experiments/results.txt`)
Quantities are end-of-hour values from the transient model, so "dry loss" is not a steady-state heat flux, particularly in the cool room where skin is still cooling.
- **Rankings agree.** In all four scenarios the properties order identically by dry-loss effect under ours and ref: infrared transmittance largest indoors in still air, insulation in the hot-wall room, and solar absorptance by far in sun (+55 W/m2 ours, +64 ref for 0.9 to 0.15).
- **Signs agree except one near-zero case.** The only sign change is the skin-temperature effect of thinning the cloth in sun (-0.04 C ours, +0.06 C ref), both within a tenth of a degree.
- **Sizes agree to within 3% in the 28 C room, and differ elsewhere.** The ref/ours ratio of the dry-loss effect is 0.97 to 0.99 in the warm room, 0.85 to 1.24 with hot walls, 0.49 to 1.48 in sun (transmittance halves, emissivity and insulation grow), and 1.9 to 2.7 in the cool room.
- **Cool-room difference traced to the skin mass fraction.** Switching only `alfa` (variable skin mass fraction) to the reference's moves the cool-room dry-loss effects by 8.0, 5.4 and 7.6 W/m2 (of 8.1, -5.5, 3.9 ours); in the other scenarios no single choice moves an effect by more than 3.5 W/m2 except `conv` in sun (9.3 W/m2 of the 55.4 for solar absorptance). So disagreement concentrates where the earlier project found the model gap (cool air) plus the convection coefficient in sun.
- Reading: the qualitative conclusions of `garment-thermal` (which optical property matters in which setting) survive the change of two-node implementation in these scenarios; the quantitative sizes, especially in cool air and in sun, depend on it by up to a factor of two.

## Limitations
- Implementation against implementation, not against people or measured fabrics; the reference is not ground truth, and the `ref` optics are my own linearised construction without an external check.
- Only the four scenarios and four spans of `garment-thermal`, one air speed per scenario, 60 minutes, one initial state; effects measured on end-of-hour transient values.
- Single-choice attribution ignores interactions (see `garment-twonodealign`).
- Wetness/sweat are model outputs, not validated; no uncertainty analysis beyond the scenario grid.

## Next steps
Read Gagge et al. (1986) to learn which version of the skin mass fraction and convection choices it states; compare optics effects at steady state; add a published measurement table; test the infrared-gating textile bounds of `garment-thermal` section E under both choice sets.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and `pythermalcomfort` 4.6.1 (the reference; its tests skip if it is missing). Constants of both codes and the optical property spans come from outside this project.

## References
- `pythermalcomfort` 4.6.1 (MIT), https://pypi.org/project/pythermalcomfort/ (run; version recorded in `results.txt`).
- `research/garment-thermal`, `research/garment-twonodecheck` and `research/garment-twonodealign` in this repository.
- Gagge et al. (1986), named in the `pythermalcomfort` docstring; not read here.
