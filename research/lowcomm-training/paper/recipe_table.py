"""Regenerate the tables of `section_recipe.md` from the stored result files (stdlib only).

The "recipe": rand-k (or shaped Gaussian) compression on every sync but the last, the last
sync sent dense. Milestones 6y to 6ae stored, per (noise, H, seed), the recipe's final loss
(`clean`), the fully compressed run's (`full`) and the uncompressed reference (`unc`), on the
standard validation batches (`std`) and on 64 fresh validation batches (`fresh`).

    T = clean - unc   (what the recipe gains or costs; fresh batches are the headline)
    b = full - clean  (what the last compressed sync costs; standard batches)

Everything is paired by seed. No new run: this script only reads the .jsonl files.

    python3 paper/recipe_table.py            # prints the tables
    python3 paper/recipe_table.py --write    # also writes paper/recipe_table.md
"""
import json
import math
import os
import sys
from itertools import product

HERE = os.path.dirname(os.path.abspath(__file__))
GS = os.path.join(HERE, "..", "experiments", "gpt_scale")


def load(name):
    with open(os.path.join(GS, name + ".jsonl")) as f:
        return [json.loads(line) for line in f if line.strip()]


def mse(xs):
    n = len(xs)
    m = sum(xs) / n
    if n < 2:
        return m, float("nan"), n
    sd = math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))
    return m, sd / math.sqrt(n), n


def signflip_p(xs):
    """Exact two-sided paired sign-flip permutation P of the mean."""
    n = len(xs)
    obs = abs(sum(xs))
    hits = 0
    for signs in product((1, -1), repeat=n):
        if abs(sum(s * x for s, x in zip(signs, xs))) >= obs - 1e-15:
            hits += 1
    return hits / 2 ** n


def collect():
    """Return {(H, noise, omega): {seed: dict(clean_std, clean_fresh, full_std, full_fresh)}} and unc."""
    unc = {}  # (H, seed) -> (std, fresh)
    arms = {}
    for r in load("tuned_6y"):
        if r["arm"] == "unc":
            unc[(64, r["seed"])] = (r["std"], r["fresh"])
        elif r["arm"] == "recipe":  # rand-k keep 1/8 with a dense last sync, H = 64
            arms.setdefault((64, "rk8", 7), {}).setdefault(r["seed"], {}).update(
                clean_std=r["std"], clean_fresh=r["fresh"])
    for name in ("recipe_6z", "recipe_6aa", "recipe_6ab", "recipe_6ac", "recipe_6ad", "recipe_6ae"):
        if not os.path.exists(os.path.join(GS, name + ".jsonl")):
            continue
        for r in load(name):
            H, s = r["H"], r["seed"]
            if r["noise"] == "unc":
                unc[(H, s)] = (r["clean_std"], r["clean_fresh"])
                continue
            key = (H, r["noise"], r["omega"])
            d = arms.setdefault(key, {}).setdefault(s, {})
            for k in ("clean_std", "clean_fresh", "full_std", "full_fresh"):
                if k in r:
                    d[k] = r[k]
    # H = 64 keep 1/8 full arm: the stored fully compressed runs of 6x (scale.jsonl) carry std only;
    # its b comes from 6x's last-round forks, so it is left out of the b column here.
    return unc, arms


NOISE_LABEL = {"rk2": "rand-k 1/2", "rk4": "rand-k 1/4", "rk8": "rand-k 1/8", "rk16": "rand-k 1/16",
               "rk32": "rand-k 1/32", "shaped0.33": "Gaussian", "shaped1": "Gaussian",
               "shaped3": "Gaussian", "shaped7": "Gaussian"}


def fmt(x, nd=4):
    return "n/a" if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:+.{nd}f}"


