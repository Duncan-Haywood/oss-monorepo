# Stake is a tax, not a screen: adverse selection on hardware reliability

*Duncan Haywood. MIT licence. Code and experiments: `../src`, `../tests`, `../experiments`. Related: `spot-check-slashing`, `compute-procurement`, `verification-game`.*

## Abstract
Decentralised compute networks pool heterogeneous devices whose fault rates are private information, and they usually ask workers to post a stake. Can the stake also sort reliable from unreliable hardware? In a risk-neutral model where a worker of hidden fault rate `θ` accepts a contract `(w, s)` (pay `w` on a clean job, slash `s` on a detected fault, capital cost `ρs`, job cost `c`), it cannot. Single crossing runs the wrong way: the indifference slope `(θ+ρ)/(1−θ)` rises with `θ`, so it is the reliable worker who would mimic a high-stake contract. With two types the reliable type's rent is exactly `(θ_H−θ_L)(c+(1+ρ)s_H)/(1−θ_H)`, increasing in the unreliable type's stake, so the designer sets `s_H=0`; with continuous types the envelope `U′(θ)=−(w+s)` makes a flat contract optimal, confirmed against 3000 random menus of 2–4 contracts per size (none better) and over harm `h∈[0,5]`, capital cost `ρ∈[0,0.3]`. A stake that must be posted for deterrence is therefore a tax: it scales reliable workers' rent by `(c+(1+ρ)s)/c` and drives the wage up (0.453→0.702 for `s` 0→1), cutting the pool's fault rate (0.169→0.089) but at 9–55% of profit. Stylised: risk-neutral workers, uniform types, faults always detected.

## 1. Model
A worker's fault probability `θ ~ U[0, θ_max]` is private. Contract `(w, s)`: utility `u = (1−θ)w − θs − ρs − c` (outside option 0). The designer's profit from type `θ` is `(1−θ)(V−w) + θ(s−h)`: value `V` per clean job, `h` per fault, the slash `s` is kept. Total surplus `(1−θ)V − θh − c` does not depend on the contract, so the contract only divides it: designer profit = surplus − worker rent.

## 2. Two types
Types `θ_L<θ_H`, shares `π_L, π_H`. Let the unreliable type's IR bind: `w_H = (c+(ρ+θ_H)s_H)/(1−θ_H)`. The reliable type copying it earns
`R = (θ_H−θ_L)(c+(1+ρ)s_H)/(1−θ_H)` (algebra: `(1−θ_L)(ρ+θ_H)−(θ_L+ρ)(1−θ_H) = (θ_H−θ_L)(1+ρ)`; tests check it against the direct payoff to 12 digits). The reverse mimicry is never attractive (the unreliable type loses). `R` rises with `s_H` at slope `(θ_H−θ_L)(1+ρ)/(1−θ_H)`; with `s≥0` the cheapest screen is `s_H=0`, i.e. one wage `c/(1−θ_H)` for both types. Serving the unreliable type is worth it iff `π_H·S_H ≥ π_L·R` with `S_H` its surplus, i.e. `π_H ≥ R/(R+S_H)`. Example `(θ_L,θ_H,V,c,h)=(0.05,0.4,1,0.3,0.5)`: `R=0.175`, `S_H=0.1`, threshold `π_H*=0.636`; at `π_H=0.63` the designer excludes the unreliable type, at `0.64` serves both.

## 3. Continuous types
Under any menu, incentive compatibility gives `U′(θ)=−(w(θ)+s(θ))` (envelope), and with `U(θ_max)=0` a flat contract has `U(θ)=(w+s)(θ_max−θ)` with `w+s=(c+(1+ρ)s)/(1−θ_max)`. Rent is smallest at `s=0` and stake only adds to it. Numerically: the best flat `(w, s)` over `s∈[0,1]` is `s=0` for all `h∈{0,0.5,2,5}`, `ρ∈{0,0.1,0.3}` (E4), and 3000 random menus of 2, 3, 4 contracts reach 0.2083, 0.2077, 0.2082 against 0.2086 for the flat wage (E6; grid error ~5·10⁻⁴). The flat contract matches a 400 000-draw simulation to 3·10⁻⁵ in profit and 10⁻³ in acceptance and pool fault rate (E5).

## 4. What a deterrence stake costs
Suppose deterrence requires `s≥s_d` (see `spot-check-slashing`). With `θ~U[0,0.6]`, `V=1, c=0.3, h=0.5, ρ=0.1`:

| `s` | best wage | accepting | pool fault rate | profit (vs `s=0`) |
|---|---|---|---|---|
| 0 | 0.453 | 56.4% | 0.169 | 1.000 |
| 0.1 | 0.494 | 51.6% | 0.155 | 0.906 |
| 0.3 | 0.559 | 44.4% | 0.133 | 0.758 |
| 0.6 | 0.631 | 36.7% | 0.110 | 0.598 |
| 1.0 | 0.702 | 29.5% | 0.089 | 0.448 |

Stake does filter the pool through participation (the marginal worker leaves), but the designer pays for it with a higher wage; mean worker rent first rises (0.043→0.051) and then falls as the pool shrinks. The deterrence stake is an incentive cost that arrives *with* an adverse-selection cost, so the two should be priced together: the rent multiplier `(c+(1+ρ)s)/c` is 2.1 at `s=0.3`.

## 5. Limitations and next steps
Risk-neutral workers with no wealth limits; if stake were also capped by wealth or risk-averse types valued insurance, the sign could change. Faults are always detected; partial detection would let audit intensity serve as a second screen. Next: risk-averse workers, and joint design of audit rate and stake for the deterrence constraint.
