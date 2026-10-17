# garment-twonodealign

Follow-up to [`garment-twonodecheck`](../garment-twonodecheck) (track 6, `PROJECTS.md`), taking its next step: "align the body area and constants one at a time to attribute the skin-temperature gap". That project found `garment-thermal`'s two-node model within 0.25 C of `pythermalcomfort`'s Gagge two-node implementation in core temperature but 0.58 C apart on average in skin temperature (up to 2.1 C). Here the model is rebuilt with nine design choices that can each be set to the repository's version or to the reference's, to see which choices carry the gap. Everything is a model on a CPU; no person was measured. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/garment-twonodealign/

**Builds on.** `research/garment-thermal` and `research/garment-twonodecheck` in this repository, and the `pythermalcomfort` package (MIT; 4.6.1), whose `two_nodes_gagge` documents itself as the model of Gagge et al. (1986). The reference's choices were read from its installed source, not from the paper, which I did not read; I make no claim about what Gagge et al. (1986) contain, nor which implementation is closer to it. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

**Citation check.** The only source is the `pythermalcomfort` source code, which I installed and read; its docstring names Gagge et al. (1986), which I did not look up. No other citation is used.

## Method
`src/garment_twonodealign/flex.py` is a single two-node model with nine switches, each `ours` or `ref`:

| flag | ours (garment-thermal) | ref (pythermalcomfort 4.6.1) |
|---|---|---|
| `area` | 0.202 m^0.425 h^0.725 = 1.81 m2 | 1.8258 m2 |
| `consts` | 58.15 W/m2 per met; 3490 J/(kg K) | 58.2; 3492 |
| `conv` | max(2.38 abs(dT)^0.25, 12.1 sqrt(v)) | max(3, 8.6 v^0.53, 5.66 (met-0.85)^0.39) |
| `rad` | fourth-power radiation, ISO-style clothing area factor | linearised h_r (0.95 x 0.73), area factor 1+0.15 clo |
| `alfa` | skin mass fraction fixed at 0.10 | varies with skin blood flow |
| `dilate` | vasodilation gain 200, no blood-flow floor | gain 120, floor 0.5 L/(h m2) |
| `sweatcap` | wettedness capped at 1 | clothed critical wettedness 0.59 v^-0.08, sweat cap 500 g/(m2 h) |
| `order` | controls evaluated before the heat balance | after the temperature update (one-step lag) |
| `steps` | 60 one-minute steps | 59 |

It is checked at both ends over the 108 conditions of `garment-twonodecheck` (air = radiant temperature 18 to 36 C, rh 30 to 80%, 1 to 2 met, 0.3 to 1 clo, v 0.1 m/s): with all flags `ours` it reproduces `garment-thermal`'s `two_node` (copied as `base.py`, evaporative resistance set to the same im 0.45) to 1e-14; with all `ref` it reproduces `pythermalcomfort` to 0.008 in every compared output. The metric is the mean absolute difference to the reference over the grid.

## Reproduce
```bash
python3 -m pip install numpy scipy pytest pythermalcomfort==4.6.1
python3 experiments/run.py      # writes experiments/results.txt
python3 -m pytest -q
```

## Results (from `experiments/results.txt`)
Mean absolute difference to the reference, with everything `ours`: skin temperature 0.581 C, core 0.040 C, evaporative loss 2.15 W/m2, dry loss 1.56 W/m2.

- **One choice switched to the reference's (others unchanged), skin-temperature gap:** `alfa` 0.362, `conv` 0.425, `dilate` 0.436; `sweatcap`, `rad`, `area`, `consts`, `order`, `steps` leave it at 0.58 (0.580 to 0.586).
- **One choice kept as ours (all others the reference's), skin gap it alone causes:** `conv` 0.251, `alfa` 0.225, `dilate` 0.160, `sweatcap` 0.064, `rad` 0.020, `steps` 0.005, `area` 0.003, `consts` 0.002, `order` 0.001. Body area, the first suspect in `garment-twonodecheck`, accounts for almost none of the gap.
- **Greedy sequence** (each step switches the choice that most lowers the skin gap): 0.581 to 0.362 (`alfa`), 0.200 (`conv`), 0.085 (`dilate`), 0.022 (`sweatcap`), 0.002 (`rad`), and about 0.001 or less afterwards.
- **Evaporative loss** follows different choices: `sweatcap` and `conv` matter most (leave-one-out 1.7 and 3.0 W/m2). Switching `conv` alone makes evaporative and dry loss *worse* against the reference (2.15 to 3.41 and 1.56 to 2.24 W/m2) while improving skin temperature, so the choices compensate for each other and no single one is "the" cause.
- The gap is largest in cool air (mean 1.01 C at 18 C, 0.29 C at 36 C); I did not test why.

Reading: most of the skin-temperature gap in `garment-thermal`'s two-node model comes from the convection coefficient (the reference raises it with metabolic rate and floors it at 3 W/(m2 K)), the variable skin mass fraction and the vasodilation gain, not from body size or constants. This attributes a difference between implementations; it does not say which is closer to people.

## Limitations
- Implementation against implementation, not against measurements; the reference is not ground truth, and I did not check either against Gagge et al. (1986).
- Only the nine listed choices; the bundle of choices in `rad` and `conv` could be split further, and choices outside the list (posture, initial state, respiration terms) were left at values already shared.
- The attribution depends on the order and on the interactions (see the `conv` note above); the three summaries (solo, leave-one-out, greedy) are reported side by side for that reason.
- One air speed, ta = tr, no solar load or optics, 108 grid points, no uncertainty beyond the grid spread. The endpoint match to the reference is 0.008, not exact (the reference's fixed-point tolerance and rounding).

## Next steps
Split `conv` and `rad` into their components; add air speed and radiant-only cases; read Gagge et al. (1986) to see which version of each choice it states; then re-run `garment-thermal`'s fabric comparisons with the reference's choices to see whether its conclusions about optics change.

## Owner steps
None required.

## Outside dependencies (vitamins)
Python, numpy, scipy, pytest, and `pythermalcomfort` 4.6.1 (the reference; the reference test skips if it is missing). Constants of both codes come from outside this project.

## References
- `pythermalcomfort` 4.6.1 (MIT), https://pypi.org/project/pythermalcomfort/ (source read; version recorded in `results.txt`).
- `research/garment-thermal` and `research/garment-twonodecheck` in this repository.
- Gagge et al. (1986), named in the `pythermalcomfort` docstring; not read here.
