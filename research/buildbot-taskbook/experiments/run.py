"""Build the task book of the framing-house and sweep its minutes per unit. Deterministic, a few seconds.

Writes taskbook.csv and taskbook.json next to this file and prints results.txt.
"""
import csv
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from buildbot_taskbook import model as M  # noqa: E402

DRAWS = 4000


def main():
    q = M.quantities()
    T = M.tasks(q)
    env = M.load_envelope()
    k = M.framing_scale_to_norm(T, q)
    rows, out = [], []
    P = out.append
    P(f"buildbot-taskbook: {q['pieces']} framing pieces, {q['wall_lf']:.0f} ft of wall, {q['wall_sheets']} wall sheets, "
      f"{q['roof_sheets']} roof sheets, {q['drywall_wall_sheets'] + q['drywall_ceiling_sheets']} drywall sheets, "
      f"{q['drywall_ft2']:.0f} ft2 of board (28 x 40 ft one-storey house of house-framing, conventional 2x6 at 16 in)")
    P(f"payload envelopes: buildbot-payload results.json; minutes swept log-uniformly x1/{M.SWEEP:g} to x{M.SWEEP:g}, {DRAWS} draws, seed 1")
    P("")
    P("A. cross-check of the framing rows against one cited norm")
    P(f"   lumber in the takeoff {q['lumber_lf']:.0f} lf x {M.METHVIN_MHR_PER_FT:.4f} man-hours/ft (Methvin, 0.12 mhr/m, a 2x3 rate) = {M.methvin_hours(q):.1f} h")
    mine = sum(M.hours(t) for t in T if t["trade"] == "framing")
    P(f"   my framing rows (F1-F6) at their mid minutes: {mine:.1f} h; the norm is {k:.1f}x that. Scenario B scales F1-F6 by {k:.2f}")
    P("")
    res = {}
    for name, scale in (("A my minutes", 1.0), ("B framing scaled to the norm", k)):
        sw = M.sweep(T, env, DRAWS, 1, framing_scale=scale)
        res[name] = (scale, sw)
        P(f"B. scenario '{name}': total {sum(M.hours(t, framing_scale=scale) for t in T):.0f} crew-hours at mid minutes; "
          f"5-95% over the sweep {M.pct(sw['total'], .05):.0f}-{M.pct(sw['total'], .95):.0f}")
        P(f"   share of hours in tasks whose payload test a robot passes (hand tasks only; force, vision and tolerance not tested): "
          f"G1 palm {M.pct(sw['share']['g1-palm'], .05):.2f}-{M.pct(sw['share']['g1-palm'], .95):.2f} (median {M.pct(sw['share']['g1-palm'], .5):.2f}), "
          f"H1 palm {M.pct(sw['share']['h1-palm'], .05):.2f}-{M.pct(sw['share']['h1-palm'], .95):.2f} (median {M.pct(sw['share']['h1-palm'], .5):.2f})")
        P("")
    P("C. the task book (scenario A hours; P(top5) = share of sweep draws where the task is among the five costliest)")
    P(f"   {'id':3} {'verb':8} {'task':56} {'unit':12} {'n':>6} {'kg':>11} {'tol mm':>6} {'h mid':>6} {'h 5-95%':>11} {'P(top5)':>8} {'H1':>13} {'G1':>13} {'load':>5}")
    sw = res["A my minutes"][1]
    swB = res["B framing scaled to the norm"][1]
    tot = sum(M.hours(t) for t in T)
    for i, t in enumerate(T):
        h1, c1 = M.verdict(t, env, "h1-palm")
        g1, c2 = M.verdict(t, env, "g1-palm")
        lr = M.load_ratio(t, env, "h1-palm")
        kg = f"{t['kg'][0]:.1f}-{t['kg'][1]:.1f}" if abs(t["kg"][0] - t["kg"][1]) > 0.05 else f"{t['kg'][0]:.1f}"
        tol = '' if t['tol_mm'] is None else f"{t['tol_mm']:.1f}"
        p5 = sum(1 for r in sw["rank"][i] if r <= 5) / DRAWS
        p5b = sum(1 for r in swB["rank"][i] if r <= 5) / DRAWS
        P(f"   {t['id']:3} {t['verb']:8} {t['what'][:56]:56} {t['unit'][:12]:12} {t['n']:6.0f} {kg:>11} {tol:>6} "
          f"{M.hours(t):6.1f} {M.pct(sw['hours'][i], .05):5.1f}-{M.pct(sw['hours'][i], .95):5.1f} {p5:8.2f} {h1:>13} {g1:>13} {'' if lr is None else f'{lr:.2f}':>5}")
        rows.append({"id": t["id"], "trade": t["trade"], "verb": t["verb"], "task": t["what"], "unit": t["unit"],
                     "cycles": round(t["n"], 1), "mass_kg_low": round(t["kg"][0], 2), "mass_kg_high": round(t["kg"][1], 2),
                     "hand_height_m": t["z"], "reach_m": t["x"], "minutes_per_unit_mid": t["minutes"],
                     "tolerance_mm": t["tol_mm"], "tolerance_basis": t["tol_basis"], "mass_shared_with_person": t["share"] == "shared",
                     "crew_hours_mid_A": round(M.hours(t), 2), "crew_hours_5pct_A": round(M.pct(sw["hours"][i], .05), 2),
                     "crew_hours_95pct_A": round(M.pct(sw["hours"][i], .95), 2),
                     "crew_hours_mid_B": round(M.hours(t, framing_scale=k), 2),
                     "p_top5_A": p5, "p_top5_B": p5b, "h1_payload": h1, "h1_capacity_kg": None if c1 is None else round(c1, 1),
                     "g1_payload": g1, "g1_capacity_kg": None if c2 is None else round(c2, 1),
                     "h1_load_ratio": None if lr is None else round(lr, 3), "note": t["note"]})
    P("   load = needed mass (half if shared) over the H1's conservative capacity at the task's hand height and reach")
    P("")
    P("D. hours by what the stock humanoids can do, mid minutes, scenario A / scenario B")
    for label, sel in (("H1 passes the payload test", lambda t: M.verdict(t, env, "h1-palm")[0] == "yes"),
                       ("H1 fails payload (too heavy)", lambda t: M.verdict(t, env, "h1-palm")[0] == "no"),
                       ("out of the H1's reach envelope", lambda t: M.verdict(t, env, "h1-palm")[0] == "out of reach"),
                       ("G1 passes the payload test", lambda t: M.verdict(t, env, "g1-palm")[0] == "yes")):
        a = sum(M.hours(t) for t in T if sel(t))
        b = sum(M.hours(t, framing_scale=k) for t in T if sel(t))
        ta, tb = sum(M.hours(t) for t in T), sum(M.hours(t, framing_scale=k) for t in T)
        P(f"   {label:34} {a:6.1f} h ({a / ta:4.0%}) / {b:6.1f} h ({b / tb:4.0%})")
    P("")
    P("E. cost per unit of robot difficulty: hours divided by the H1 load ratio (floor 0.25), tasks the H1 can reach, scenario A")
    cand = [(M.hours(t) / max(M.load_ratio(t, env) or 0, 0.25), t) for t in T if M.load_ratio(t, env) is not None]
    for v, t in sorted(cand, key=lambda x: -x[0])[:6]:
        P(f"   {t['id']:3} {t['what'][:60]:60} {v:6.1f} h per unit load ratio")
    P("")
    P("F. hours by trade, scenario A / B")
    for tr in dict.fromkeys(t["trade"] for t in T):
        a = sum(M.hours(t) for t in T if t["trade"] == tr)
        b = sum(M.hours(t, framing_scale=k) for t in T if t["trade"] == tr)
        P(f"   {tr:11} {a:6.1f} h / {b:6.1f} h")
    P("")
    P("G. hours by verb, scenario A / B, and the number of fasteners driven")
    for v in dict.fromkeys(t["verb"] for t in T):
        a = sum(M.hours(t) for t in T if t["verb"] == v)
        b = sum(M.hours(t, framing_scale=k) for t in T if t["verb"] == v)
        P(f"   {v:8} {a:6.1f} h ({a / tot:4.0%}) / {b:6.1f} h ({b / sum(M.hours(t, framing_scale=k) for t in T):4.0%})")
    P(f"   fasteners driven: {sum(t['n'] for t in T if t['verb'] == 'fasten'):.0f}")
    with open(HERE / "taskbook.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    (HERE / "taskbook.json").write_text(json.dumps({"house": "28 x 40 ft, one storey, conventional 2x6 at 16 in (research/house-framing)",
                                                    "quantities": q, "framing_scale_to_norm": k, "tasks": rows}, indent=1))
    print("\n".join(out))


if __name__ == "__main__":
    main()
