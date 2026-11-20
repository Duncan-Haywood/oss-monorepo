"""Milestone 156: ss_100C_1v60 at nominal wire RC against the PDK's max-RC corner (flow run)."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
RC = EXP / "rc_corner"


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, RC / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


RULES = """Metal 1 RESOVER
WIDTH Table 1 entries:  0.17

Metal 1 RESOVER 0
DIST count 2 width 0.17
0 0 0 0.5
0 0.29 0 0.5
END DIST

Metal 1 OVER 0
DIST count 2 width 0.17
0.17 1e-05 2e-05 0.25
0.34 3e-05 4e-05 0.25
END DIST

Metal 1 UNDER 2
DIST count 1 width 0.17
0.17 1e-05 0 0.25
END DIST
"""


def test_parse_takes_resover_r_and_sums_every_capacitance_row():
    d = _load("derive_rc.py", "vdse_t156_drc")
    p = d.parse(RULES)
    assert p[1]["res"] == 0.5
    assert abs(p[1]["cap"] - (3e-05 + 7e-05 + 1e-05)) < 1e-12


def test_scaled_setrc_scales_layers_and_leaves_vias():
    d = _load("derive_rc.py", "vdse_t156_drc2")
    txt = "\n".join(f"set_layer_rc -layer {L} -capacitance 1.0E-04 -resistance 2.0E-03" for L in d.LAYERS)
    txt += "\nset_layer_rc -via mcon -resistance 9.249146E-3\n"
    rat = {L: (1.5, 1.1, 0) for L in d.LAYERS}
    out = d.scaled_setrc(txt, rat)
    assert "set_layer_rc -layer met1 -capacitance 1.100000E-04 -resistance 3.000000E-03" in out
    assert "set_layer_rc -via mcon -resistance 9.249146E-3" in out


def test_complete_needs_both_arms():
    r = _load("run.py", "vdse_t156_run")
    d0, d1 = r.ORDER[0], r.ORDER[1]
    rows = [{"design": d0, "corner": c} for c in (r.CORNER, "ss_100C_1v60") for _ in range(120)]
    rows += [{"design": d1, "corner": r.CORNER} for _ in range(120)]
    assert r.complete(rows) == [d0]
    assert len(r.ORDER) == 27 and r.ORDER[0] == "rng8l"


def test_control_shows_the_tool_change():
    m143 = {tuple(x["seq"]): x for x in map(json.loads, (EXP / "corner_ss_blind" / "results.jsonl").read_text().splitlines())
            if x["design"] == "rng8l"}
    rows = [json.loads(l) for l in (RC / "control.jsonl").read_text().splitlines()]
    ok = [(x, m143[tuple(x["seq"])]) for x in rows if x["status"] == "ok"]
    assert len(ok) == 11
    assert sum(a["synth_netlist_area"] != b["synth_netlist_area"] or a["synth_netlist_wns"] != b["synth_netlist_wns"] for a, b in ok) == 7
    assert all(a["final_wns"] != b["final_wns"] or a["final_area_notap"] != b["final_area_notap"] for a, b in ok)
