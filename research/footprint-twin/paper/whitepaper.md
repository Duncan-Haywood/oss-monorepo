# Footprint twin: a point, circle or calibrated-inflation footprint twin vs a rectangular robot with heading error in a narrow gap

## Question
Navigation simulators usually model the robot as a point or circle with a fixed inflation radius. A non-circular robot passing a narrow gap has a clearance requirement that depends on its heading error. How wrong is a fixed inflation, and can it be calibrated?

## Model
Rectangle `L × W` (`W ≤ L`), gap width `g` with `W ≤ g < L`, heading error `θ ~ N(0, σ²)`. Swept width `f(θ) = W cos θ + L sin|θ| = R sin(|θ| + α)` is increasing in `|θ|` up to `atan(L/W)`, so the robot fits iff `|θ| ≤ θ* = asin(g/R) − α`, with probability `2Φ(θ*/σ) − 1`. The gap needed for pass probability `p` is `R sin(α + zσ)`, `z = Φ⁻¹((1+p)/2)`. Twins: inscribed circle (radius `W/2`), circumscribed circle (`R/2`), and a circle inflated so that its diameter equals the real required gap at a calibration scale `σ₀`. For `n` independent gaps the mission success is the per-gap probability to the power `n`.

## Results
(all from `experiments/results.txt`; `L = 1.0`, `W = 0.5`, 60000 Monte Carlo draws per row.)
1. Closed form vs corner-geometry Monte Carlo: differences ≤ 0.0013 across five (g, σ) settings.
2. At σ = 0.05 real pass probability: 0 (g = 0.50), 0.312 (0.52), 0.581 (0.54), 0.777 (0.56), 0.898 (0.58), 0.960 (0.60), 1.0 from 0.70. The inscribed twin says pass for all g ≥ 0.50; the circumscribed twin says fail for all g < 1.118.
3. Calibrated twin (gap 0.5954 m, exact at σ = 0.05): real gap needed for 95% is 0.539, 0.595, 0.685, 0.768, 0.844, 0.971 m at σ = 0.02, 0.05, 0.10, 0.15, 0.20, 0.30; at the twin's gap the real pass probability is 1.00, 0.95, 0.67, 0.49, 0.38, 0.26.
4. Missions at the calibrated gap, σ = 0.05: real success 0.950, 0.857, 0.774, 0.599, 0.359 for n = 1, 3, 5, 10, 20; twin 1. Gap for a 95% mission: 0.595, 0.616, 0.624, 0.635, 0.645 m.

## Limitations
Stylised simulated truth; Gaussian heading error with fixed σ; no sensing, localisation or map error; no approach dynamics or lateral offset; closed form needs `g < L`; independent gaps; 2-D rectangle. The gap-level calibration failure follows from the model (the required gap is not an affine function of σ); its size depends on the chosen `L`, `W`, `σ₀`.

## Related work
Inflation-based costmaps are standard in robot navigation software; the relevant context for this project is the ARPG, RECUV and CAIRO simulation directions listed in the README. No result here is taken from a specific paper.
