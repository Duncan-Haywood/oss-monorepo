"""Write experiments/results.txt: a shared trigger for a camera rig against a trigger per camera (deterministic)."""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from capture_wake.model import Trigger, expected, mean_sim, packs_needed, strategies  # noqa: E402

SEEDS = range(20)
T = Trigger()
N = 4


def main():
    out = []
    S = strategies(N)
    out.append(f"== A. {N}-camera rig, 16 h day, 6 moments/h of 30 s, miss 0.1 (independent per detector), 2 false alarms/h per detector (simulated mean of 20 days)")
    out.append("strategy  rig_Wh  packs  mean_cam_share  every_cam_share  any_cam_share")
    for st in S:
        wh, mean, every, anyc = mean_sim(st, T, 6, 30, SEEDS)
        out.append(f"{st.name.replace(' ', '_')}  {wh:.1f}  {packs_needed(wh)}  {mean:.3f}  {every:.3f}  {anyc:.3f}")
    out.append(f"continuous  {N * 80.0:.1f}  {packs_needed(N * 80.0)}  1.000  1.000  1.000")
    out.append("")
    out.append("== B. Rig energy (Wh) against number of cameras (closed form, 6 moments/h, 30 s)")
    out.append("cameras  independent  sentinel_sleepers  sentinel_standby  anyofN_standby  continuous")
    for n in (1, 2, 3, 4, 6, 8):
        es = [expected(st, T, 6, 30)[0] for st in strategies(n)]
        out.append(f"{n:<8} " + "  ".join(f"{e:10.1f}" for e in es) + f"  {n * 80.0:10.1f}")
    out.append("")
    out.append("== C. Share of event seconds on EVERY camera against the shared part of the miss (miss 0.1 fixed; simulated mean of 20 days)")
    out.append("common  independent  sentinel_standby  anyofN_standby")
    for c in (0.0, 0.02, 0.05, 0.08, 0.1):
        t = replace(T, common=c)
        row = [mean_sim(st, t, 6, 30, SEEDS)[2] for st in (S[0], S[2], S[3])]
        out.append(f"{c:<7} " + "  ".join(f"{v:11.3f}" for v in row))
    out.append("")
    out.append("== D. Rig energy (Wh) against false alarms per detector per hour (closed form, 4 cameras)")
    out.append("false_per_h  independent  sentinel_standby  anyofN_standby")
    for f in (0, 1, 2, 5, 10, 20, 40):
        t = replace(T, false_per_h=f)
        row = [expected(st, t, 6, 30)[0] for st in (S[0], S[2], S[3])]
        out.append(f"{f:<12} " + "  ".join(f"{v:11.1f}" for v in row))
    out.append("")
    out.append("== E. Per-camera share of event seconds against radio hop (s), sentinel + sleepers vs sentinel + standby (closed form)")
    out.append("radio_s  sentinel_sleepers  sentinel_standby")
    for r in (0, 0.5, 2, 5, 7, 8, 10, 15):
        t = replace(T, radio_s=r)
        row = [expected(st, t, 6, 30)[1] for st in (S[1], S[2])]
        out.append(f"{r:<8} " + "  ".join(f"{v:16.3f}" for v in row))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
