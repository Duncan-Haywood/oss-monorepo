"""Milestone 47: add a detail-routed rung (R5) to the rung-bias points and compare it with R4 (global route + repair_timing).

Usage: python run.py --openroad <bin> --yosys-dir <dir> [--pdk <sky130hd platform dir>] [--out work] [--jobs 4]
       [--designs a,b] [--tag tight|relaxed] [--results results.jsonl]
The flow is experiments/rung_bias's, byte for byte, plus a tail appended to chip-pnr's pnr.tcl:
detailed_route, then OpenRCX parasitics from the platform's rcx_patterns.rules, then area and worst slack (STAGE droute).
Points (sequences, clock targets) are read from ../rung_bias/results.jsonl, so R1 to R4 are re-measured here too (the tool
versions differ from the cached table: that difference is itself reported).
"""
import argparse, json, os, re, shutil, sys, tempfile
from multiprocessing import Pool
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

TAIL = """
puts "STAGE gr4"
report_worst_slack -max -digits 4
puts "TIME pre_droute [clock milliseconds]"
detailed_route -output_drc $out/drc.rpt -verbose 0
source $plat/setRC.tcl
puts "STAGE droute_route"
puts "TIME droute_route [clock milliseconds]"
extract_parasitics -ext_model_file $plat/rcx_patterns.rules
write_spef $out/droute.spef
read_spef $out/droute.spef
puts "STAGE droute"
report_design_area
report_worst_slack -max -digits 4
report_tns
puts "STAGE end"
"""


def patched_pnr(tmp):
    d = Path(tmp) / "src/chip_pnr"
    d.mkdir(parents=True)
    (d / "pnr.tcl").write_text((flow.PNR / "src/chip_pnr/pnr.tcl").read_text() + TAIL)
    return Path(tmp)


def task(a):
    design, seq, tag, period, wd, lib, pdk, orb, pnr = a
    flow.PNR = pnr
    try:
        r = flow.run_point(design, seq, period, wd, lib, pdk, orb)
    except RuntimeError as e:
        return {"design": design, "seq": list(seq), "tag": tag, "period_ns": period, "status": "fail", "error": str(e)[-200:]}
    log = (Path(wd) / "openroad.log").read_text()
    r["gr4_wns4"] = float(re.search(r"worst slack max (-?[\d.]+)", re.split(r"^STAGE gr4\n", log, flags=re.M)[1]).group(1))
    blk = re.split(r"^STAGE droute\n", log, flags=re.M)[1]
    r["droute_area"] = float(re.search(r"Design area ([\d.]+) um\^2", blk).group(1))
    r["droute_wns"] = float(re.search(r"worst slack max (-?[\d.]+)", blk).group(1))
    t = {m.group(1): int(m.group(2)) / 1000 for m in re.finditer(r"^TIME (\w+) (\d+)$", log, flags=re.M)}
    r["t_droute"] = t["droute_route"] - t["pre_droute"]
    drc = Path(wd) / "drc.rpt"
    r["drc_violations"] = len(re.findall(r"violation type", drc.read_text())) if drc.exists() else None
    r["tag"], r["status"] = tag, "ok"
    return r


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--openroad", required=True)
    ap.add_argument("--yosys-dir", required=True)
    ap.add_argument("--pdk", default="/tmp/pdk/orfs/flow/platforms/sky130hd")
    ap.add_argument("--out", default="/tmp/vdse-droute")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--designs", default="")
    ap.add_argument("--tag", default="")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--results", default=str(HERE / "results.jsonl"))
    a = ap.parse_args()
    os.environ["PATH"] = a.yosys_dir + os.pathsep + os.environ["PATH"]
    out, pdk = Path(a.out), Path(a.pdk)
    out.mkdir(parents=True, exist_ok=True)
    lib = out / "lib.lib"
    flow.filtered_liberty(pdk / "lib/sky130_fd_sc_hd__tt_025C_1v80.lib", lib)
    pnr = patched_pnr(tempfile.mkdtemp(dir=out))
    old = [json.loads(l) for l in open(HERE.parent / "rung_bias/results.jsonl")]
    keep = [r for r in old if r["status"] == "ok" and (not a.designs or r["design"] in a.designs.split(",")) and (not a.tag or r["tag"] == a.tag)]
    if a.limit:
        keep = keep[: a.limit]
    tasks = [(r["design"], tuple(r["seq"]), r["tag"], r["period_ns"], out / r["design"] / f"{r['tag']}_{i}", lib, pdk, a.openroad, pnr)
             for i, r in enumerate(keep)]
    with Pool(a.jobs) as pool, open(a.results, "w") as fh:
        for i, r in enumerate(pool.imap_unordered(task, tasks, chunksize=1)):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            if i % 20 == 0:
                print(i, len(tasks), flush=True)


if __name__ == "__main__":
    main()
