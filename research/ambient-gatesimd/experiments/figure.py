"""Draw instructions per frame for the three gate builds (-Os and -O2, block 10), from results.txt."""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
text = (here / "results.txt").read_text()
labels, vals = ["original", "SMLALD", "SMLALD,\nno divide"], {}
for opt in ("Os", "O2"):
    sec = re.search(rf"== -{opt}, block 10 ==\n(.*?)\n\n", text, re.S).group(1)
    vals[opt] = [int(re.search(r"\s(\d+)\s+(?:\d+ of \d+|-)\s*$", l).group(1)) for l in sec.split("\n")[1:]]
fig, ax = plt.subplots(figsize=(6.4, 3.6))
w = 0.38
for j, (opt, c) in enumerate((("Os", "#2f6f9f"), ("O2", "#d08a2e"))):
    bars = ax.bar([i + (j - 0.5) * w for i in range(3)], vals[opt], w, label=f"-{opt}", color=c)
    ax.bar_label(bars, fontsize=8)
ax.set_xticks(range(3), labels)
ax.set_ylabel("instructions per 20 ms frame")
ax.set_title("Adaptive gate on Cortex-M4, block 10 (divide not counted)", fontsize=10)
ax.legend()
fig.tight_layout()
fig.savefig(here / "instructions.png", dpi=140)
