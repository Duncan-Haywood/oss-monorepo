"""Draw instructions per frame and the floor-scan share against block size, from results.txt."""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
text = (here / "results.txt").read_text()
fig, ax = plt.subplots(figsize=(6.4, 3.6))
for opt, mk in (("Os", "o-"), ("O2", "s--")):
    sec = text.split(f"== -{opt} ==")[1].split("==")[0]
    rows = re.findall(r"^\s*(\d+)\s+(\d+)\s+\S+\s+(\d+)\s+[\d.]+%", sec, re.M)
    ax.plot([int(r[0]) for r in rows], [int(r[2]) for r in rows], mk, label=f"-{opt}")
ax.set_xscale("log")
ax.set_ylim(0)
ax.set_xlabel("AGATE_BLOCK (frames per block minimum)")
ax.set_ylabel("Thumb-2 instructions per 20 ms frame")
ax.grid(alpha=.3)
ax.legend()
ax.set_title("Cortex-M4 build of the gate: the 320-sample energy sum is the floor under the saving", fontsize=9)
fig.tight_layout()
fig.savefig(here / "block_instructions.png", dpi=110)
