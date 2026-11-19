"""A straddle-vote margin scaled to the straddle count (2026-11-19, firmware/esp32/README.md "A straddle margin scaled
to the count").

The 1.5 ms vote (host.TAKE_STRADDLE_MARGIN = 2) advises 1.5 ms when, of the kept wheels whose fit at 1.5 ms put the take
across a revolution's edge, at least 2 more fit 1.5 ms better than the step ("for") than worse ("against"). On instant
builds a straddling wheel votes "for" about 1 time in 5 (eval/take-straddle-margin-one-2026-11-19.md), so a fixed lead
means different things at different counts: 2-0 has a 4% chance on an instant build, 4-2 has 1.7%, and 4-3, which the
fixed margin refuses, 3.3%. A count-scaled rule asks the binomial question instead: how likely is at least `for` "for"
votes of n = for + against on an instant build, if each votes "for" with chance P0?

Rules scored on every build (advice as host.take_survey_advice gives it, the 2.5 ms vote at its shipped margin):

  margin k      the shipped form, for - against >= k (k = 2 shipped)
  binom a       advise 1.5 ms where for >= 2 and P(X >= for | n, P0) <= a
  either a      margin 2, or binom a (looser than shipped only where n is large)

Scored as tests/take_straddle_vote.py scores (a spread take named when the advised TAKE_US is within 1 ms of the true
take; an instant build is bad when told to set a take), with gained/lost counted against the shipped margin 2.

    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_scaled.py [--procs 4] [--cache F.pkl] FILES...
    PYTHONPATH=src:tests:firmware/esp32 python3 tests/take_straddle_scaled.py --heldout [--procs 4] FILES...

--splits prints the (for, against) counts by take group. Simulated only, as the captures are.
"""
import math
import sys

P0 = 0.2
ALPHAS = (0.01, 0.02, 0.035, 0.05, 0.1)
CANDIDATE = None   # set from the design reading and committed before the held-out sets are captured


def tail(f, n, p=P0):
    """P(X >= f) for X ~ Binomial(n, p)."""
    return sum(math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(f, n + 1))


def fires(rule, k, f, g):
    if rule == "margin":
        return bool(k) and f - g >= k
    if rule == "binom":
        return f >= 2 and tail(f, f + g) <= k
    if rule == "either":
        return f - g >= 2 or (f >= 2 and tail(f, f + g) <= k)
    raise ValueError(rule)


def verdict(sv, rule, k):
    """Advised TAKE_US in ms under one rule for the 1.5 ms vote (None: no verdict)."""
    import re
    from tennisbots import host
    keep = host.TAKE_STRADDLE_MARGIN
    host.TAKE_STRADDLE_MARGIN = 0   # the 1.5 ms vote off: the sums and the 2.5 ms vote only
    try:
        line = host.take_survey_advice(sv)
    finally:
        host.TAKE_STRADDLE_MARGIN = keep
    if not line or "run more balls" in line and "TAKE_US = " not in line:
        return None
    m = re.search(r"set TAKE_US = (\d+)", line)
    v = int(m.group(1)) / 1000 if m else 0.0
    if "TAKE_US = 0" in line and fires(rule, k, sv.get("straddle_for") or 0, sv.get("straddle_against") or 0):
        board = (sv.get("board_ms10") or 0) / 10
        return board if abs(board - 1.5) <= 0.5 else 1.5
    return v


def _ok(v, t):
    return v is not None and (abs(v - t) <= 1.0 if t else v == 0)


def score(rows, rule, k):
    c = dict(named=0, spread=0, bad=0, instant=0, gained=0, lost=0)
    for t, sv in rows:
        c["spread" if t else "instant"] += 1
        if not sv:
            continue
        v, v0 = verdict(sv, rule, k), verdict(sv, "margin", 2)
        c["gained"] += _ok(v, t) and not _ok(v0, t)
        c["lost"] += _ok(v0, t) and not _ok(v, t)
        if t and _ok(v, t):
            c["named"] += 1
        elif not t and v:
            c["bad"] += 1
    return c


def rules():
    for k in (0, 1, 2, 3):
        yield "margin", k
    for a in ALPHAS:
        yield "binom", a
    for a in ALPHAS:
        yield "either", a


def table(rows, label):
    print(f"{label}: {len(rows)} builds ({sum(1 for t, _ in rows if t == 0)} instant)")
    out = {}
    for r, k in rules():
        c = score(rows, r, k)
        out[(r, k)] = c
        print(f"  {r} {k:<6g} named {c['named']} of {c['spread']} spread takes, instant told to set a take {c['bad']} "
              f"of {c['instant']}; right that margin 2 was not {c['gained']}, wrong that margin 2 got right {c['lost']}")
    return out


def splits(rows):
    by = {}
    for t, sv in rows:
        if not sv:
            continue
        g = "instant" if t == 0 else ("0.1-0.9 ms" if t < 1.2 else ("1.3-2.1 ms" if t <= 2.15 else "2.4 ms and up"))
        key = (sv.get("straddle_for") or 0, sv.get("straddle_against") or 0)
        by.setdefault(g, {}).setdefault(key, 0)
        by[g][key] += 1
    for g in ("instant", "0.1-0.9 ms", "1.3-2.1 ms", "2.4 ms and up"):
        if g in by:
            d = by[g]
            fs = sum(f * c for (f, a), c in d.items())
            ns = sum((f + a) * c for (f, a), c in d.items())
            cells = ", ".join(f"{f}-{a}: {c}" for (f, a), c in sorted(d.items(), key=lambda x: (x[0][0] + x[0][1], x[0])))
            print(f"  {g}: {sum(d.values())} builds, {fs} of {ns} straddling wheels for; (for-against: builds) {cells}")


def heldout_verdict(out, cand):
    s, c = out[("margin", 2)], out[cand]
    ca, cb = c["named"] > s["named"], c["bad"] == 0
    cc = c["lost"] * 5 < c["gained"]
    print(f"  {cand[0]} {cand[1]:g}: (a) names more spread takes than margin 2's {s['named']}: "
          f"{'held' if ca else 'FAILED'} ({c['named']}); (b) tells no instant build to set a take: "
          f"{'held' if cb else 'FAILED'} ({c['bad']} of {c['instant']}); (c) fewer than one build lost per five gained: "
          f"{'held' if cc else 'FAILED'} ({c['lost']} lost, {c['gained']} gained)")
    return ca and cb and cc


def main():
    a = sys.argv
    procs = int(a[a.index("--procs") + 1]) if "--procs" in a else 1
    cache = a[a.index("--cache") + 1] if "--cache" in a else None
    skip = {a[a.index(o) + 1] for o in ("--procs", "--cache") if o in a}
    paths = [x for x in a[1:] if not x.startswith("--") and x not in skip]
    import take_bound_vote
    rows = take_bound_vote.load_rows(paths, procs, cache)
    out = table(rows, "held out" if "--heldout" in a else f"design ({len(paths)} files)")
    if "--splits" in a:
        splits(rows)
    if "--heldout" in a and CANDIDATE:
        ok = heldout_verdict(out, CANDIDATE)
        print("Decision: " + ("the scaled rule ships" if ok else "margin 2 stays; back to NEXT.md with these numbers"))


if __name__ == "__main__":
    main()
