"""Break-even human nailing time per sheet for a G1 (walking or on a base). Deterministic, under a second."""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from buildbot_nailpay import model as M  # noqa: E402
from buildbot_nailpay.model import C  # noqa: E402


def main():
    mb, tb = M.load(M.MOBILEBASE), M.load(M.TASKBOOK)
    wage = C.WAGE_CARPENTER * 1.3
    times = M.robot_sheet_times(mb)
    hand = M.hand_sheet_seconds(tb)
    n_sheets = M.sheets(tb)
    out = {"wage": wage, "hand_taskbook_s": hand, "sheets_wall": n_sheets, "robot_s": times, "grid": [], "p_saves": {}}
    print(f"loaded wage ${wage:.2f}/h; taskbook hand time {hand:.0f} s a sheet; {n_sheets:.0f} wall sheets in the scope")
    print("== A. robot seconds per sheet (buildbot-mobilebase)")
    for k, v in times.items():
        print(f"{k:24s} {v:7.1f}")
    print("== B. break-even person seconds per sheet (robot saves money above this); G1 $16000, life 6000 h, upkeep 10%, 1000 h/yr")
    print("config                   base$  sup0.1  sup0.3  sup0.5  sup1.0   rate$/h")
    for k, v in times.items():
        for base in ([0] if k.startswith("walking") else [10000, 30000]):
            rate = M.hourly_rate(C.PRICE_USD["G1"], base, 6000, 0.10, 1000)
            bs = {s: M.breakeven_hand_seconds(v, wage, rate, s) for s in (0.1, 0.3, 0.5, 1.0)}
            out["grid"].append({"config": k, "base": base, "rate": rate, "breakeven_s": bs})
            print(f"{k:24s} {base:6d} " + " ".join(f"{bs[s]:7.0f}" for s in (0.1, 0.3, 0.5, 1.0)) + f"   {rate:6.2f}")
    print("== C. share of 4000 draws in which the robot saves money (person time 60 to 720 s uniform, supervision 0.1 to 1.0, base 0 or $5k to $40k, life 3000-10000 h, use 500-1800 h/yr)")
    for k, v in times.items():
        p = M.p_saves(v)
        out["p_saves"][k] = p
        print(f"{k:24s} {p:6.3f}")
    print("== D. dollars per house on the taskbook's wall sheathing, at supervision 0.3, G1 only (walking 5 s a step) and base median $20000")
    for label, base, key in (("walking 5 s", 0, "walking, 5 s a step"), ("base median $20k", 20000, "base, median")):
        rate = M.hourly_rate(C.PRICE_USD["G1"], base, 6000, 0.10, 1000)
        row = {}
        for h in (120, 240, 372, 600):
            row[h] = n_sheets * M.saving_per_sheet(h, times[key], wage, rate, 0.3)
        out.setdefault("per_house", {})[label] = row
        print(f"{label:18s} " + "  ".join(f"hand {h} s: ${v:7.0f}" for h, v in row.items()))
    (HERE / "results.json").write_text(json.dumps(out, indent=1))


main()
