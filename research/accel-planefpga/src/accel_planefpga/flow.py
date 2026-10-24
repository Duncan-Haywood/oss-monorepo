"""accel-plane's P-lane engines through Yosys synth_ice40 and nextpnr-ice40 (UP5K), with and without DSP mapping."""
import os
import re
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOP = os.path.join(HERE, "..", "..", "rtl", "plane_top.v")
PLANE = os.path.join(HERE, "..", "..", "..", "accel-plane", "rtl")
ENGINES = {"OS": 0, "RT": 1, "RTp": 2}
UP5K = {"LUTs": 5280, "EBR": 30, "DSP": 8, "args": ["--up5k", "--package", "sg48"]}


def tool(name):
    """A native binary if installed, else the YoWASP wheel of the same tool."""
    return [shutil.which(name)] if shutil.which(name) else [shutil.which("yowasp-" + name)]


def reduce_luts(bits):
    """LUT4s of an XOR reduction of `bits` signals (each LUT4 folds 3 more inputs): the wrapper's own cost."""
    return -(-(bits - 1) // 3)


def wrapper_luts(eng, p, accw=24):
    """Analytic LUT count of the output XOR-reduce in plane_top (OS reduces P*ACCW bits, RT reduces ACCW)."""
    return reduce_luts((p * accw if eng == "OS" else accw) + 1)


def parse_stat(stat):
    cell = lambda pat: sum(int(v) for v in re.findall(rf"^\s+{pat}\s+(\d+)\s*$", stat, re.M))
    return {"synth_lc": cell("SB_LUT4"), "synth_ff": cell(r"SB_DFF\w*"), "synth_carry": cell("SB_CARRY"),
            "synth_dsp": cell("SB_MAC16"), "synth_ebr": cell("SB_RAM40_4K")}


def run(eng, p, dsp, seeds=(1, 2, 3), freq_mhz=60, o=64, i=70, wb=4):
    """Synthesise and place one configuration. Returns resources and the median post-route Fmax."""
    with tempfile.TemporaryDirectory() as d:
        files = " ".join(f"read_verilog {f};" for f in (TOP, os.path.join(PLANE, "os_engine.v"),
                                                         os.path.join(PLANE, "rt_engine.v")))
        sets = "; ".join(f"chparam -set {k} {v} plane_top" for k, v in
                         (("ENG", ENGINES[eng]), ("O", o), ("I", i), ("P", p), ("WB", wb)))
        ys = f"{files} {sets}; synth_ice40 {'-dsp ' if dsp else ''}-top plane_top -json d.json; tee -o stat.txt stat"
        subprocess.run(tool("yosys") + ["-q", "-p", ys], cwd=d, check=True, capture_output=True, text=True)
        res = parse_stat(open(os.path.join(d, "stat.txt")).read())
        fm = []
        for s in seeds:
            pr = subprocess.run(tool("nextpnr-ice40") + UP5K["args"] + ["--json", "d.json", "--freq", str(freq_mhz),
                                "--seed", str(s), "--placer", "heap", "--timing-allow-fail"],
                                cwd=d, capture_output=True, text=True)
            log = pr.stdout + pr.stderr
            mf = re.findall(r"Max frequency for clock\s+'[^']*':\s+([\d.]+) MHz", log)
            if not mf:
                err = [l for l in log.splitlines() if "ERROR" in l][:1]
                return {**res, "fits": False, "why": err[0] if err else "nextpnr failed", "fmax": None}
            fm.append(float(mf[-1]))
            res["pnr_lc"] = int(re.findall(r"ICESTORM_LC:\s+(\d+)/", log)[-1])
            dspm = re.findall(r"ICESTORM_DSP:\s+(\d+)/", log)
            res["pnr_dsp"] = int(dspm[-1]) if dspm else 0
        fm.sort()
        res.update(fits=True, fmax=fm[len(fm) // 2], fmax_all=fm)
        return res


def cycles(eng, p, o=64, i=70):
    """Cycles per matrix-vector product: accel-plane's closed form (RTL-checked there), without fixed overhead."""
    ceil = lambda a, b: -(-a // b)
    return ceil(o, p) * i if eng == "OS" else o * ceil(i, p)
