"""Experiments for osrobot-pairprice. `python3 experiments/run.py > experiments/results.txt` (about 15 min).

`--from-fits` skips the simulation and reprices from experiments/fits.json, which a full run writes; Sweeps 3 to 6
depend only on those fits, so a change to prices or to econ.py reruns in a second."""
import json, random, sys, os
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

FITS = os.path.join(os.path.dirname(__file__), "fits.json")
if "--from-fits" in sys.argv:
    with open(FITS) as fh:
        saved = json.load(fh)
    fits = {n: tuple(v) for n, v in saved["fits"].items()}
    print("\n# Sweeps 1 and 2 not re-simulated: fits read from experiments/fits.json (written by the last full run)")
    for line in saved["sweep12"]:
        print(line)
else:
    sim = {}
    for xy in SIZES:
        sim[xy] = dict(pair=run(xy, "pair", v_scout=V_SCOUT), inline=[dict(v=v, **run(xy, "inline", v=v)) for v in SPEEDS])
    lines = ["", "# Sweep 1: simulated minutes by field size (inline matched to the pair's kill share)",
             f"{'field m':<10}{'ha':>7}{'kill':>7}{'fly':>8}{'ground':>8}{'inline':>8}{'pair Wh':>9}{'inl Wh':>8}"]
    rows = {}
    for xy in SIZES:
        p = sim[xy]["pair"]; im, ie = matched(sim[xy]["inline"], p["kill"])
        rows[xy] = (p, im, ie)
        lines.append(f"{f'{xy[0]}x{xy[1]}':<10}{ha(xy):>7.3f}{p['kill']:>7.3f}{p['fly_min']:>8.1f}{p['ground_min']:>8.1f}{im:>8.1f}{p['energy_wh']:>9.0f}{ie:>8.0f}")
    A = [ha(xy) for xy in SIZES]
    fits = {n: E.fit_line(A, [f(rows[xy]) for xy in SIZES]) for n, f in
            (("fly_min", lambda r: r[0]["fly_min"]), ("ground_min", lambda r: r[0]["ground_min"]), ("inline_min", lambda r: r[1]),
             ("pair_wh", lambda r: r[0]["energy_wh"]), ("inline_wh", lambda r: r[2]))}
    lines += ["", "# Sweep 2: straight-line fit, minutes or Wh = c + m * hectares, over the five simulated sizes",
              f"{'quantity':<12}{'c':>9}{'m per ha':>11}{'R2':>8}"]
    for n, (c, m, r2) in fits.items():
        lines.append(f"{n:<12}{c:>9.2f}{m:>11.1f}{r2:>8.4f}")
    with open(FITS, "w") as fh:
        json.dump({"fits": fits, "sweep12": lines}, fh, indent=1)
        fh.write("\n")
    for line in lines:
        print(line)

SIM_MAX = 1.62   # largest simulated field, ha; anything beyond is read off the straight-line fits


def model(a, **kw):
    """(inline USD, pair USD unheld, pair USD held) for a field of a hectares, from the fits."""
    return E.cost_model(fits, a, **kw)


def where(a):
    return f"{a:.2f}" + ("*" if a > SIM_MAX else "")


def breakeven(idx, **kw):
    """Crossings of pair (idx 1 unheld, 2 held) minus inline over 0.01 to 200 ha: first, last, count, and the side
    above the last crossing."""
    g = lambda a: model(a, **kw)[idx] - model(a, **kw)[0]
    xs = E.crossings(g, 0.01, 200.0)
    if not xs:
        return ["none", "-", "0", "pair" if g(200.0) < 0 else "inline"]
    return [where(xs[0]), where(xs[-1]), str(len(xs)), "pair" if g(200.0) < 0 else "inline"]


print(f"\n# Pilot: the scout's flight minutes are charged as a person's time at {E.LABOUR:.0f} USD/h (14 CFR 107.31, visual line of sight).")
print("# 'no pilot' rows repeat the first version of this project, which left the pilot unpaid.")

print("\n# Sweep 3: USD per hectare at the reference prices (unheld = each machine charged for its own minutes; held = both for the whole job)")
print(f"{'ha':>8}{'inline':>9}{'pair':>9}{'held':>9}{'pair/inl':>10}{'held/inl':>10}{'no pilot':>10}{'np held':>9}   source")
for a in (0.045, 0.18, 0.405, 0.72, 1.62, 5.0, 20.0):
    i, p, h = model(a)
    _, p0, h0 = model(a, pilot=False)
    print(f"{a:>8.3f}{i / a:>9.2f}{p / a:>9.2f}{h / a:>9.2f}{p / i:>10.2f}{h / i:>10.2f}{p0 / i:>10.2f}{h0 / i:>9.2f}   {'simulated size' if a <= SIM_MAX else 'extrapolated from fit'}")

