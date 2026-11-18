"""Tune the cull's other wide-pan pairs on the tune half (2026-11-18, eval/cull-pan-all-pairs-2026-11-18.md).

Run from ventures/photo-editing after tools/cull_crop_grouping_eval.py has cut the frames:
    PYTHONPATH=src python3 tools/cull_pan_other_tune.py WORK tune            # grid on the tune half
    PYTHONPATH=src python3 tools/cull_pan_other_tune.py WORK held T G L      # one setting, held out

The wide-pan pass (eval/cull-pan-windows-2026-11-18.md) compares one pair of
88% windows per offset, the pair nearest the middle of both frames. A 10% pan
moves the content 11.1% of the frame, 0.9% short of the grid's 12% offset, and
that one pair often sits 6-11 bits apart while another pair at the same offset
(another row, for a horizontal pan) lines up within a few. This scores adding
every pair at the wide-pan offsets as a further match: within T bits, at least
G closer than the whole frames, whole frames at most L apart. It reads the
hash cache tools/cull_pan_windows_tune.py writes, so the shipped rule it starts
from is whatever ``burst_match`` now does: run it on the code before the pass
ships, or the "shipped" row already includes it.
"""
import itertools
import sys
from pathlib import Path

sys.path.insert(0, "tools")
from cull_crop_grouping_eval import pairs  # noqa: E402
from cull_pan_windows_tune import far_pairs, load  # noqa: E402
from shootflow.cull import burst_match  # noqa: E402
from shootflow.frame_analysis import zoom_index  # noqa: E402

ALL = far_pairs("all")


def main():
    work, want = Path(sys.argv[1]), sys.argv[2]
    data = load(work)
    for rec in data.values():
        rec["zi"] = zoom_index(rec["z"])
    ids = sorted({k.split("_")[0] for k in data})

    def half(ident):
        return "tune" if int(ident) % 2 == 0 else "held"

    def row(ra, rb):
        d = (ra["h"] ^ rb["h"]).bit_count()
        ok = burst_match(d, ra["h"], ra["c"], ra["zi"], rb["h"], rb["c"], rb["zi"])
        ca, cb = ra["c"], rb["c"]
        return d, ok, min((ca[x] ^ cb[y]).bit_count() for x, y in ALL)

    P = [(kind, b, *row(data[f"{i}_{a}"], data[f"{i}_{b}"])) for i in ids if half(i) == want for kind, a, b in pairs()]
    Q = [row(data[f"{x}_full"], data[f"{y}_full"]) for x, y in itertools.combinations([i for i in ids if half(i) == want], 2)]

    def score(T, G, L):
        def ok(d, s, a):
            return s or (d <= L and a <= min(T, d - G))
        pan = [p for p in P if p[0].startswith("pan") and p[1].endswith("0.1")]
        by_kind = [round(sum(ok(*p[2:]) for p in pan if p[0] == k) / sum(p[0] == k for p in pan), 2)
                   for k in ("pan-h", "pan-v", "pan-diag")]
        return round(sum(ok(*p[2:]) for p in P) / len(P), 4), sum(ok(*q) for q in Q), by_kind

    print(want, f"{len(P)} burst pairs, {len(Q)} distinct pairs")
    print("shipped (recall, false merges, 10% pans h/v/diag):", score(-1, 0, 0))
    if len(sys.argv) > 3:
        print("T G L", sys.argv[3:6], score(*map(int, sys.argv[3:6])))
        return
    for T in (2, 3, 4, 5):
        for G in (6, 8, 10, 12, 14, 16):
            for L in (36, 44):
                print(T, G, L, score(T, G, L))


if __name__ == "__main__":
    main()
