"""Write results.txt: does a noisy or late anticipation by the user still replace the camera? Stdlib only."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_leannoise.model import *

SEEDS = range(200)
AMP = 0.03
out = []
hdr = f"{'design':<20} {'lean':>5} {'delay_s':>7} {'bias_mm':>7} {'fed':>5} {'safe':>5} {'touch':>6} {'peak_mean':>9}"
def row(label, d, lean, delay, bias):
    rs = [run_trial(d, AMP, s, lean, delay, bias) for s in SEEDS]; n = len(rs)
    out.append(f"{label:<20} {lean*1000:5.0f} {delay:7.2f} {bias*1000:7.0f} {sum(r['entered'] for r in rs)/n:5.2f} "
               f"{sum(1 for r in rs if r['entered'] and r['peak'] <= F_SAFE)/n:5.2f} "
               f"{sum(1 for r in rs if r['contact_s'] > 0)/n:6.2f} {sum(r['peak'] for r in rs)/n:9.2f}")
designs = [("open loop, 0.20 m/s", Design("none", 0.20)), ("camera, 0.20 m/s", Design("camera", 0.20))]
for lean in (0.05, 0.10):
    out += [f"# Lean {lean*1000:.0f} mm/s, {AMP*1000:.0f} mm sway ({len(SEEDS)} paired trials per row; safe = fed with peak lip force <= {F_SAFE} N). Rows 0.00 / 0 mm reproduce osrobot-lean.", hdr]
    for name, d in designs:
        for delay in (0.0, 0.2, 0.5, 1.0):
            for bias in (0.0, 0.01, 0.02, 0.04): row(name, d, lean, delay, bias)
        out.append("")
# no-lean reference
out += ["# Passive user reference", hdr]
for name, d in designs: row(name, d, 0.0, 0.0, 0.0)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