print("\n# Sweep 3b: every machine attended. A person is charged for every ground minute of both architectures as well as the")
print("# pilot's flight minutes: the like-for-like case if a site will not let a ground robot run unwatched. USD per hectare")
print(f"{'ha':>8}{'inline':>9}{'pair':>9}{'held':>9}{'pair/inl':>10}{'held/inl':>10}   source")
for a in (0.045, 0.18, 0.405, 0.72, 1.62, 5.0, 20.0):
    i, p, h = model(a, attend=True)
    print(f"{a:>8.3f}{i / a:>9.2f}{p / a:>9.2f}{h / a:>9.2f}{p / i:>10.2f}{h / i:>10.2f}   {'simulated size' if a <= SIM_MAX else 'extrapolated from fit'}")
r = breakeven(1, attend=True)
print(f"# attended, unheld: first crossing {r[0]} ha, last {r[1]}, {r[2]} crossing(s); cheaper above the last: {r[3]}")

print("\n# Sweep 4: field sizes (ha) where the pair's USD per field equals the inline robot's, by scout price; 0.01 to 200 ha scanned.")
print("# Battery swaps make the difference a sawtooth, so it can cross several times: first and last crossing, how many,")
print("# and which side is cheaper above the last one. * = beyond the 1.62 ha simulated range (extrapolated).")
print(f"{'scout USD':>10}{'pilot':>7}{'mode':>8}{'first':>9}{'last':>9}{'n':>4}{'cheaper above':>15}")
for cs in (1000, 1500, 2500, 4000, 6000):
    for pl in (True, False):
        for idx, mode in ((1, "unheld"), (2, "held")):
            r = breakeven(idx, cap_scout=cs, pilot=pl)
            print(f"{cs:>10}{'yes' if pl else 'no':>7}{mode:>8}{r[0]:>9}{r[1]:>9}{r[2]:>4}{r[3]:>15}")

print("\n# Sweep 5: pair USD per hectare over inline USD per hectare, one factor moved at a time (unheld, pilot charged; at 0.72 ha, and 5 ha extrapolated)")
print(f"{'change':<28}{'0.72 ha':>9}{'5 ha':>8}")
cases = [("reference", {}), ("pilot not charged", dict(pilot=False)), ("every machine attended", dict(attend=True)), ("hours/yr 100", dict(hours=100.0)), ("hours/yr 2000", dict(hours=2000.0)),
         ("labour 0 USD/h", dict(labour=0.0)), ("labour 40 USD/h", dict(labour=40.0)), ("scout set-up 2 min", dict(setup_s=2.0)),
         ("battery 45 min", dict(endurance=45.0)), ("battery 10 min", dict(endurance=10.0)), ("swap 0 min", dict(swap=0.0)),
         ("annual charge 15%", dict(annual=0.15)), ("treater 2500 USD", dict(cap_treater=2500.0)), ("treater 4500 USD", dict(cap_treater=4500.0)),
         ("scout 1000 USD", dict(cap_scout=1000.0))]
for lab, kw in cases:
    r = [model(a, **kw) for a in (0.72, 5.0)]
    print(f"{lab:<28}{r[0][1] / r[0][0]:>9.2f}{r[1][1] / r[1][0]:>8.2f}")

print("\n# Sweep 6: the highest pilot cost (USD per flight hour) at which the unheld pair is no dearer than the inline robot,")
print("# other labour at 20 USD/h. Below it the pair wins; a pilot whose time is also doing other paid work costs less than the wage.")
print(f"{'ha':>8}{'max pilot USD/h':>27}   source")
for a in (0.405, 0.72, 1.62, 5.0, 20.0):
    i, p0, _ = model(a, pilot=False)
    fly = max(0.0, fits["fly_min"][0] + fits["fly_min"][1] * a)
    rate = (i - p0) / (fly / 60.0)
    print(f"{a:>8.3f}{('none (dearer even unpaid)' if rate < 0 else f'{rate:.2f}'):>27}   {'simulated size' if a <= SIM_MAX else 'extrapolated from fit'}")
