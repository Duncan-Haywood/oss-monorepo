"""Layer study. Part 1: factor at revgauge's one-layer root widths for 1..4 layers (the rows for
b = 1.5, 2.0 and 2.5 mm at 1 to 3 layers came from an earlier invocation of this same loop that was
stopped to shorten part 2; they are kept verbatim in layers.txt and skipped here).
Part 2: the width at the floor of 3 for 2 layers, by linear interpolation between the factor at
w - 0.3 and w + 0.3 mm around the one-layer root (the factor is near-linear in w over 0.6 mm).
Writes layers.txt (appends if it exists)."""
import os, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from simdesign_gaugelayers import layers as ly

OUT = os.path.join(HERE, "layers.txt")
lines = open(OUT).read().splitlines() if os.path.exists(OUT) else [
    "Reversed load, floor 3, coarse mesh (2, 18, 14, nz). factor = critical load / 100 N.",
    "## part 1: factor at the one-layer root width (so one layer gives ~3.0)", "b_mm w_mm nz factor seconds"]
done = {l.split()[0] + "/" + l.split()[2] for l in lines if l[:1].isdigit() and len(l.split()) == 5}
def log(s):
    lines.append(s); print(s, flush=True); open(OUT, "w").write("\n".join(lines) + "\n")

for b, w in ly.ONE_LAYER_ROOT.items():
    for nz in (1, 2, 3, 4):
        if f"{b}/{nz}" in done:
            continue
        t = time.time(); v = ly.factor(w, b, nz); log(f"{b} {w} {nz} {v:.3f} {time.time()-t:.0f}")

log("## part 2: width at the floor, 2 layers (interpolated between w-0.3 and w+0.3 mm)")
log("b_mm w_one_layer_mm w_two_layers_mm mass_g_two_layers shift_mm")
for b, w in ly.ONE_LAYER_ROOT.items():
    w0, w1 = w - 0.3, w + 0.3
    f0, f1 = ly.factor(w0, b, 2), ly.factor(w1, b, 2)
    r = w0 + (3.0 - f0) * (w1 - w0) / (f1 - f0)
    log(f"{b} {w} {r:.2f} {ly.mass_g(r, b):.1f} {r - w:+.2f}  (f(w-0.3)={f0:.3f}, f(w+0.3)={f1:.3f})")
