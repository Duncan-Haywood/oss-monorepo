"""The straddle votes in the TAKE_US = 0 bound (2026-11-19, firmware/esp32/README.md "The straddle vote in the take
bound").

When the Pi tells a build TAKE_US = 0 it names a bound (host.take_survey_bound): the first grid contact time whose rms is
more than 2% and at least host.TAKE_BOUND_FLOOR_PPM (2 ppm) over the step's. The 2 ppm floor is needed (sets Y and Z:
floor 0 missed 3 of 54 near-2 ms takes) but it loosens the bound on small-rms instant builds from 1.5 ms to 2.5 ms or
more, and no floor built from the step's noise told the two apart (eval/take-bound-floor-se-2026-11-19.md). The straddle
votes (eval/take-straddle-vote-2026-11-19.md, eval/take-straddle-long-2026-11-19.md) count, on the kept wheels whose fit
at 1.5 ms (or 2.5 ms) put the take across a revolution's edge, how many fit that candidate better than the step ("for")
and worse ("against"). A wheel that straddles and fits 1.5 ms worse is direct evidence against a 1.5 ms take; the 8
real takes floor 0 missed on the design sets had no straddling wheel at all (NEXT.md, 2026-11-19).

Rules scored on the builds the shipped advice (both votes at their shipped margins) tells TAKE_US = 0:

  shipped     floor 2 ppm (host.take_survey_bound)
  floor 0     the 2% bar alone (the tight end; misses real takes)
  drop k      floor 0 where the 1.5 ms vote has straddling wheels and against - for >= k, else floor 2
              ("no straddle, no 1.5 ms bound"); k = 'any' needs only one straddling wheel
  cap k       the shipped bound, but at most 1.5 ms where against - for >= k (and at least one wheel straddles), whatever
              the rms say
  long k      as drop k, but for the 2.5 ms vote: floor 0 is used where the 2.5 ms vote has straddling wheels and
              against - for >= k, so a floor-0 bound of 2.5 ms replaces a loosened 3 ms or more

Scored as tests/take_bound_floor_tenths.py scores: covered when the true take is at most the bound (None, "bounds
nothing", covers), and tight when an instant build is bounded at 1.5 ms. Frames are tests/take_straddle_vote.py's
(the board's tenths frame with both counts, refitted from stored wheel inputs where the board did not count them).

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_vote.py [--procs 4] [--cache F.pkl] FILES...
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_bound_vote.py --heldout [--procs 4] FILES...

Simulated only, as the captures are.
"""
import os
import pickle
import sys

TOL = 0.02
KS = ("any", 0, 1, 2, 3)
CANDIDATE = ("drop", 0)   # chosen on the design reading, committed before the held-out sets were captured


def _bound(sv, floor):
    import take_shelf_bound as tsb2
    from tennisbots import host
    grid = host.TAKE_SURVEY_GRIDS_MS.get(len(sv["rms_ppm"]))
    return tsb2.bound_ms(sv["rms_ppm"], list(grid), tol=TOL, floor=floor)


def _lead(sv, long=False):
    f = sv.get("straddle_long_for" if long else "straddle_for") or 0
    g = sv.get("straddle_long_against" if long else "straddle_against") or 0
    return f + g, g - f


def _ok(k, n, lead):
    return n >= 1 and (k == "any" or lead >= k)


def bound(sv, rule, k=None):
    """The bound one rule names for one frame."""
    from tennisbots import host
    shipped = _bound(sv, host.TAKE_BOUND_FLOOR_PPM)
    if rule == "shipped":
        return shipped
    if rule == "floor0":
        return _bound(sv, 0)
    if rule == "drop":
        return _bound(sv, 0) if _ok(k, *_lead(sv)) else shipped
    if rule == "cap":
        if not _ok(k, *_lead(sv)):
            return shipped
        return 1.5 if shipped is None else min(shipped, 1.5)
    if rule == "long":
        return _bound(sv, 0) if _ok(k, *_lead(sv, True)) else shipped
    raise ValueError(rule)


def told_zero(sv):
    from tennisbots import host
    a = host.take_survey_advice(sv)
    return bool(a and "TAKE_US = 0" in a)


