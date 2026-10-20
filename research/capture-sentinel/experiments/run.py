"""Write experiments/results.txt: where to put the sentinel in a camera ring (deterministic)."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from capture_sentinel.model import (Detector, best_sentinel, expected_miss, miss_all, miss_all_independent,  # noqa: E402
                                    ring_angles, rig_energy_wh, simulate_miss)

D = Detector()
K = 2.0
N = 4


def main():
    out = []
    cams = ring_angles(N)
    out.append(f"== A. Mean miss rate of a lone sentinel by its bearing from the favourite facing direction (kappa {K}, closed form; simulated 40000 moments)")
    out.append("bearing_deg  miss_closed  miss_simulated")
    for b in (0, 45, 90, 135, 180):
        out.append(f"{b:<12} {expected_miss(D, b, K):.4f}       {simulate_miss(D, [float(b)], K, 40000, 1):.4f}")
    out.append("")
    out.append(f"== B. Best-camera sentinel miss against how strongly the subject favours one direction (kappa), {N}-camera ring, camera 0 at the favourite direction")
    out.append("kappa  best_sentinel_miss  worst_sentinel_miss  mean_over_cameras  best_index")
    for k in (0.0, 0.5, 1.0, 2.0, 4.0, 8.0):
        ms = [expected_miss(D, c, k) for c in cams]
        i, m = best_sentinel(D, cams, k)
        out.append(f"{k:<6} {m:.4f}              {max(ms):.4f}               {sum(ms) / len(ms):.4f}            {i}")
    out.append("")
    out.append(f"== C. Probability every listening camera misses a moment (kappa {K}): shared facing (correct) against independent misses (capture-wake's assumption)")
    out.append("layout  cameras  shared_facing  independent  ratio_shared_to_independent")
    for name, cs in (("ring4", ring_angles(4)), ("ring8", ring_angles(8)), ("front_arc_3", [-45.0, 0.0, 45.0]),
                     ("cluster_4", [0.0, 10.0, 20.0, 30.0])):
        a, b = miss_all(D, cs, K), miss_all_independent(D, cs, K)
        out.append(f"{name:<11} {len(cs):<8} {a:.2e}      {b:.2e}     {a / b:.2f}")
    out.append("")
    out.append(f"== D. Strategy comparison, {N}-camera ring, kappa {K}: share of moments that wake the rig, and rig Wh over 16 h (6 moments/h of 30 s, 2 false alarms/h per detector)")
    out.append("strategy  p_wake  rig_Wh")
    best_i, best_m = best_sentinel(D, cams, K)
    worst_m = max(expected_miss(D, c, K) for c in cams)
    mean_m = sum(expected_miss(D, c, K) for c in cams) / N
    anyn = miss_all(D, cams, K)
    for name, m, nd in (("best_sentinel", best_m, 1), ("worst_sentinel", worst_m, 1), ("rotating_sentinel", mean_m, 1),
                        ("any_of_4", anyn, N)):
        out.append(f"{name:<17} {1 - m:.4f}  {rig_energy_wh(N, nd, 1 - m):.1f}")
    out.append("")
    out.append(f"== E. Any-of-N miss against ring size (kappa {K})")
    out.append("cameras  best_sentinel_miss  any_of_N_miss  extra_false_alarm_detectors")
    for n in (2, 3, 4, 6, 8):
        cs = ring_angles(n)
        out.append(f"{n:<8} {best_sentinel(D, cs, K)[1]:.4f}              {miss_all(D, cs, K):.2e}       {n - 1}")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
