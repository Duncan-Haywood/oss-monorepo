"""Figure for milestone 2: held-out RMS attitude error against hover power for every co-designed vehicle, by mixer and cant bound,
with the price on hover power (lam) as marker size; and the chosen cant against lam."""
import json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))
fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.2))
style = {("box", 0): ("#8a8a8a", "o"), ("box", 80): ("#8a8a8a", "^"), ("prio", 0): ("#1f6fb2", "o"), ("prio", 80): ("#1f6fb2", "^"),
         ("prio_free", 0): ("#d9822b", "o"), ("prio_free", 80): ("#d9822b", "^")}
lams = sorted({r["lam"] for r in R["runs"]})
for (mix, cap), (c, mk) in style.items():
    rs = [r for r in R["runs"] if r["mix"] == mix and r["cap"] == cap]
    a1.scatter([r["power"] for r in rs], [r["rms"] for r in rs], s=[14 + 60 * r["lam"] for r in rs], c=c, marker=mk, alpha=0.7,
               label=f"{mix}, {'no cant' if cap == 0 else 'cant <= 80°'}")
    if cap == 80:
        rows = [next(t for t in R["table"] if (t["mix"], t["cap"], t["lam"]) == (mix, cap, l)) for l in lams if any(t["mix"] == mix and t["lam"] == l for t in R["table"])]
        xs = [t["lam"] for t in rows]
        for t in rows:
            a2.scatter([t["lam"]] * len(t["alpha"]), t["alpha"], c=c, s=14, alpha=0.7)
        a2.plot(xs, [sorted(t["alpha"])[len(t["alpha"]) // 2] for t in rows], c=c, label=f"{mix} (median)")
RS = json.load(open(os.path.join(HERE, "restarts.json"))) if os.path.exists(os.path.join(HERE, "restarts.json")) else []
rr = sorted({r["lam"] for r in RS if r["cap"] == 80})
for l in rr:
    a2.scatter([l + 0.02] * 5, [r["alpha_deg"] for r in RS if r["cap"] == 80 and r["lam"] == l], marker="x", c="#1f6fb2", s=22)
if rr:
    a2.plot([l + 0.02 for l in rr], [sorted(r["alpha_deg"] for r in RS if r["cap"] == 80 and r["lam"] == l)[2] for l in rr], c="#1f6fb2", ls="--",
            marker="x", label="prio, best of 3 starts (median)")
a1.set_xscale("log"); a1.set_xlabel("hover power of the co-designed vehicle (W, log)"); a1.set_ylabel("held-out RMS attitude error (deg)")
a1.legend(fontsize=7, frameon=False); a1.grid(alpha=0.3); a1.set_title("Each dot one seed; larger = higher price on power", fontsize=9)
a2.set_xlabel("price on hover power, lam (deg per 100 W)"); a2.set_ylabel("chosen cant (deg), bound 80°"); a2.grid(alpha=0.3)
a2.legend(fontsize=7, frameon=False); a2.set_title("Chosen cant as power is priced (x: best of 3 CMA-ES starts)", fontsize=9)
fig.suptitle(f"Milestone 2: co-designed canted quadrotor, TWR 2, c = {R['c']} (UIUC median); simulated", fontsize=10)
fig.tight_layout()
fig.savefig(os.path.join(HERE, "m2_polytope.png"), dpi=130)
print("wrote m2_polytope.png")
