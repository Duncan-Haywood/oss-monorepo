"""Session 80: does a class feature change a held-out city's rows or only its source cities' rows?

For the i2c target and one held-out city and test year: the share of the held-out test rows whose class
is the same under `type` (harmonised permit type) and `cascade2` (permit type, then work class, then the
description rules), per cascade2 class; and per class, the source cities' training rows (issue years
<= Y-2) under each configuration with their q0.9 build time. If the held-out rows keep their class but
the source rows behind that class change, a transfer cost in that class comes from what the sources
teach the shared model, not from relabelling the target.

  python3.13 src/class_shift.py DIR --held austin --test-year 2021
Writes results/class_shift_<held>_i2c_<year>.json.
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def shift_table(test_type, test_c2, src_type, src_c2, src_y, test_y=None):
    """Pure part (tested): per cascade2 class c, test rows in c, the share of them also labelled c under
    `type`, and the source rows labelled c under each configuration with their q0.9 build time."""
    test_type, test_c2 = np.asarray(test_type).astype(str), np.asarray(test_c2).astype(str)
    src_type, src_c2, src_y = np.asarray(src_type).astype(str), np.asarray(src_c2).astype(str), np.asarray(src_y, float)
    out = {}
    for c in sorted(set(test_c2)):
        m = test_c2 == c
        st, sc = src_type == c, src_c2 == c
        out[c] = dict(n_test=int(m.sum()),
                      test_q90=None if test_y is None else float(np.quantile(np.asarray(test_y, float)[m], .9)), share_test_same_under_type=float((test_type[m] == c).mean()),
                      n_src_type=int(st.sum()), n_src_cascade2=int(sc.sum()),
                      src_q90_type=float(np.quantile(src_y[st], .9)) if st.any() else None,
                      src_q90_cascade2=float(np.quantile(src_y[sc], .9)) if sc.any() else None,
                      share_src_cascade2_from_same_type=float((src_type[sc] == c).mean()) if sc.any() else None)
    return out


def main(data_dir, held, year):
    import transfer
    cities = [c for c in transfer.CITIES if c != "chicago" and os.path.exists(os.path.join(data_dir, f"{c}.csv"))]
    F = {k: {c: transfer.frame(os.path.join(data_dir, f"{c}.csv"), "i2c", k)[0] for c in cities}
         for k in ("type", "cascade2")}
    for c in cities:
        if not np.array_equal(F["type"][c].permit_id.to_numpy(), F["cascade2"][c].permit_id.to_numpy()):
            raise SystemExit(f"{c}: row order differs between configurations")
    te = {k: F[k][held][F[k][held].year == year] for k in F}
    src = [c for c in cities if c != held]
    tr = {k: pd.concat([F[k][c][F[k][c].year <= year - 2] for c in src]) for k in F}
    res = dict(held_out=held, target="i2c", test_year=year, sources=src,
               note="per cascade2 class; src rows are the transfer model's training rows (years <= Y-2)",
               classes=shift_table(te["type"].cls, te["cascade2"].cls, tr["type"].cls, tr["cascade2"].cls,
                                   tr["cascade2"].y, te["cascade2"].y))
    res["by_source"] = {c: shift_table(te["type"].cls, te["cascade2"].cls,
                                       F["type"][c][F["type"][c].year <= year - 2].cls,
                                       F["cascade2"][c][F["cascade2"][c].year <= year - 2].cls,
                                       F["cascade2"][c][F["cascade2"][c].year <= year - 2].y) for c in src}
    return res


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--held", required=True)
    ap.add_argument("--test-year", type=int, required=True)
    a = ap.parse_args()
    r = main(a.data_dir, a.held, a.test_year)
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results",
                       f"class_shift_{a.held}_i2c_{a.test_year}.json")
    json.dump(r, open(out, "w"), indent=1)
    for c, v in r["classes"].items():
        print(c, {k: (round(x, 3) if isinstance(x, float) else x) for k, x in v.items()})
    for s, t in r["by_source"].items():
        print("--", s)
        for c, v in t.items():
            print("  ", c, v["n_src_type"], v["n_src_cascade2"], v["src_q90_type"], v["src_q90_cascade2"],
                  round(v["share_src_cascade2_from_same_type"] or 0, 3))
