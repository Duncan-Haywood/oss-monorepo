"""Onset recall in the loudest room (-30 dBFS) against pre-roll RAM, one line per gate setting,
parsed from the committed results.txt."""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "_shared"))
from linefig import write_lines

here = Path(__file__).parent
series, cur = [], None
for line in (here / "results.txt").read_text().splitlines():
    m = re.match(r"== adaptive k=(\d+) hangover=(\d+): per pre-roll", line)
    if m:
        cur = (f"k={m.group(1)}, hangover {m.group(2)}", [], [])
        series.append(cur)
        continue
    if cur and re.match(r"\s+\d+\s+[\d.]+\s", line):
        cells = re.findall(r"([\d.]+)/([\d.]+)/([\d.]+)/([\d.]+)/\s*([\d.]+)h", line)
        cur[1].append(float(line.split()[1]))
        cur[2].append(float(cells[3][1]))      # onset recall, room -30
    elif line.startswith("== "):
        cur = None
write_lines(here, "onset_recall_vs_preroll.svg",
            "Pre-roll buffer size vs speech-onset recall (loudest room, -30 dBFS)",
            "Line chart: onset recall rises with pre-roll RAM for four gate settings",
            "pre-roll RAM (KB, 640 bytes per 20 ms frame)", "onset recall (first 500 ms of each utterance)",
            series)
