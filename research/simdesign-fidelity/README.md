# simdesign-fidelity: when does a cheaper beam model pick the same design as 3D finite elements?

Third milestone of the simulation-first design track (`PROJECTS.md`, track 5), and an instance of the repository's central sim-fidelity theme. A rectangular cantilever is sized for minimum mass under a tip-deflection limit and a stress limit, using four models of increasing cost: Euler–Bernoulli beam theory, Timoshenko beam theory, 2D plane-stress finite elements and 3D finite elements. Each model's design is then judged by the 3D model. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/simdesign-fidelity/

**Builds on.** scikit-fem (Gustafsson and McBain, "scikit-fem: A Python package for finite element assembly", *Journal of Open Source Software* 5(52):2369, 2020, <https://doi.org/10.21105/joss.02369>); classical beam theory, with Timoshenko's shear correction (Timoshenko, "On the correction for shear of the differential equation for transverse vibrations of prismatic bars", *Philosophical Magazine* 41:744–746, 1921) and the shear coefficient 5/6 as a common approximation (see Cowper, "The shear coefficient in Timoshenko's beam theory", *Journal of Applied Mechanics* 33(2):335–340, 1966). Follows `simdesign-bracket` and `simdesign-topopt` in this repository. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. Citations were written from memory of the literature and not re-checked online in this run.

## Method
- Cantilever of length `L`, depth `h`, width `b`, clamped at x = 0 (all displacement components fixed), tip force F = 100 N spread uniformly over the free end face. Assumed FDM-plastic-like properties (E 3000 MPa, nu 0.36, density 1.24 g/cm³, 20 MPa working stress), not measured.
- `src/simdesign_fidelity/models.py`: `beam_eb`, `beam_timoshenko` (kappa 5/6), `fe2d` (P2 quadrilaterals, plane stress), `fe3d` (triquadratic hexahedra, 27-point quadrature, at most 6 elements across the width). Every model returns tip deflection and one stress number: the top-fibre normal stress at x = h. The FE value is a linear fit of the quadrature-point stresses in the slab x in [h, 1.6h] (each rescaled to x = h by the beam moment ratio), read at y = h/2 and averaged over the width. Reading it one depth away from the clamp avoids the clamp singularity, and means all models are asked the same question.
- `design.py`: the lightest design is the smallest `h` satisfying both limits (mass = density * L * h * b). Each limit's `h` is found by a power-law fixed-point iteration (deflection ~ h^-3, stress ~ h^-2), then the larger is taken.
- Design study: F = 100 N, deflection limit L/50, stress limit 20 MPa, L in {20, 40, 80, 160} mm, b in {5, 20, 60} mm. The 3D model with 2 elements over the depth is the reference; each cheaper model's design is re-evaluated with that reference.

## Reproduce
```bash
pip install numpy scipy scikit-fem matplotlib pytest
cd research/simdesign-fidelity
python -m pytest -q tests          # 6 tests
python experiments/run.py          # writes experiments/results.txt and fidelity.png (about 6 minutes)
```

## Results (from `experiments/results.txt`)
- **Stress: all models agree** (Euler–Bernoulli and 2D stress equal the 3D value to within 0.1% in all 12 sections of the table). That is expected, not a finding: a stress read away from the clamp in a bending-dominated cantilever is the beam-theory value. The models would differ at the clamp, at a fillet or at a load introduction; this study does not probe those.
- **Deflection is where the models differ.** Ratio of each model's tip deflection to the 3D model's (n = 3 over depth):
  - Slender (L/h = 20): all within 0.4% for a narrow section (b/h 0.5), up to 3.5% for a wide one (b/h 6).
  - Stubby (L/h = 3, b/h 0.5): Euler–Bernoulli 0.944 (it omits shear), Timoshenko 1.029, 2D 1.020.
  - **Wide sections (b/h = 6) disagree in the opposite direction:** Timoshenko and 2D plane stress overestimate deflection (1.13 and 1.12 at L/h = 3; 1.04 at L/h = 20), because a wide beam resists the Poisson contraction of its cross-section (closer to plane strain, stiffer by about 1/(1 − nu²) = 1.15 for nu 0.36). Plane stress is the right 2D model for a narrow beam, not for a wide one. Euler–Bernoulli is closest there only because its two errors (no shear, no plane-strain stiffening) cancel.
- **Design.** Over the 12 cases the cheaper models choose a depth within about 5% of the 3D optimum; every case is deflection-governed except the shortest, narrowest one (L = 20, b = 5 mm, stress-governed, where all models give nearly the same design). Judged by the 3D model:
  - Euler–Bernoulli is the only model that ever **violates** a limit: 1.051 of the deflection limit at L = 40 mm, b = 5 mm (stubby, narrow), 1.026 at L = 80, b = 5 and 1.013 at L = 160, b = 5. Everywhere else it is feasible at the n = 2 reference.
  - Timoshenko and 2D FE never violate, but are **heavier than needed**, by up to 4.9% in mass (Timoshenko, L = 20, b = 60) and by 0.5 to 4.7% (2D), most for the widest sections.
  - So the cheap models pick "the same design" (within about 5% in depth) in this family, with the sign of the error set by the width: narrow and stubby gives an unsafe Euler–Bernoulli design, wide gives an over-sized Timoshenko or 2D design.
- **Discretisation uncertainty is of the same order as the smaller gaps.** The 3D tip deflection rises by 0.4% from n = 2 to n = 4 elements over the depth (0.8165, 0.8197, 0.8208 mm for L 40, h 8, b 20) and was still moving; the 2D value moves under 0.1%. Re-evaluating the n = 2 optimum at n = 3 gives deflection utilisation of 1.006 to 1.007, so the 3D reference designs are about 0.7% under-sized and differences between models below about 1% in depth should not be read as real. The clamp (fully fixed face) is also stiffer than a real support.

## Limitations
- One geometry (prismatic rectangular cantilever), one load, one set of assumed isotropic material values. Printed parts are anisotropic and the limits are not sourced.
- The 3D reference is itself a coarse finite-element model (2 elements over the depth, at most 6 across the width), not a converged or measured truth; the comparison is between models, and no model is validated against an experiment.
- The stress is read away from the clamp, which hides the cases where beam theory fails worst (stress concentrations). A fillet or notch study would be the natural next test, and the `simdesign-bracket` fillet is such a case.
- One seed does not apply (deterministic), but only 12 design cases; the percentages above are for this grid, not general rules.

## Next steps
Add a filleted clamp or notch so the stress differs between models; a converged 3D reference (n = 4, 6); use the findings to choose the cheapest adequate model inside `simdesign-llm` and `simdesign-dfm`.

## Owner steps
Print the cantilevers (L 80, b 20 and the depths in `results.txt`), load the tip and compare measured deflection with the table once a material is chosen. Bill of materials: a few grams of filament per part; no price stated here.

## Outside dependencies (vitamins)
Open-source Python packages only (numpy, scipy, scikit-fem, matplotlib). No hardware.
