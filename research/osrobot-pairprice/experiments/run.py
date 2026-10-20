"""Experiments for osrobot-pairprice. `python3 experiments/run.py > experiments/results.txt`."""
import random, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_pairprice import model as M, econ as E

SEEDS = range(20)
SIZES = [(30, 15), (60, 30), (90, 45), (120, 60), (180, 90)]   # field X, Y in metres
SPEEDS = (0.5, 0.75, 1.0, 1.5, 2.0, 3.0)                        # inline speeds that bracket the pair's kill
V_SCOUT = 1.0                                                  # scout speed, 3 m swath (osrobot-scoutpair's matched-kill row)
KEYS = ("kill", "ground_min", "fly_min", "energy_wh")


def ha(xy):
    return xy[0] * xy[1] / 1e4


def mean(rows):
    return {k: sum(r[k] for r in rows) / len(rows) for k in KEYS}


def run(xy, planner, **kw):
    rows = []
    for s in SEEDS:
        F = M.Field(s, X=xy[0], Y=xy[1]); r = random.Random(1000 + s)
        if planner == "inline":
            x = M.run_inline(F, r, **kw); x.update(ground_min=x["time_min"], fly_min=0.0)
        else:
            x = M.run_pair(F, r, plan="euclid", **kw)
        rows.append(x)
    return mean(rows)


def matched(curve, kill):
    """Inline ground minutes and Wh at the given kill share, interpolated along the inline speed curve."""
    pts = sorted((c["kill"], c["ground_min"], c["energy_wh"]) for c in curve)
    ks = [p[0] for p in pts]
    return E.interp(ks, [p[1] for p in pts], kill), E.interp(ks, [p[2] for p in pts], kill)


print(f"# osrobot-pairprice results: {len(SEEDS)} seeds per row; weeds 0.3/m2 clustered, 20% muddy blocks, euclid tour (fields and random draws shared across rows)")
print(f"# Pair: scout v={V_SCOUT} m/s, 3 m swath, treater v=1.5 m/s. Inline: p_max 0.7, 1 m swath, speeds {SPEEDS}. All prices ASSUMED (econ.py).")
print(f"# Constants: inline {E.CAP_INLINE:.0f} USD; scout {E.CAP_SCOUT:.0f} + treater {E.CAP_TREATER:.0f}; {E.ANNUAL:.0%}/yr over {E.HOURS_YEAR:.0f} occupied h; labour {E.LABOUR:.0f} USD/h;")
print(f"# set-up {E.SETUP_GROUND_MIN:.0f} min ground, {E.SETUP_SCOUT_MIN:.0f} min scout; battery {E.ENDURANCE_MIN:.0f} min, swap {E.SWAP_MIN:.0f} min; electricity {E.ELEC} USD/kWh")

sim = {}
for xy in SIZES:
    sim[xy] = dict(pair=run(xy, "pair", v_scout=V_SCOUT), inline=[dict(v=v, **run(xy, "inline", v=v)) for v in SPEEDS])

print("\n# Sweep 1: simulated minutes by field size (inline matched to the pair's kill share)")
print(f"{'field m':<10}{'ha':>7}{'kill':>7}{'fly':>8}{'ground':>8}{'inline':>8}{'pair Wh':>9}{'inl Wh':>8}")
rows = {}
for xy in SIZES:
    p = sim[xy]["pair"]; im, ie = matched(sim[xy]["inline"], p["kill"])
    rows[xy] = (p, im, ie)
    print(f"{f'{xy[0]}x{xy[1]}':<10}{ha(xy):>7.3f}{p['kill']:>7.3f}{p['fly_min']:>8.1f}{p['ground_min']:>8.1f}{im:>8.1f}{p['energy_wh']:>9.0f}{ie:>8.0f}")

