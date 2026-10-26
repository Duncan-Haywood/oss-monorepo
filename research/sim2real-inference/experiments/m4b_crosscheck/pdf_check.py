"""Milestone 4b (follow-up): check the WidowX transcription (../m4_simpler/data.py) against Table V of the SIMPLER PDF
(arXiv:2405.05941), read with `pdftotext -layout`. Resolves the two eggplant values on which the authors' repository
(upstream_perf.py) and our transcription disagree.
python3 pdf_check.py <simpler.pdf> -> results/pdf_check.txt"""
import os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "m4_simpler"))
import data
from upstream_perf import REAL_PERF, SIMPLER_PERF

TASKS = ["spoon_on_towel", "carrot_on_plate", "stack_blocks", "eggplant_basket"]
UP = {"spoon_on_towel": "widowx_spoon_on_towel", "carrot_on_plate": "widowx_carrot_on_plate",
      "stack_blocks": "widowx_stack_cube", "eggplant_basket": "widowx_put_eggplant_in_basket"}
POL = {"RT-1-X": "rt-1-x", "Octo-Base": "octo-base", "Octo-Small": "octo-small"}

def table_v(txt):
    """Rows of Table V: (setup, policy) -> 8 numbers [grasp, success] x 4 tasks."""
    out, setup = {}, None
    start = txt.index("Put Spoon on Towel                Put Carrot on Plate")
    for line in txt[start:].splitlines()[:25]:
        m = re.search(r"(RT-1-X|Octo-Base|Octo-Small)((?:\s+\d\.\d{3}){8})\s*$", line)
        if m:  # the six rows come real (3 policies) then SIMPLER (3 policies); the layout puts the 'SIMPLER Eval' label mid-block
            setup = "real" if (("real", m.group(1)) not in out) else "sim"
            out[(setup, m.group(1))] = [float(x) for x in m.group(2).split()]
    return out

def main(pdf):
    txt = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    t = table_v(txt)
    assert len(t) == 6, sorted(t)
    lines, bad_ours, bad_up = [], 0, 0
    for i, task in enumerate(TASKS):
        n, real, sim = data.WIDOWX[task]
        for j, p in enumerate(data.WIDOWX_POLICIES):
            for kind, ours, up in (("real", real[j], REAL_PERF[UP[task]][POL[p]]), ("sim", sim[j], SIMPLER_PERF[UP[task]][POL[p]])):
                pdf_v = t[(kind, p)][2 * i + 1]
                bad_ours += abs(ours - pdf_v) > 0.0006
                if abs(up - pdf_v) > 0.0006:
                    bad_up += 1
                    lines.append("  repo differs from PDF: %-16s %-10s %-4s PDF %.3f repo %.3f ours %.3f" % (task, p, kind, pdf_v, up, ours))
    head = ["24 WidowX values (success columns of Table V) checked against the PDF text",
            "ours differ from the PDF: %d" % bad_ours, "authors' repository differs from the PDF: %d" % bad_up]
    out = "\n".join(head + lines) + "\n"
    open(os.path.join(HERE, "results", "pdf_check.txt"), "w").write(out)
    print(out)

if __name__ == "__main__":
    main(sys.argv[1])
