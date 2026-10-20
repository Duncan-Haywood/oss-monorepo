"""Write experiments/results.txt: energy and coverage of triggered recording against continuous, on a synthetic day (deterministic)."""
import sys
from dataclasses import replace
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from capture_trigger.model import MODES, Trigger, breakeven_rate, expected, mean_sim, packs_needed  # noqa: E402

CONT, SLEEP, STBY = MODES
SEEDS = range(20)
T = Trigger()


def main():
    out = []
    out.append("== A. Energy (Wh over a 16 h day) against interesting moments per hour; 30 s events, miss 0.1, 2 false alarms/h (simulated mean of 20 days)")
    out.append("rate  continuous  sleep+trigger  standby+preroll")
    for r in (0.5, 1, 2, 4, 8, 12, 20, 40, 60):
        row = [mean_sim(m, T, r, 30, SEEDS)[0] for m in MODES]
        out.append(f"{r:<5} " + "  ".join(f"{v:10.1f}" for v in row))
    out.append("")
    out.append("== B. Share of interesting seconds captured, same sweep (simulated mean of 20 days)")
    out.append("rate  continuous  sleep+trigger  standby+preroll")
    for r in (0.5, 1, 2, 4, 8, 12, 20, 40, 60):
        row = [mean_sim(m, T, r, 30, SEEDS)[1] for m in MODES]
        out.append(f"{r:<5} " + "  ".join(f"{v:10.3f}" for v in row))
    out.append("")
    out.append("== C. Captured share of event seconds against trigger miss probability (closed form; 6 events/h, 30 s)")
    out.append("miss  sleep+trigger  standby+preroll")
    for miss in (0.0, 0.05, 0.1, 0.2, 0.3, 0.5):
        t = replace(T, miss=miss)
        out.append(f"{miss:<5} " + "  ".join(f"{expected(m, t, 6, 30)[1]:12.3f}" for m in (SLEEP, STBY)))
    out.append("")
    out.append("== D. Break-even event rate (events/h above which the mode uses more energy than continuous; closed form)")
    out.append("event_s  sleep+trigger  standby+preroll")
    for ev in (10, 20, 30, 60, 120):
        row = []
        for m in (SLEEP, STBY):
            b = breakeven_rate(m, T, ev)
            row.append("never" if b is None else f"{b:.1f}")
        out.append(f"{ev:<8} " + "  ".join(f"{v:>13}" for v in row))
    out.append("")
    out.append("== E. Standby draw against energy saved (6 events/h, 30 s events; closed form, Wh over 16 h; continuous = 80.0)")
    out.append("idle_w  energy  saving_pct")
    for w in (0.3, 0.6, 0.9, 1.5, 2.5, 4.0):
        m = replace(STBY, idle_w=w)
        e = expected(m, T, 6, 30)[0]
        out.append(f"{w:<7} {e:6.1f}  {100 * (1 - e / 80.0):8.1f}")
    out.append("")
    out.append("== F. 99 Wh packs to carry for the day (6 events/h, 30 s events; closed form)")
    for m in MODES:
        e = expected(m, T, 6, 30)[0]
        out.append(f"{m.name}: {e:.1f} Wh -> {packs_needed(e)} pack(s)")
    (HERE / "results.txt").write_text("\n".join(out) + "\n")


if __name__ == "__main__":
    main()
