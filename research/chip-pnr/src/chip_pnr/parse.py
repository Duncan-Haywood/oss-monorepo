"""Parse the OpenROAD log written by pnr.tcl into numbers."""
import re


def _stage_blocks(text):
    parts = re.split(r"^STAGE (\w+)\n", text, flags=re.M)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}


def parse_log(text, period_ns):
    st = _stage_blocks(text)
    out = {}
    for name in ("synth_netlist", "global_place", "detail_place", "final"):
        blk = st[name]
        out[f"{name}_area"] = float(re.search(r"Design area ([\d.]+) um\^2", blk).group(1))
        out[f"{name}_wns"] = float(re.search(r"worst slack max (-?[\d.]+)", blk).group(1))
    usage = st["usage"]
    rows = {}
    for m in re.finditer(r"^\s{2}([A-Za-z][\w \-]*?)\s+(\d+)\s+([\d.]+)\s*$", usage, flags=re.M):
        rows[m.group(1).strip()] = (int(m.group(2)), float(m.group(3)))
    tot = rows.pop("Total")
    tap = rows.pop("Tap cell", (0, 0.0))
    out["final_cells"] = tot[0] - tap[0]
    out["final_area_notap"] = round(tot[1] - tap[1], 3)
    out["tap_area"] = tap[1]
    out["buffers_added"] = sum(c for k, (c, a) in rows.items() if "buffer" in k.lower() or "Inverter" in k and "Clock" in k)
    out["cell_usage"] = {k: v for k, v in rows.items()}
    mp = re.search(r"^Total\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)", usage, flags=re.M)
    out["power_w"] = float(mp.group(4)) if mp else None
    for name in ("synth_netlist", "final"):
        out[f"{name}_period_ns"] = round(period_ns - out[f"{name}_wns"], 3)
    return out
