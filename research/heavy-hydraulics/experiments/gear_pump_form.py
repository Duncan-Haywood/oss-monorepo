"""Milestone 6t: is 6r's one curve an artefact of the logistic?

Reads the same 29 committed sweep points as 6r (gear_pump_evidence.py's parsers; no simulation). Fits four
two-parameter forms, each parametrised so its location is the 50% crossing E50:
  logistic  100 / (1 + exp(-(E - E50) / w))
  probit    100 Phi((E - E50) / s)
  cloglog   100 (1 - exp(-ln2 exp((E - E50) / b)))      slow start, steep top
  loglog    100 exp(-ln2 exp(-(E - E50) / b))           steep start, slow top
by grid least squares (E50 0.75 to 0.90, scale 0.002 to 0.10; coarse step 1e-3, then 1e-4 around the best).
For each: pooled RMS, leave-one-maker-out crossing errors and RMS, and the E at 10% and 90% of geometries.
Model-free: the pooled isotonic (pool-adjacent-violators) fit, crossing by linear interpolation.
Interval: all 3^3 = 27 draws of three makers with replacement (each maker's points kept whole), logistic refitted.

Stdlib only. Usage: python3 gear_pump_form.py > gear_pump_form_results.txt
"""
import itertools
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gear_pump_evidence import casappa, danfoss, marzocchi, own_crossing  # noqa: E402

LN2 = math.log(2.0)


def logistic(z):
    return 100.0 / (1.0 + math.exp(-z))


def probit(z):
    return 50.0 * (1.0 + math.erf(z / math.sqrt(2.0)))


def cloglog(z):
    return 100.0 * (1.0 - math.exp(-LN2 * math.exp(min(z, 50.0))))


def loglog(z):
    return 100.0 * math.exp(-LN2 * math.exp(min(-z, 50.0)))


FORMS = {"logistic": logistic, "probit": probit, "cloglog": cloglog, "loglog": loglog}


def inverse(f, share, lo=-60.0, hi=60.0):
    """z at which f(z) = share (f increasing), by bisection."""
    for _ in range(200):
        mid = 0.5 * (lo + hi)
        if f(mid) < share:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def sse(f, pts, e50, s):
    return sum((y - f((e - e50) / s)) ** 2 for e, y in pts)


def fit(f, pts):
    best = None
    for i in range(0, 151):
        e50 = round(0.75 + i * 1e-3, 4)
        for j in range(0, 99):
            s = round(0.002 + j * 1e-3, 4)
            v = sse(f, pts, e50, s)
            if best is None or v < best[0]:
                best = (v, e50, s)
    _, ce, cs = best
    for i in range(-10, 11):
        e50 = round(ce + i * 1e-4, 4)
        if not 0.75 <= e50 <= 0.90:
            continue
        for j in range(-10, 11):
            s = round(cs + j * 1e-4, 4)
            if not 0.002 <= s <= 0.10:
                continue
            v = sse(f, pts, e50, s)
            if v < best[0]:
                best = (v, e50, s)
    return best[1], best[2]


def rms(f, pts, e50, s):
    return math.sqrt(sse(f, pts, e50, s) / len(pts))


def isotonic(pts):
    """Pool-adjacent-violators on points sorted by E (ties pooled first); returns [(E, fitted share)]."""
    pts = sorted(pts)
    blocks = []  # [sum_y, n, [e...]]
    for e, y in pts:
        blocks.append([y, 1, [e]])
        while len(blocks) > 1 and blocks[-2][0] / blocks[-2][1] > blocks[-1][0] / blocks[-1][1]:
            y2, n2, e2 = blocks.pop()
            blocks[-1][0] += y2
            blocks[-1][1] += n2
            blocks[-1][2] += e2
    out = []
    for sy, n, es in blocks:
        for e in es:
            out.append((e, sy / n))
    return out


def iso_crossing(fitted):
    for (e0, s0), (e1, s1) in zip(fitted, fitted[1:]):
        if s0 < 50 <= s1:
            return e0 if s1 == s0 else e0 + (50 - s0) * (e1 - e0) / (s1 - s0)
    return None


