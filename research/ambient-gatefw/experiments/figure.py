"""Draw RAM and compare cost against the battery-hours error of each block size, from results.txt."""
import re
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

here = Path(__file__).parent
text = (here / "results.txt").read_text()
ram = {int(b): (int(r), int(c)) for b, r, c in re.findall(r"^\s*(\d+)  \d+-\d+\s+(\d+)\s+(\d+) \(mean", text, re.M)}
dh = {1: 0.0}
dh.update({int(b): float(h) for b, h in re.findall(r"^block\s+(\d+): max \|recall diff\| [\d.]+, max \|hours diff\| ([\d.]+) h", text, re.M)})
blocks = sorted(ram)

fig, ax = plt.subplots(figsize=(6.4, 3.6))
ax.plot(blocks, [ram[b][0] for b in blocks], "o-", label="struct bytes (RAM)")
ax.plot(blocks, [ram[b][1] for b in blocks], "s--", label="floor comparisons per frame")
ax.set_xscale("log"); ax.set_yscale("log")
ax.set_xlabel("AGATE_BLOCK (frames per block minimum)")
ax.set_ylabel("bytes / comparisons (log)")
ax.grid(alpha=.3)
ax2 = ax.twinx()
ax2.plot(blocks, [dh[b] for b in blocks], "^:", color="C3", label="worst-room battery error vs exact (h)")
ax2.set_ylabel("hours of error (model)")
h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, fontsize=8, loc="upper right")
ax.set_title("Block-minimum noise floor: cost falls 10x at block 10, battery estimate moves < 0.1 h", fontsize=9)
fig.tight_layout()
fig.savefig(here / "block_tradeoff.png", dpi=110)
