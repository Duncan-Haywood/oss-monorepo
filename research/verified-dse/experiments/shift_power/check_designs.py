"""Milestone 120: checks the blind designs before any flow run (Yosys on PATH; seconds).

  muxshl_w is proved equivalent to barrel_w at W = 64 and 128 (a SAT miter over all inputs, Yosys `miter -equiv` + `sat -prove`);
  alignsh_w and lzcnorm_w at the blind widths are checked against a Python reference with Yosys `eval` on 40 random vectors each
  (seed 120), including x = 0, d = 0 and d = W - 1.
Prints one line per check and exits 1 on any mismatch.
"""
import random
import re
import subprocess
import sys
import tempfile
from pathlib import Path

D = Path(__file__).resolve().parents[2] / "designs"


def yosys(script):
    return subprocess.run(["yosys", "-q", "-p", script], capture_output=True, text=True)


def equiv(w, sw):
    s = (f"read_verilog -sv {D / 'barrel_w.v'} {D / 'muxshl_w.v'}; chparam -set W {w} -set SW {sw} barrel_w muxshl_w; "
         "proc; flatten; opt; miter -equiv -flatten -make_assert barrel_w muxshl_w m; hierarchy -top m; sat -verify -prove-asserts")
    r = yosys(s)
    return r.returncode == 0, r.stderr[-300:]


def evaluate(stem, params, inputs, outputs, widths):
    chp = " ".join(f"-set {k} {v}" for k, v in params.items())
    sets = " ".join(f"-set {k} {widths[k]}'b{v:0{widths[k]}b}" for k, v in inputs.items())  # binary: eval truncates decimals to 32 bits
    shows = " ".join(f"-show {o}" for o in outputs)
    r = subprocess.run(["yosys", "-p", f"read_verilog -sv {D / (stem + '.v')}; chparam {chp} {stem}; proc; flatten; opt; "
                        f"eval {sets} {shows}"], capture_output=True, text=True)
    got = {}
    for o in outputs:
        m = re.search(rf"\\{o}\s*\\?\s*=\s*(\d+)'([01xz]+)", r.stdout) or re.search(rf"{o} = (\d+)'([01xz]+)", r.stdout)
        got[o] = int(m.group(2), 2) if m and set(m.group(2)) <= {"0", "1"} else None
    return got


def lzc_ref(x, w):
    z = w if x == 0 else w - x.bit_length()
    return {"z": z, "y": (x << z) & ((1 << w) - 1) if z < w else 0}


def align_ref(x, d, w):
    return {"y": x >> d, "sticky": int(x & ((1 << d) - 1) != 0)}


def main():
    ok = True
    for w, sw in ((64, 6), (128, 7)):
        good, err = equiv(w, sw)
        print(f"muxshl{w} == barrel{w} (SAT miter): {good}" + ("" if good else f" {err}"))
        ok &= good
    rng = random.Random(120)
    for w, lw in ((96, 7), (128, 8)):
        xs = [0, 1, (1 << w) - 1, 1 << (w - 1)] + [rng.getrandbits(rng.randint(1, w)) for _ in range(36)]
        bad = 0
        for x in xs:
            got = evaluate("lzcnorm_w", {"W": w, "LW": lw}, {"x": x}, ["z", "y"], {"x": w})
            bad += got != lzc_ref(x, w)
        print(f"lzcnorm{w}: {len(xs) - bad}/{len(xs)} vectors match")
        ok &= bad == 0
    for w, dw in ((64, 6), (128, 7)):
        vs = [(0, 0), ((1 << w) - 1, w - 1), (1, 1), (rng.getrandbits(w), 0)] + [(rng.getrandbits(w), rng.randrange(w)) for _ in range(36)]
        bad = 0
        for x, d in vs:
            got = evaluate("alignsh_w", {"W": w, "DW": dw}, {"x": x, "d": d}, ["y", "sticky"], {"x": w, "d": dw})
            bad += got != align_ref(x, d, w)
        print(f"alignsh{w}: {len(vs) - bad}/{len(vs)} vectors match")
        ok &= bad == 0
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
