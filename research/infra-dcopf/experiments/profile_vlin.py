"""Milestone 2 of research/grid-linopf: where the repair's time goes, with analytic sensitivities.
Profiles vlin.slp (J-m, analytic) on one case and reports the cumulative seconds in the AC power flows
(runpf), the sensitivity solve (jacobian_sens) and the QP (qps_pips), plus the QP's size.
Usage: profile_vlin.py <case> <kind>; writes nothing, prints the split."""
import copy
import cProfile
import pstats
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
from pypower.api import rundcopf
from pypower.idx_brch import ANGMAX, ANGMIN
from pypower.idx_gen import PG

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
sys.path.insert(0, str(HERE))
from infra_dcopf import vlin  # noqa: E402
from infra_dcopf.pglib import case_path, load_m  # noqa: E402
from infra_dcopf.vsched import file_schedule  # noqa: E402
from run_pglib import DCOPT  # noqa: E402

name, kind = sys.argv[1], sys.argv[2]
ppc = load_m(case_path(name, kind))
dc = rundcopf(ppc, DCOPT)
if not dc["success"]:
    free = copy.deepcopy(ppc)
    free["branch"][:, ANGMIN], free["branch"][:, ANGMAX] = -360.0, 360.0
    dc = rundcopf(free, DCOPT)
start, vf = dc["gen"][:, PG].copy(), file_schedule(ppc)
lay = vlin.Layout(ppc)
lin = vlin.linearise(ppc, start, lay.v_of(vf), lay, analytic=True)
A = vlin.rows(ppc, lin, vlin.MARGIN)[0]
prof = cProfile.Profile()
prof.enable()
hist = vlin.slp(ppc, start, vf, margin=vlin.MARGIN, analytic=True)
prof.disable()
st = pstats.Stats(prof)
tot = sum(v[3] for k, v in st.stats.items() if k[2] == "slp")
def cum(fn):
    return sum(v[3] for k, v in st.stats.items() if k[2] == fn)
print(f"{name} {kind}: {len(hist)} rounds, statuses {[h['status'] + '/' + h.get('qp', '') for h in hist]}")
print(f"QP size: {A.shape[1]} variables, {A.shape[0]} inequality rows (+{A.shape[0]} slacks when elastic)")
print(f"slp total {tot:.1f} s: runpf {cum('runpf'):.1f} s, jacobian_sens {cum('jacobian_sens'):.2f} s, "
      f"qps_pips {cum('qps_pips'):.1f} s, rows {cum('rows'):.1f} s")
