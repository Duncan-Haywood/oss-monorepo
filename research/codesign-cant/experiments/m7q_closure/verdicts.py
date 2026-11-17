"""Milestone 7q: the pre-registered checks Q1-Q6 (LOG.md) on results.json, paired by design where the prediction says so. Writes verdicts.txt."""
import json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
R = json.load(open(os.path.join(HERE, "results.json")))["runs"]
P7 = {(r["label"], r["geom"], r["seed"]): r for r in json.load(open(os.path.join(HERE, "..", "m7p_frame_law", "results.json")))["runs"]}
LABS = ["7e", "7l t45 cap wide", "aware cap wide", "aware cap wide fixL"]
GEOMS = ["above", "below"]


def ok(r, k, j=0):
    return r[f"{k}_rho"][j] < 1.0 and r[f"{k}_feasible"][j]


def sets():
    for g in GEOMS:
        for lab in LABS:
            yield g, lab, [r for r in R if r["label"] == lab and r["geom"] == g]


L = ["Milestone 7q verdicts (pre-registered in LOG.md; L2-45 = diverged flights at lever 2, 45 deg, cap, of 64 per design).", ""]
# Q1
diff = n = 0
own = {}
for r in R:
    q = P7[(r["label"], r["geom"], r["seed"])]
    for c in [k for k in r if k.startswith("own_inh60_dead_")]:
        t = c[len("own_inh60_dead_"):]
        n += 1; diff += r[c][0] != q[f"dead_inh_{t}"][-1]
    for j, x in enumerate(r["grid"]):
        i = q["L"].index(x)
        for c in [k for k in r if k.startswith("grid_inh60_dead_")]:
            t = c[len("grid_inh60_dead_"):]
            n += 1; diff += r[c][j] != q[f"dead_inh_{t}"][i]
for g, lab, rs in sets():
    own[(g, lab)] = sum(r["own_inh60_dead_45_2"][0] for r in rs)
L.append(f"Q1: inh60 against 7p inh, all conditions, own L and grid: {diff} of {n} counts differ. Own-L L2-45: " +
         "; ".join(f"{g} {lab} {v}" for (g, lab), v in own.items()))
# Q2
rs = [r for r in R if r["label"] == "7l t45 cap wide" and r["geom"] == "below"]
v = sum(r["own_inh_dead_45_2"][0] for r in rs if ok(r, "own_inh"))
L.append(f"Q2: 7l below under inh (exact), {sum(ok(r, 'own_inh') for r in rs)} valid: L2-45 {v} (inh60 105); within 5: {abs(v - 105) <= 5}")
# Q3, Q4: paired by design
for q, c in (("Q3", "mot"), ("Q4", "src_li")):
    up, rows = 0, []
    for g, lab, rs in sets():
        both = [r for r in rs if ok(r, f"own_{c}") and ok(r, "own_inh60")]
        a = sum(r["own_inh60_dead_45_2"][0] for r in both); b = sum(r[f"own_{c}_dead_45_2"][0] for r in both)
        per = [r[f"own_{c}_dead_45_2"][0] - r["own_inh60_dead_45_2"][0] for r in both]
        rows.append(f"{g} {lab}: n {len(both)}, inh60 {a} -> {c} {b} (per design {per})")
        if len(both) >= (2 if q == "Q4" else 1):
            up += b > a
    elig = sum(1 for g, lab, rs in sets() if sum(ok(r, f"own_{c}") and ok(r, "own_inh60") for r in rs) >= (2 if q == "Q4" else 1))
    L.append(f"{q}: {c} against inh60, own L, paired over designs valid under both: higher in {up} of {elig} eligible set-geometries")
    L += ["    " + x for x in rows]
# Q5
rs = [r for r in R if r["label"] == "7l t45 cap wide" and r["geom"] == "below"]
seq, worst = [], 0
for j, x in enumerate(rs[0]["grid"]):
    seq.append((x, [ok(r, "grid_src_li", j) for r in rs], [r["grid_src_li_dead_45_2"][j] for r in rs]))
for (x0, o0, d0), (x1, o1, d1) in zip(seq, seq[1:]):
    both = [i for i in range(len(rs)) if o0[i] and o1[i]]
    if both:
        worst = max(worst, sum(d1[i] for i in both) - sum(d0[i] for i in both))
L.append(f"Q5: src_li grid, 7l below, largest rise between consecutive points over seeds valid at both: {worst} (held if <= 2)")
L.append("    " + "; ".join(f"{x:.3f}: {sum(o)} ok, {sum(d for d, k in zip(dd, o) if k)}" for x, o, dd in seq))
# Q6
for g in GEOMS:
    rs = [r for r in R if r["label"] == "7l t45 cap wide" and r["geom"] == g]
    a = np.median([r["own_inh60_J_45_1"][0] for r in rs if ok(r, "own_inh60")]); b = np.median([r["own_mot_J_45_1"][0] for r in rs if ok(r, "own_mot")])
    L.append(f"Q6: 7l {g}, lever-1 45 deg median J: inh60 {a:.3f}, mot {b:.3f}, |diff| {abs(a - b):.3f} (held if <= 0.10)")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L))

# Post hoc (not pre-registered): designs that close under the exact solve with the inherited constants, paired with inh60
L += ["", "Post hoc: designs with a fixed point under inh (exact), against the same designs under inh60 (mass kg, L2-45):"]
for g, lab, rs in sets():
    both = [r for r in rs if ok(r, "own_inh") and ok(r, "own_inh60")]
    L.append(f"  {g} {lab}: n {len(both)}; " + ", ".join(f"s{r['seed']} {r['own_inh60_mass'][0]:.3f}->{r['own_inh_mass'][0]:.3f} kg, {r['own_inh60_dead_45_2'][0]}->{r['own_inh_dead_45_2'][0]}" for r in both))
nc = [r for r in R if r["own_inh_mass"][0] >= 20]
L.append(f"  no fixed point at 15 min: {len(nc)} of {len(R)}; their inh60 masses {min(r['own_inh60_mass'][0] for r in nc):.3f}-{max(r['own_inh60_mass'][0] for r in nc):.3f} kg"
         f" (median {np.median([r['own_inh60_mass'][0] for r in nc]):.3f}); designs with a fixed point: inh60 median {np.median([r['own_inh60_mass'][0] for r in R if r['own_inh_mass'][0] < 20]):.3f} kg")
L.append(f"  heavy-basin designs (inh60 mass >= 1.7 kg): {sum(r['own_inh60_mass'][0] >= 1.7 for r in R)}, of which with a fixed point: {sum(r['own_inh60_mass'][0] >= 1.7 and r['own_inh_mass'][0] < 20 for r in R)}")
open(os.path.join(HERE, "verdicts.txt"), "w").write("\n".join(L) + "\n")
print("\n".join(L[-12:]))