def score(rows, rule, k=None):
    told = cov = ni = i15 = 0
    misses, tighter, looser = [], 0, 0
    for t, sv in rows:
        if not sv or not told_zero(sv):
            continue
        told += 1
        x, s = bound(sv, rule, k), bound(sv, "shipped")
        if x is None or t <= x + 1e-9:
            cov += 1
        else:
            misses.append((t, x, _lead(sv), _lead(sv, True)))
        if t == 0:
            ni += 1
            i15 += x == 1.5
        xs, ss = (99 if x is None else x), (99 if s is None else s)
        tighter += xs < ss
        looser += xs > ss
    return dict(told=told, cov=cov, ni=ni, i15=i15, misses=misses, tighter=tighter, looser=looser)


def rules():
    yield "shipped", None
    yield "floor0", None
    for r in ("drop", "cap", "long"):
        for k in KS:
            yield r, k


def table(rows, label):
    print(f"{label}: {len(rows)} builds; told TAKE_US = 0 by the shipped advice: "
          f"{sum(1 for _, sv in rows if sv and told_zero(sv))}")
    out = {}
    for r, k in rules():
        c = score(rows, r, k)
        out[(r, k)] = c
        name = r if k is None else f"{r} {k}"
        miss = "; ".join(f"{t:g} ms bounded {x:g} (1.5 vote n {a[0]} lead {a[1]}, 2.5 vote n {b[0]} lead {b[1]})"
                         for t, x, a, b in c["misses"][:8])
        print(f"  {name:10s} covered {c['cov']} of {c['told']}, instant at 1.5 ms {c['i15']} of {c['ni']}, tighter than "
              f"shipped {c['tighter']}, looser {c['looser']}" + (f"; misses: {miss}" if c["misses"] else ""))
    return out


def load_rows(paths, procs, cache=None):
    if cache and os.path.exists(cache):
        with open(cache, "rb") as f:
            return pickle.load(f)
    import take_straddle_vote as tsv
    rows = tsv.rows_for(paths, procs)
    if cache:
        with open(cache, "wb") as f:
            pickle.dump(rows, f)
    return rows


def main():
    a = sys.argv
    procs = int(a[a.index("--procs") + 1]) if "--procs" in a else 1
    cache = a[a.index("--cache") + 1] if "--cache" in a else None
    skip = {a[a.index(o) + 1] for o in ("--procs", "--cache") if o in a}
    paths = [x for x in a[1:] if not x.startswith("--") and x not in skip]
    rows = load_rows(paths, procs, cache)
    out = table(rows, "held out" if "--heldout" in a else f"design ({len(paths)} files)")
    if "--heldout" in a and CANDIDATE:
        heldout_verdict(out, CANDIDATE, rows)


def host_matches(rows, cand):
    """host.take_survey_bound with TAKE_BOUND_STRADDLE on names the candidate's bound on every frame told TAKE_US = 0."""
    from tennisbots import host
    keep = host.TAKE_BOUND_STRADDLE
    host.TAKE_BOUND_STRADDLE = True
    try:
        return all(host.take_survey_bound(sv) == bound(sv, *cand) for _, sv in rows if sv and told_zero(sv))
    finally:
        host.TAKE_BOUND_STRADDLE = keep


def heldout_verdict(out, cand, rows):
    s, c = out[("shipped", None)], out[cand]
    ca = c["cov"] >= s["cov"]
    cb = c["i15"] > s["i15"]
    cc = c["looser"] == 0
    cd = host_matches(rows, cand)
    print(f"  {cand[0]} {cand[1]}: (a) covers every build the shipped bound covers ({s['cov']} of {s['told']}): "
          f"{'held' if ca else 'FAILED'} ({c['cov']}); (b) bounds more instant builds at 1.5 ms than shipped's "
          f"{s['i15']} of {s['ni']}: {'held' if cb else 'FAILED'} ({c['i15']}); (c) looser than shipped on no build: "
          f"{'held' if cc else 'FAILED'}; (d) host.take_survey_bound with TAKE_BOUND_STRADDLE names the same bound on "
          f"every frame: {'held' if cd else 'FAILED'}")
    print("Decision: " + ("host.TAKE_BOUND_STRADDLE ships True" if ca and cb and cc and cd
                          else "host.TAKE_BOUND_STRADDLE stays False; back to NEXT.md with these numbers"))


if __name__ == "__main__":
    main()
