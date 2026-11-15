"""After-the-run diagnostic for the V-first step (LOG.md 2026-11-14): where does the pinned reactive stage's
infeasibility come from? With every non-slack unit pinned to the (lossless) DC dispatch, the slack unit must
absorb the AC losses. This prints the slack unit's power-flow output along the fold step's continuation
(unchanged rules) against its [PMIN, PMAX], and the share of load the losses take at mu*.
Writes diag_slack_fold.txt. Usage: diag_slack_fold.py [case/kind ...]
"""
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from pypower.idx_bus import PD  # noqa: E402
from pypower.idx_gen import GEN_STATUS, PG, PMAX, PMIN  # noqa: E402

from infra_dcopf.aclin import slack_gen  # noqa: E402
from infra_dcopf.pglib import case_path, fix_ref, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_fold import path  # noqa: E402
from run_homotopy import CASES, dc_start  # noqa: E402


def one(name, kind):
    ppc, _ = fix_ref(load_m(case_path(name, kind)))
    pg, _ = dc_start(ppc)
    pts, _ = path(ppc, lambda m: m * pg, file_schedule(ppc))
    s = slack_gen(ppc)
    lo, hi = ppc["gen"][s, PMIN], ppc["gen"][s, PMAX]
    over = next((m for m, r in pts if r["gen"][s, PG] > hi), None)
    mu, r = pts[-1]
    live = r["gen"][:, GEN_STATUS] > 0
    loss = r["gen"][live, PG].sum() - mu * ppc["bus"][:, PD].sum()
    return (f"{name:14s} {kind:4s} mu* {mu:.4f}  slack P at mu* {r['gen'][s, PG]:8.1f} MW  limits [{lo:.1f}, {hi:.1f}]  "
            f"scheduled {mu * pg[s]:8.1f}  first mu over PMAX {('%.4f' % over) if over is not None else '-':>6s}  "
            f"losses {loss:7.1f} MW = {100 * loss / (mu * ppc['bus'][:, PD].sum()):.1f} % of load")


def main():
    jobs = [tuple(a.split("/")) for a in sys.argv[1:]] or CASES
    lines = [one(*j) for j in jobs]
    text = "Slack unit along the DC-dispatch continuation at the file schedule (fold step's rules):\n" + "\n".join(lines) + "\n"
    if not sys.argv[1:]:
        (HERE / "diag_slack_fold.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
