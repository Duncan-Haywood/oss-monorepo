"""Re-run the designs SPMe scored 0 and record *why* (the committed dfn.json predates the failure labels)."""
import importlib.util, json, sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location("dfn_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec); spec.loader.exec_module(run)
sel = json.loads((HERE / "dfn.json").read_text())
out = []
for i, s in enumerate(sel):
    if s["spme_now"]["score"] == 0 or s["dfn"]["score"] == 0:
        r = run.evaluate_with(s["x"], "SPMe")
        out.append({"i": i, "source": s["source"], "x": s["x"], "spme_rerun": r, "dfn_score": s["dfn"]["score"]})
        print(i, s["source"], r)
(HERE / "failures.json").write_text(json.dumps(out, indent=1))