def tables():
    unc, arms = collect()
    lines = []
    out = lines.append
    out("Table A. The recipe against uncompressed training, paired by seed (nats; mean (se), n seeds).")
    out("T = recipe - uncompressed on the 64 fresh batches; P = exact sign-flip P of T; b = fully compressed - recipe (standard batches).")
    out("")
    out("| H | noise | omega | n | T fresh | P | seeds below 0 | b std | b / omega |")
    out("|---|---|---|---|---|---|---|---|---|")
    rows = {}
    for (H, noise, om) in sorted(arms, key=lambda k: (k[0], k[1].startswith("shaped"), k[2])):
        per = arms[(H, noise, om)]
        ss = sorted(s for s in per if (H, s) in unc and "clean_fresh" in per[s])
        Tf = [per[s]["clean_fresh"] - unc[(H, s)][1] for s in ss]
        b = [per[s]["full_std"] - per[s]["clean_std"] for s in ss if "full_std" in per[s]]
        t = mse(Tf)
        bb = mse(b) if b else (None, None, 0)
        rows[(H, noise, om)] = dict(seeds=ss, Tf=Tf, t=t, b=bb)
        om_s = f"{om:.2f}".rstrip("0").rstrip(".") if isinstance(om, float) else str(om)
        out(f"| {H} | {NOISE_LABEL.get(noise, noise)} | {om_s} | {t[2]} | {fmt(t[0])} ({t[1]:.4f}) | "
            f"{signflip_p(Tf):.3f} | {sum(x < 0 for x in Tf)} of {len(Tf)} | "
            f"{fmt(bb[0]) if b else 'n/a'}{f' ({bb[1]:.4f})' if b and bb[2] > 1 else ''} | "
            f"{(bb[0] / om) if b and om else float('nan'):.4f} |".replace("| nan |", "| n/a |"))
    out("")

    # Table B (exploratory, written after the runs): keep 1/4 across H, and a trend in log2 H.
    out("Table B (exploratory, post hoc). Rand-k keep 1/4 with a dense last sync across H, the seeds common to all three H (0 to 3),")
    out("with a per-seed least-squares slope of fresh T on log2 H (nats per doubling of H).")
    out("")
    common = sorted(set(rows[(16, "rk4", 3)]["seeds"]) & set(rows[(32, "rk4", 3)]["seeds"]) & set(rows[(64, "rk4", 3)]["seeds"]))
    Hs = (16, 32, 64)
    xs = [math.log2(h) for h in Hs]
    xm = sum(xs) / 3
    slopes = []
    out("| seed | T fresh H = 16 | H = 32 | H = 64 | slope per doubling |")
    out("|---|---|---|---|---|")
    for s in common:
        ys = [arms[(h, "rk4", 3)][s]["clean_fresh"] - unc[(h, s)][1] for h in Hs]
        ym = sum(ys) / 3
        sl = sum((x - xm) * (y - ym) for x, y in zip(xs, ys)) / sum((x - xm) ** 2 for x in xs)
        slopes.append(sl)
        out(f"| {s} | {ys[0]:+.4f} | {ys[1]:+.4f} | {ys[2]:+.4f} | {sl:+.4f} |")
    m = mse(slopes)
    out(f"| mean (se) | | | | {m[0]:+.4f} ({m[1]:.4f}) |")
    out("")
    out(f"Slope per doubling of H, keep 1/4: {m[0]:+.4f} (se {m[1]:.4f}, {m[0] / m[1]:+.1f} se, n {m[2]}; exact sign-flip P {signflip_p(slopes):.3f}).")
    for noise, om in (("rk2", 1), ("rk8", 7)):
        cs = sorted(set.intersection(*[set(rows[(h, noise, om)]["seeds"]) for h in Hs if (h, noise, om) in rows]))
        if all((h, noise, om) in rows for h in Hs):
            sl = []
            for s in cs:
                ys = [arms[(h, noise, om)][s]["clean_fresh"] - unc[(h, s)][1] for h in Hs]
                ym = sum(ys) / 3
                sl.append(sum((x - xm) * (y - ym) for x, y in zip(xs, ys)) / sum((x - xm) ** 2 for x in xs))
            mm = mse(sl)
            out(f"Slope per doubling of H, {NOISE_LABEL[noise]} (omega {om}): {mm[0]:+.4f} (se {mm[1]:.4f}, {mm[0] / mm[1]:+.1f} se, n {mm[2]}; P {signflip_p(sl):.3f}).")
    out("")

    # Table C: the last sync's cost per unit of omega, by H (pooled over omega, rand-k only).
    out("Table C. The last compressed sync's cost per unit of omega, b / omega (standard batches), rand-k and Gaussian arms with a stored full arm.")
    out("")
    out("| H | arms | b / omega range | pooled b / omega (least squares through 0) |")
    out("|---|---|---|---|")
    for H in Hs:
        pts = []
        per_arm = []
        for (h, noise, om), r in rows.items():
            if h != H or not om or r["b"][2] == 0:
                continue
            per = arms[(h, noise, om)]
            for s in r["seeds"]:
                if "full_std" in per[s]:
                    pts.append((om, per[s]["full_std"] - per[s]["clean_std"]))
            per_arm.append(r["b"][0] / om)
        if not pts:
            continue
        k = sum(o * b for o, b in pts) / sum(o * o for o, _ in pts)
        out(f"| {H} | {len(per_arm)} | {min(per_arm):.4f} to {max(per_arm):.4f} | {k:.4f} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    text = tables()
    print(text)
    if "--write" in sys.argv:
        with open(os.path.join(HERE, "recipe_table.md"), "w") as f:
            f.write("<!-- generated by paper/recipe_table.py; do not edit by hand -->\n\n" + text)
