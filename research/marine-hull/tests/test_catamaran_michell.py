import subprocess, sys, pathlib

def test_catamaran_michell_reproducible():
    root = pathlib.Path(__file__).resolve().parents[1]
    out = subprocess.run([sys.executable, "experiments/run_catamaran_michell.py"], cwd=root,
                         env={"PYTHONPATH": "src", "PATH": ""}, capture_output=True, text=True, check=True).stdout
    assert out == (root / "experiments/results_catamaran_michell.txt").read_text()
