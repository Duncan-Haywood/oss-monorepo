# Designing clothes hangers for a laundry-hanging robot in a simulation loop

*hanger-fit, research track 18 milestone 1. Produced with AI assistance (Claude). Stylised
simulation; every fabric constant is an assumption.*

## Abstract

A robot that hangs every garment from a dryer has to choose a hanger for each one. We model the
frontal-plane drape of a garment's shoulder line and sleeve over one hanger arm as a discrete
elastic chain with penalty contact. The static drape is found by L-BFGS and scored by its RMS
distance from the garment's worn shape and by its sharpest bend. CMA-ES then designs hangers.
Over seven garment sizes (half shoulder widths of 15–25 cm), the best single fixed hanger
averages 2.11 cm of shape error (worst 5.38 cm). One adjustable-width hanger with a shared shape
averages 0.176 cm (worst 0.216 cm). A rack of four fixed widths averages 0.51 cm (worst
0.97 cm). Stock wire and plastic hangers fold the cloth at about 65°/cm at the tip, against
about 14°/cm in the worn shape. When the objective omits that bend, the loop converges on
wire-thin ends.

## Method

See `README.md`, "Model", and `src/hanger_fit/model.py`. Energy:
E = Σ ½ k_s (|e_j| − l₀)² + Σ ½ k_b φ_i² + Σ m_i g y_i + Σ ½ k_c max(0, r − d_i)²,
with k_s = EA·D/l₀, k_b = B·D/l₀, D = 0.2 m of fabric depth, φ_i the turning angle at node i,
and d_i the distance from node i to the hanger centreline. The gradient is analytic, and a unit
test checks it against finite differences.

## Results

See `README.md`, "Results", and `experiments/results.txt`.

## References

- Baraff, D. and Witkin, A. (1998). Large steps in cloth simulation. *Proc. SIGGRAPH '98*, 43–54.
- Bergou, M., Wardetzky, M., Robinson, S., Audoly, B. and Grinspun, E. (2008). Discrete elastic
  rods. *ACM Transactions on Graphics* 27(3), 63.
- Hansen, N. (2016). The CMA evolution strategy: a tutorial. arXiv:1604.00772.
- Kawabata, S. (1980). *The Standardization and Analysis of Hand Evaluation*, 2nd ed. Textile
  Machinery Society of Japan.
- Nocedal, J. (1980). Updating quasi-Newton matrices with limited storage. *Mathematics of
  Computation* 35(151), 773–782.

These references were not re-checked online in this run.
