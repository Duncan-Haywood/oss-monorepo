# Interval scores for drift-tolerance reports

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`.*

## Abstract
A referee that wants a verifier's tolerance *interval* for benign floating-point drift, not just a point, can pay the Winkler interval score `S=(u−l)+(2/α)(l−y)₊+(2/α)(y−u)₊`. It is strictly proper for the pair of α/2 and 1−α/2 quantiles (a sum of two scaled pinball losses, in the property-elicitation view of Frongillo and coauthors). Its regret has a closed form, `(2/α)∫(F−level)`, giving for normal drift a optimal expected score of exactly `4sφ(z)/α`, quadratic shift regret `2f(z)δ²/α`, and a misreport-scale cost table that is *asymmetric with a level-dependent sign*. Under Cauchy drift the scores have infinite mean, yet paired differences between two reports are bounded, so regret and detection remain well defined.

## 1. Setup
Drift `Y~F` (location-scale, scale `s`), report `[l,u]`, level α. `∂E S/∂l=−1+(2/α)F(l)` and `∂E S/∂u=(2/α)(F(u)−(1−α/2))`, so `E S` is minimised at `l*=F⁻¹(α/2)`, `u*=F⁻¹(1−α/2)` and the regret is `R_l+R_u` with `R_t=(2/α)∫_{q}^{t}(F(x)−level)dx≥0` on both sides of the quantile. With `∫Φ=zΦ+φ` (normal) and `∫F=x/2+(x·atan(x/s)−(s/2)ln(1+x²/s²))/π` (Cauchy) this is exact; tests check zero at the quantiles, positivity elsewhere, and agreement with 240k-point quadrature of the score difference.

## 2. Value of the optimal report
For normal drift, `E S*=2zs+(4/α)s(φ(z)−zα/2)=4sφ(z)/α`: 2.54, 3.51, 4.13, 4.68, 5.78 (×s) for α=0.5, 0.2, 0.1, 0.05, 0.01, matching 4·10⁵-sample means to 0.003 (E1). This is the sharpness price of honesty: a verifier that knows the drift scale twice as well cannot be told apart by score unless its width is smaller.

## 3. Shifts and scale misreports
A common shift δ costs `2f(z)δ²/α` (ratio to exact 1.000 at δ=0.05, 1.127 at δ=1; E3). Misreporting the half-width by a factor λ (α=0.1) costs 0.519, 0.159, 0.035, 0.037, 0.152, 0.596 optimal scores at λ=0.5, 0.7, 0.85, 1.18, 1.4, 2 (E2). The ratio narrow-by-1.4 / wide-by-1.4 is 0.74 at α=0.2, 0.94 at 0.1, 1.19 at 0.05: at high coverage the tail term makes narrowing costlier, at low coverage the width term makes widening costlier, so there is no universal “overconfidence is worse” rule for this score.

## 4. Heavy tails
For Cauchy drift `E(Y−u)₊=∞`, so the expected payment does not exist: the running mean of the optimal score is 56, 88, 123, 119 after 10³, 10⁴, 10⁵, 2·10⁵ tasks (E4) and never settles. But the paired difference of two reports equals a bounded function of `y` (it is constant beyond both intervals), so its mean is the exact regret (1.361 vs simulated 1.356±0.025 at λ=0.6; 1.1805 vs 1.1806 at λ=1.5) and its variance is finite. Practical rule: evaluate verifiers by paired differences against a benchmark report, never by raw score means.

## 5. Detection
Normal drift, α=0.1, z-test at 1.645 on the paired difference (E5): a half-width off by factor 0.5, 0.7, 0.85, 1.18, 1.4 needs n=20, 70, 326, 243, 44 tasks. Coverage alone (claimed 0.10, true 0.05/0.15/0.20) needs 290/467/133, so the score sees width errors much faster than a coverage count sees a comparable miscalibration.

## 6. Limits
Known location family, risk-neutral verifiers, α fixed and public, one interval per task, closed forms only for normal and Cauchy (others by quadrature). Payments are unbounded (`2/α` times the excess), unlike the bounded window loss in `mode-elicitation`; a bounded variant is not developed. Companion to `interval-elicitation` (which covers the bounded shortest-interval loss and lognormal drift; this note adds the closed-form optimum, level-dependent misreport asymmetry and detection tables). Related in this repo: `property-elicitation-verification`, `tail-risk-elicitation`, `crps-drift-scoring`, `mode-elicitation`.
