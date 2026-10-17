"""Energy of a schedule's access counts. Every constant is ASSUMED, reusing accel-kws's (Horowitz 2014-style, not re-checked)."""
import json, os
from . import flows as F

HERE = os.path.dirname(os.path.abspath(__file__))
KWS = os.path.join(HERE, "..", "..", "..", "accel-kws", "experiments", "results.json")
OUT = 11
E_MULT_8X8_PJ, E_ADD_32_PJ, E_SRAM_PJ_PER_BIT, ACT_BITS, ACCW = 0.2, 0.1, 0.16, 8, 24
LANES = (1, 2, 4, 8, 16, 32)


def load_models():
    return json.load(open(KWS))["rows"]


def layers(m):
    return [(m["hidden"], m["inputs"]), (OUT, m["hidden"])]      # (O, I)


def energy_pj(c, wbits, psum_scale=1.0):
    mac = (E_MULT_8X8_PJ * wbits * ACT_BITS / 64 + E_ADD_32_PJ * ACCW / 32) * c["macs"]
    sram = E_SRAM_PJ_PER_BIT * (c["w_rd"] * wbits + c["x_rd"] * ACT_BITS + psum_scale * (c["p_rd"] + c["p_wr"]) * ACCW)
    return mac + sram


def totals(m, df, P, B, psum_scale=1.0, xbuf=False):
    """xbuf: an input buffer holds the whole activation vector (I x B words), so every activation is read from SRAM once."""
    cyc = e = macs = 0
    for O, I in layers(m):
        c, _ = F.simulate(df, O, I, B, P)
        if xbuf:
            c = dict(c, x_rd=min(c["x_rd"], I * B))
        cyc += c["cycles"]; macs += c["macs"]; e += energy_pj(c, m["wbits"], psum_scale)
    return dict(cycles=cyc, macs=macs, util=macs / (cyc * P), energy_nj=e / B / 1000)   # energy per inference
