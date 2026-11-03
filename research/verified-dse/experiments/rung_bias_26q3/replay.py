"""Milestone 48: replay the milestone 1 analysis, search baselines (m2) and halving (m3) on the table re-measured
under OpenROAD 26Q3 / Yosys 0.70 (results.jsonl here), with the old code unchanged. Runs no flow.
Usage: python3 replay.py   -> analyse_results.txt, search_baselines_results.txt, halving_results.txt here."""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
# flow.py finds chip-pnr as a sibling of its project directory, so the scratch tree sits beside research/verified-dse.
with tempfile.TemporaryDirectory(prefix="_replay_", dir=ROOT.parent) as base:
    (Path(base) / "chip-pnr").symlink_to(ROOT.parent / "chip-pnr")
    t = Path(base) / "verified-dse"
    t.mkdir()
    shutil.copytree(ROOT / "src", t / "src")
    for d in ("rung_bias", "search_baselines", "halving"):
        (t / "experiments" / d).mkdir(parents=True)
        for f in (ROOT / "experiments" / d).glob("*.py"):
            shutil.copy(f, t / "experiments" / d / f.name)
    shutil.copy(HERE / "results.jsonl", t / "experiments/rung_bias/results.jsonl")
    for d, out in (("rung_bias", "analyse_results.txt"), ("search_baselines", "search_baselines_results.txt"), ("halving", "halving_results.txt")):
        script = "analyse.py" if d == "rung_bias" else "replay.py"
        subprocess.run([sys.executable, str(t / "experiments" / d / script)], check=True, cwd=t / "experiments" / d)
        shutil.copy(t / "experiments" / d / "results.txt", HERE / out)
