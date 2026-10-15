# A grid twin over-states every route by a heading-dependent factor that cell size does not remove: 8-connected mean 8(√2−1)/π, worst case 1.0824, and route rankings that depend on map orientation

## Question
Occupancy-grid twins of an environment are planned on with 4-, 8- or 16-connected lattices. How much longer is a route in the twin than the real straight path, does a finer grid fix it, and can the twin rank two routes the wrong way round?

## Model
Real: a straight route of Euclidean length `L` at heading `φ`, no obstacles. Twin: shortest path on the lattice with primitive moves of a 4-, 8- (adds diagonals) or 16-connected (adds (±1,±2), (±2,±1)) neighbourhood, each costing its Euclidean length. Asymptotically (large `L/h`, cell size `h`) the cost of heading `φ` is found by writing the unit vector as a non-negative combination of the two primitives that bracket `φ`: `r_k(φ) = α|p_a| + β|p_b|`. This depends on `φ` and `k` only, not on `h`. For `k = 8` and `φ ∈ [0, 45°]`, `r = cos φ + (√2−1) sin φ` (the octile distance); the mean over a uniform heading is `(4/π)(2√2−2) = 8(√2−1)/π` and the maximum is `cos(π/8) + (√2−1) sin(π/8)` at 22.5°. Pure Python, no dependencies; `r_k` is validated against Dijkstra on an obstacle-free lattice (tests).

## Results
(all numbers from `experiments/results.txt`)
1. **Bias factor.** Mean / maximum (heading): 4-connected 1.2732 (= 4/π) / 1.4142 (45°); 8-connected 1.0548 (= 8(√2−1)/π) / 1.0824 (22.5°); 16-connected 1.0144 / 1.0275 (13.3°, numeric). The factor is 1 along the axes for every `k`. Dijkstra on the lattice equals the formula at every target tried (e.g. 8-conn (40,16): 46.627 both; 16-conn (60,25): 65.902 both).
2. **Not a resolution effect.** A 100 m route at 22.5°, 8-connected, cell 8, 4, 2, 1, 0.5, 0.25, 0.1 m: ratio 1.0824, 1.0822, 1.0824, 1.0824, 1.0824, 1.0824, 1.0824. Refining the grid only changes the lattice rounding of the endpoint.
3. **Calibration.** Dividing by the mean factor fixes the average but leaves a heading-dependent error of −5.2% to +2.6% (8-conn), −21.5% to +11.1% (4-conn), −1.4% to +1.3% (16-conn).
4. **Ranking.** Two routes of Euclidean length 1 and ρ > 1, independent uniform headings: probability the 8-connected twin ranks the longer one shorter, quadrature (MC): ρ = 1.00 0.500 (0.498); 1.01 0.360 (0.359); 1.02 0.267 (0.266); 1.03 0.194 (0.194); 1.05 0.086 (0.086); 1.08 0.0016 (0.0017); ≥ 1.0824 exactly 0. 4-connected: 0.342 at ρ = 1.05 and 0.245 at 1.10; 16-connected: 0.044 at 1.02, 0 at ρ ≥ 1.03.
5. **Map rotation.** Fixed pair, ρ = 1.03, headings 22.5° apart: the 8-connected twin ranks the longer route shorter for 31.1% of map rotations (ρ = 1.02: 37.4%; ρ = 1.05: 19.0%). Pairs 45° or 90° apart never flip, because `r_8` has period 45° so both routes get the same factor.

## Limitations
Free space only, straight routes, no obstacles: with obstacles a grid planner also pays for corner cutting and obstacle inflation, which this does not model, and a route in a real map is a sequence of headings, for which the mean factor is the relevant one only if headings are roughly uniform. The "real" route is a Euclidean straight line, not measured traversal time or energy; travel time or energy is proportional to length only for a constant-speed, constant-cost robot. The 16-connected maximum is numeric, not derived. The ranking probabilities assume independent uniform headings.

## Next steps
Obstacle fields against an exact visibility-graph reference; any-angle planners (Theta*, Lazy Theta*) and their residual error; grid-twin ranking of routes in `uav-energy-twin` and `terrain-twin`; whether a learned policy trained on grid-twin path costs inherits the heading bias.

## References
- Rivera, N., Hernández, C., Baier, J. A. (2020). Grid pathfinding on the 2^k neighborhoods. *AAAI*.
- Daniel, K., Nash, A., Koenig, S., Felner, A. (2010). Theta*: any-angle path planning on grids. *Journal of Artificial Intelligence Research* 39.
- Hart, P. E., Nilsson, N. J., Raphael, B. (1968). A formal basis for the heuristic determination of minimum cost paths. *IEEE Transactions on Systems Science and Cybernetics*.
- Zhao, W., Queralta, J. P. & Westerlund, T. (2020). Sim-to-real transfer in deep reinforcement learning for robotics: a survey. *IEEE SSCI*.
