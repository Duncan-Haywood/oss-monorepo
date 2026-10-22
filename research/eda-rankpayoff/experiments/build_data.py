"""Join eda-sky130rung's mapped rows with eda-delayproxy's proxy columns into data.json (one row per design)."""
import json
from pathlib import Path

R = Path(__file__).resolve().parents[2]
m = json.load(open(R / "eda-latencyhalve/experiments/mapped.json"))
d = json.load(open(R / "eda-delayproxy/experiments/proxies.json"))
px = {(r["p"], r["wb"]): r for r in d["rows"]}
rows = []
for r in m["rows"]:
    q = px[(r["p"], r["wb"])]
    assert abs(q["delay_ps"] - r["delay_ps"]) < 0.01 and q["gen_depth"] == r["gen_depth"]
    rows.append({k: r[k] for k in ("p", "wb", "gen_cells", "gen_depth", "cycles", "area_um2", "delay_ps")}
                | {k: q[k] for k in ("unit", "type", "fanout", "le", "max_fanout", "gates")} | {"sweep": q["sweep"]})
json.dump({"sources": ["eda-latencyhalve/experiments/mapped.json", "eda-delayproxy/experiments/proxies.json"],
           "yosys": m["yosys"], "pdk_commit": m["pdk_commit"], "script": m["script"], "rows": rows},
          open(Path(__file__).with_name("data.json"), "w"))
print(len(rows), "designs")