def main():
    makers = {"casappa": casappa(), "danfoss": danfoss(), "marzocchi": marzocchi()}
    allpts = [p for pts in makers.values() for p in pts]
    print("Milestone 6t: functional-form robustness of 6r's one curve (index 2, 29 committed sweep points)")
    print("(inputs: the same three results files as gear_pump_evidence.py; no simulation rerun)")
    print("forms parametrised so E50 is the 50% crossing; grid least squares, final step 1e-4")
    print()
    summary = {}
    for name, f in FORMS.items():
        e50, s = fit(f, allpts)
        r = rms(f, allpts, e50, s)
        e10 = e50 + s * inverse(f, 10.0)
        e90 = e50 + s * inverse(f, 90.0)
        per = ", ".join(f"{k} {rms(f, pts, e50, s):.2f}" for k, pts in makers.items())
        print(f"{name}: E50 {e50:.4f}, scale {s:.4f}; pooled RMS {r:.2f} points ({per}); "
              f"10% at E {e10:.4f}, 90% at E {e90:.4f}")
        lomo = []
        for k, pts in makers.items():
            rest = [p for kk, pp in makers.items() if kk != k for p in pp]
            le, ls = fit(f, rest)
            err = le - own_crossing(pts)
            lr = rms(f, pts, le, ls)
            lomo.append((k, err, lr))
            print(f"  without {k}: E50 {le:.4f}, scale {ls:.4f}; {k} crossing error {err:+.4f}, "
                  f"{k} RMS {lr:.2f} points")
        summary[name] = dict(e50=e50, rms=r, e10=e10, e90=e90,
                             worst_err=max(abs(x[1]) for x in lomo), worst_rms=max(x[2] for x in lomo))
    print()
    fitted = isotonic(allpts)
    ic = iso_crossing(fitted)
    iso_rms = math.sqrt(sum((y - fy) ** 2 for (e, y), (_, fy) in zip(sorted(allpts), fitted)) / len(allpts))
    print(f"model-free isotonic fit (pooled): 50% crossing E {ic:.4f}; RMS {iso_rms:.2f} points "
          f"({len(set(round(v, 6) for _, v in fitted))} monotone levels)")
    print()
    names = list(makers)
    boots = []
    for draw in itertools.product(names, repeat=3):
        pts = [p for k in draw for p in makers[k]]
        e50, w = fit(logistic, pts)
        boots.append((e50, draw))
    boots.sort()
    vals = [b[0] for b in boots]
    print("exact maker-level bootstrap, logistic (27 draws of three makers with replacement):")
    print(f"  E50 min {vals[0]:.4f} ({'+'.join(boots[0][1])}), median {vals[13]:.4f}, "
          f"max {vals[-1]:.4f} ({'+'.join(boots[-1][1])})")
    print(f"  2nd and 26th of 27 (a ~93% range): {vals[1]:.4f} to {vals[25]:.4f}")
    print()
    e50s = [v["e50"] for v in summary.values()]
    e10s = [v["e10"] for v in summary.values()]
    e90s = [v["e90"] for v in summary.values()]
    base = summary["logistic"]
    print(f"across forms: E50 {min(e50s):.4f} to {max(e50s):.4f}; 10% threshold {min(e10s):.4f} to {max(e10s):.4f} "
          f"(span {max(e10s) - min(e10s):.4f}); 90% threshold {min(e90s):.4f} to {max(e90s):.4f} "
          f"(span {max(e90s) - min(e90s):.4f})")
    print()
    print("Predictions (LOG.md 6t):")
    dev = max(abs(e - base["e50"]) for e in e50s)
    print(f"  FF1 every form's E50 within 0.005 of logistic: {'held' if dev <= 0.005 else 'refuted'} "
          f"(largest {dev:.4f})")
    gain = base["rms"] - min(summary["cloglog"]["rms"], summary["loglog"]["rms"])
    print(f"  FF2 an asymmetric form beats logistic RMS by >= 0.5: {'held' if gain >= 0.5 else 'refuted'} "
          f"(best gain {gain:+.2f})")
    werr = max(v["worst_err"] for v in summary.values())
    print(f"  FF3 every form, every left-out crossing within 0.015: {'held' if werr <= 0.015 else 'refuted'} "
          f"(worst {werr:.4f})")
    sp = max(max(e10s) - min(e10s), max(e90s) - min(e90s))
    print(f"  FF4 10% and 90% thresholds each span <= 0.010: {'held' if sp <= 0.010 else 'refuted'} "
          f"(larger span {sp:.4f})")
    inside = all(0.810 <= v <= 0.835 for v in vals)
    print(f"  FF5 all 27 bootstrap E50 in 0.810-0.835: {'held' if inside else 'refuted'} "
          f"({vals[0]:.4f} to {vals[-1]:.4f})")
    d = abs(ic - base["e50"])
    print(f"  FF6 isotonic crossing within 0.005 of logistic E50: {'held' if d <= 0.005 else 'refuted'} ({d:.4f})")


if __name__ == "__main__":
    main()