A = [ha(xy) for xy in SIZES]
fits = {n: E.fit_line(A, [f(rows[xy]) for xy in SIZES]) for n, f in
        (("fly_min", lambda r: r[0]["fly_min"]), ("ground_min", lambda r: r[0]["ground_min"]), ("inline_min", lambda r: r[1]),
         ("pair_wh", lambda r: r[0]["energy_wh"]), ("inline_wh", lambda r: r[2]))}
print("\n# Sweep 2: straight-line fit, minutes or Wh = c + m * hectares, over the five simulated sizes")
print(f"{'quantity':<12}{'c':>9}{'m per ha':>11}{'R2':>8}")
for n, (c, m, r2) in fits.items():
    print(f"{n:<12}{c:>9.2f}{m:>11.1f}{r2:>8.4f}")


def model(a, **kw):
    """(inline USD, pair USD unheld, pair USD held) for a field of a hectares, from the fits."""
    f = lambda n: max(0.0, fits[n][0] + fits[n][1] * a)
    held = kw.pop("held_too", True)
    i = E.inline_cost(f("inline_min"), f("inline_wh"), **{k: v for k, v in kw.items() if k in ("cap", "hours", "annual", "labour", "setup", "elec")})
    pk = {k: v for k, v in kw.items() if k not in ("cap",)}
    pk.pop("setup", None)
    return i, E.pair_cost(f("fly_min"), f("ground_min"), f("pair_wh"), **pk), E.pair_cost(f("fly_min"), f("ground_min"), f("pair_wh"), held=True, **pk)


print("\n# Sweep 3: USD per hectare at the reference prices (unheld = each machine charged for its own minutes; held = both for the whole job)")
print(f"{'ha':>8}{'inline':>9}{'pair':>9}{'held':>9}{'pair/inl':>10}{'held/inl':>10}   source")
for a in (0.045, 0.18, 0.405, 0.72, 1.62, 5.0, 20.0):
    i, p, h = model(a)
    print(f"{a:>8.3f}{i / a:>9.2f}{p / a:>9.2f}{h / a:>9.2f}{p / i:>10.2f}{h / i:>10.2f}   {'simulated size' if a <= 1.62 else 'extrapolated from fit'}")

print("\n# Sweep 4: break-even field size (hectares) where the pair's USD per field equals the inline robot's, by scout price (unheld, held)")
print(f"{'scout USD':>10}{'unheld':>10}{'held':>10}")
for cs in (1000, 1500, 2500, 4000, 6000):
    out = []
    for idx in (1, 2):
        g = lambda a, idx=idx: model(a, cap_scout=cs)[idx] - model(a, cap_scout=cs)[0]
        r = E.bisect(g, 0.005, 200.0)
        out.append("none" if r is None else f"{r:.2f}")
    print(f"{cs:>10}{out[0]:>10}{out[1]:>10}")

print("\n# Sweep 5: pair USD per hectare over inline USD per hectare, one factor moved at a time (unheld; at 0.72 ha, and 5 ha extrapolated)")
print(f"{'change':<28}{'0.72 ha':>9}{'5 ha':>8}")
cases = [("reference", {}), ("hours/yr 100", dict(hours=100.0)), ("hours/yr 2000", dict(hours=2000.0)), ("labour 0 USD/h", dict(labour=0.0)),
         ("labour 40 USD/h", dict(labour=40.0)), ("scout set-up 2 min", dict(setup_s=2.0)), ("battery 45 min", dict(endurance=45.0)),
         ("battery 10 min", dict(endurance=10.0)), ("swap 0 min", dict(swap=0.0)), ("annual charge 15%", dict(annual=0.15)),
         ("treater 2500 USD", dict(cap_treater=2500.0)), ("treater 4500 USD", dict(cap_treater=4500.0))]
for lab, kw in cases:
    r = [model(a, **kw) for a in (0.72, 5.0)]
    print(f"{lab:<28}{r[0][1] / r[0][0]:>9.2f}{r[1][1] / r[1][0]:>8.2f}")
