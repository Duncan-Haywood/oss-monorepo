"""Pattern-fit experiments: grid, local refinement, cross-body regret, solver sensitivity."""
import itertools, sys
import numpy as np
from garment_pattern_fit.model import Body, Pattern, body_perimeter, evaluate, cost

BODY_A = Body()  # waist-to-hip step: pear-ish
BODY_B = Body(a=(0.180, 0.182, 0.183, 0.182, 0.180), b=(0.128, 0.130, 0.131, 0.131, 0.130))  # straighter
RW = [0.94, 1.00, 1.06, 1.12, 1.18, 1.24]   # pattern waist / body waist perimeter
RH = [0.95, 1.05, 1.15, 1.25, 1.35, 1.45]   # pattern hem / body hip perimeter (z = -0.2)


def run(pattern_abs, body, **kw):
    m = evaluate(Pattern(*pattern_abs), body, **kw)
    return m, cost(m)


def grid(body, **kw):
    pw, ph = body_perimeter(body, 0.0), body_perimeter(body, -0.2)
    out = {}
    for rw, rh in itertools.product(RW, RH):
        out[(rw, rh)] = run((rw * pw, rh * ph), body, **kw)
    return pw, ph, out


def refine(body, start, **kw):
    """Coordinate search on (waist, hem) in absolute metres, 3 shrinking rounds."""
    best = np.array(start, float)
    bm, bc = run(best, body, **kw)
    step = np.array([0.03, 0.05])
    n = 0
    for _ in range(3):
        improved = True
        while improved:
            improved = False
            for k in (0, 1):
                for sgn in (-1, 1):
                    c = best.copy(); c[k] += sgn * step[k]
                    m, cc = run(c, body, **kw); n += 1
                    if cc < bc - 1e-9:
                        best, bm, bc, improved = c, m, cc, True
        step = step / 2
    return best, bm, bc, n


def fmt(m, c):
    return (f"strain_p95={100*m['strain_p95']:5.1f}%  waist_ease={100*m['waist_ease']:+5.1f}%  "
            f"hem_standoff={1000*m['hem_standoff']:5.1f}mm  cost={c:5.2f}")


def main():
    print("garment-pattern-fit experiments (stylised; see README)")
    sols = {}
    for name, body in (("A", BODY_A), ("B", BODY_B)):
        pw, ph, g = grid(body)
        print(f"\n== Body {name}: waist perimeter {pw:.3f} m, hip(-0.2 m) perimeter {ph:.3f} m, hip/waist {ph/pw:.3f}")
        print("cost grid (rows: waist ratio, cols: hem/hip ratio " + " ".join(f"{r:.2f}" for r in RH) + ")")
        for rw in RW:
            print(f"  waist x{rw:.2f}: " + " ".join(f"{g[(rw, rh)][1]:5.2f}" for rh in RH))
        (rw0, rh0) = min(g, key=lambda k: g[k][1])
        print(f"grid best: waist x{rw0:.2f}, hem x{rh0:.2f}: {fmt(*g[(rw0, rh0)])}")
        best, bm, bc, n = refine(body, (rw0 * pw, rh0 * ph))
        print(f"refined ({n} extra sims): waist {best[0]:.3f} m (x{best[0]/pw:.3f}), hem {best[1]:.3f} m (x{best[1]/ph:.3f}): {fmt(bm, bc)}")
        sols[name] = (best, bc, pw, ph)
    print("\n== Cross-body: pattern optimised for one body worn on the other")
    for src, dst, body in (("A", "B", BODY_B), ("B", "A", BODY_A)):
        m, c = run(tuple(sols[src][0]), body)
        print(f"pattern for {src} on body {dst}: {fmt(m, c)}  (own optimum {sols[dst][1]:.2f}, regret {c - sols[dst][1]:+.2f})")
    print("\n== Solver sensitivity on body A (optimum pattern from above, then re-grid at coarser settings)")
    best = sols["A"][0]
    for label, kw in (("default", {}), ("n_theta=48,n_z=20", dict(n_theta=48, n_z=20)),
                      ("iters=15", dict(iters=15)), ("steps=200", dict(steps=200)),
                      ("friction=0.2", dict(friction=0.2))):
        m, c = run(tuple(best), BODY_A, **kw)
        print(f"{label:20s}: {fmt(m, c)}")
    print("\n== Cost-weight sensitivity on body A: best grid cell under other weights")
    pw, ph, g = grid(BODY_A)
    for w_s, w_e in ((1, 1), (2, 1), (1, 2), (0.5, 1)):
        k = min(g, key=lambda k: cost(g[k][0], w_s, w_e))
        print(f"w_strain={w_s}, w_ease={w_e}: best waist x{k[0]:.2f}, hem x{k[1]:.2f}")


if __name__ == "__main__":
    main()
