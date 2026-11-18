"""Milestone 11y driver: experiments F1 to F4 of fast_flux.py's docstring (predictions there). Needs numpy."""
import importlib.util
import multiprocessing as mp
import os
import statistics as S
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ff = _load("hub_airspace_fast_flux_11y_run", "fast_flux.py")
rl = _load("hub_airspace_random_layouts_11y", "random_layouts.py")
ft = ff.ft
st, gp = ft.st, ft.gp
LAM = rl.LAM
R = 50.0
N = 24


def add(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


def dense_timed(mix, speeds):
    """11x's flux_term.flux_terms, with its cross and same parts timed separately."""
    sc = (LAM / 3600.0) ** 2 * 3600.0
    ops = ft.operators(mix, speeds)
    keys = sorted(ops)
    out, tm = {}, {"cross": 0.0, "same": 0.0}
    for ai, A in enumerate(keys):
        c0 = time.process_time()
        t, e = ft.same_sum(ops[A], R)
        tm["same"] += time.process_time() - c0
        out[(A, A, "term")], out[(A, A, "enr")] = sc * t, sc * e
        for B in keys[ai + 1:]:
            c0 = time.process_time()
            t, e = ft.cross_sum(ops[A], ops[B], R)
            tm["cross"] += time.process_time() - c0
            k = gp.key(A, B)
            out[k + ("term",)], out[k + ("enr",)] = 2 * sc * t, 2 * sc * e
    return {k: x for k, x in out.items() if x}, tm


def run_layout(idx):
    pts = rl.load_nyc(10000.0)
    hubs, radii, speeds, shares = rl.draw_layout(pts, idx)
    mix = rl.mix_radii(pts, hubs, radii, shares)
    out = {"idx": idx, "n": len(mix)}
    stats, tf = {}, {}
    out["fast"] = ff.flux_terms(mix, speeds, LAM, R=R, stats=stats, timing=tf, sym_same=True)
    out["dense"], td = dense_timed(mix, speeds)
    out["stats"], out["tf"], out["td"] = stats, tf, td
    out["start"] = st.start_terms(mix, speeds, LAM, R=R)["start"]
    print("layout %d done: fast cross %.1f s, sym same %.1f s, dense cross %.1f s, dense same %.1f s" % (
        idx, tf["cross"], tf["same"], td["cross"], td["same"]), file=sys.stderr, flush=True)
    return out


def main():
    t0 = time.time()
    with mp.Pool(min(4, os.cpu_count() or 1)) as pool_:
        lays = pool_.map(run_layout, range(N))
    P = print
    P("# Milestone 11y: the 11x flux term with angle-pruned crossing tests (fast_flux.py)")
    P("# semi base rule, R = %.0f m, Lambda = %d/h, 11g's 24 layouts; CPU s are process time per layout" % (R, LAM))
    P()
    P("## F1 exactness, F2 cost, F3 pruning")
    P("# pre-registered kernel: pruned cross + 11x's same_sum (whose time is dense_same); post hoc: pruned cross +")
    P("# the symmetric same_sum (sym_same); max_rel_diff compares the post hoc kernel's every weight with 11x's")
    P("idx   legs   max_rel_diff   dense_cross  dense_same  fast_cross  sym_same  speedup  speedup_sym  tested  crossed  t/c")
    rels, sps, fts, tfr, ratio, sps2, fts2 = [], [], [], [], [], [], []
    for L in lays:
        D, F = L["dense"], L["fast"]
        rel = max(abs(F.get(k, 0.0) - D.get(k, 0.0)) / abs(D[k]) if D.get(k) else abs(F.get(k, 0.0))
                  for k in set(D) | set(F))
        td, tf, s = L["td"], L["tf"], L["stats"]
        dt, fs, fs2 = td["cross"] + td["same"], tf["cross"] + td["same"], tf["cross"] + tf["same"]
        tested, crossed = s["tested"] / s["pairs"], s["crossed"] / s["pairs"]
        rels.append(rel)
        sps.append(dt / fs)
        fts.append(fs)
        sps2.append(dt / fs2)
        fts2.append(fs2)
        tfr.append(tested)
        ratio.append(tested / crossed)
        P("%3d  %6d  %11.3e  %9.1f  %9.1f  %9.1f  %9.1f  %6.2f  %6.2f  %6.4f  %6.4f  %5.2f" % (
            L["idx"], L["n"], rel, td["cross"], td["same"], tf["cross"], tf["same"], dt / fs, dt / fs2, tested, crossed,
            tested / crossed))
    P("max relative difference %.3e; speed-up median %.2f (min %.2f, max %.2f); pruned CPU mean %.1f s, max %.1f s; "
      "dense CPU mean %.1f s" % (max(rels), S.median(sps), min(sps), max(sps), S.mean(fts), max(fts),
                                S.mean(L["td"]["cross"] + L["td"]["same"] for L in lays)))
    P("post hoc (pruned cross + symmetric same): speed-up median %.2f (min %.2f, max %.2f); CPU mean %.1f s, max %.1f s" % (
        S.median(sps2), min(sps2), max(sps2), S.mean(fts2), max(fts2)))
    P("cross-only speed-up (dense cross / pruned cross): median %.2f; same-only (11x / symmetric): median %.2f" % (
        S.median(L["td"]["cross"] / L["tf"]["cross"] for L in lays), S.median(L["td"]["same"] / L["tf"]["same"] for L in lays)))
    P("symmetric same-operator share of post hoc CPU: mean %.3f" % S.mean(L["tf"]["same"] / (L["tf"]["cross"] + L["tf"]["same"])
                                                     for L in lays))
    P("tested fraction median %.4f (max %.4f); tested/crossed median %.2f (max %.2f)" % (
        S.median(tfr), max(tfr), S.median(ratio), max(ratio)))
    P()
    P("## F4 best two-layer split under cf_D+ from each kernel")
    parts = gp.bipartitions()[1:]
    same = 0
    for L in lays:
        pd = gp.best(parts, add(L["dense"], L["start"]))
        pf = gp.best(parts, add(L["fast"], L["start"]))
        same += pd == pf
        P("%3d  %s  %s" % (L["idx"], pd == pf, pf))
    P("same split in %d of 24" % same)
    P()
    P("## Prediction checks")
    P("(1) max rel diff %.3e <= 1e-10: %s" % (max(rels), max(rels) <= 1e-10))
    P("(2) median speed-up %.2f >= 3: %s; >= 5: %s" % (S.median(sps), S.median(sps) >= 3, S.median(sps) >= 5))
    P("(3) pruned max CPU %.1f s <= 60: %s" % (max(fts), max(fts) <= 60))
    P("(4) median tested %.4f <= 0.20: %s; tested/crossed max %.2f <= 4: %s" % (
        S.median(tfr), S.median(tfr) <= 0.20, max(ratio), max(ratio) <= 4))
    P("(5) same split %d/24 == 24: %s" % (same, same == 24))
    P()
    P("# runtime %.0f s" % (time.time() - t0))


if __name__ == "__main__":
    main()
