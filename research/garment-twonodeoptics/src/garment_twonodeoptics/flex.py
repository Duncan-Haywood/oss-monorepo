"""Switchable two-node model: each design choice is 'ours' (as in `base.two_node`, from
garment-thermal) or 'ref' (as in pythermalcomfort 4.6.1 `two_nodes_gagge`, read from its source).

Flags (all default 'ours'):
  area      body area: 0.202 m^0.425 h^0.725 (1.81 m2) | 1.8258 m2
  consts    met factor 58.15 / tissue heat capacity 3490 J/kg/K | 58.2 / 3492
  conv      outer-surface convection: max(2.38|dT|^0.25, 12.1 sqrt(v)) | max(3, 8.6 v^0.53, 5.66 (met-0.85)^0.39)
  rad       clothing surface: ISO-style 4th-power radiation, f_cl ISO | linearised h_r (0.95*0.73), f_cl = 1+0.15 clo
  alfa      skin mass fraction fixed at 0.10 | varies with skin blood flow
  dilate    vasodilation gain 200, no blood-flow floor | gain 120, floor 0.5 L/(h m2)
  sweatcap  wettedness capped at 1 | clothed critical wettedness 0.59 v^-0.08, sweat cap 500 g/(m2 h)
  order     controls evaluated before the heat balance | after the temperature update (one-step lag)
  steps     60 one-minute steps | 59
Only the quantities in `run` are compared; sweat mass is not tracked. Not a validation against people.
"""
import math
from scipy.optimize import brentq
from .base import p_sat_kpa, fcl, SIGMA_ISO

OURS = dict(area="ours", consts="ours", conv="ours", rad="ours", alfa="ours",
            dilate="ours", sweatcap="ours", order="ours", steps="ours")
REF = {k: "ref" for k in OURS}
SBC = 5.6697e-8


def run(met, clo, ta, rh, v=0.1, opts=None, mass=70.0, height=1.7, tr=None, solar=0.0,
        eps=0.95, tau=0.0, alpha=0.5, minutes=60, gate=None, trace=None, env=None, met_fn=None):
    """Optics (this project's extension, identical in intent for both `rad` choices): `tr` radiant
    temperature (default ta), `solar` absorbed-by-body-surface irradiance W/m2, `eps` outer-surface
    emissivity, `tau` infrared transmittance, `alpha` solar absorptance. Optional `gate(minute, tsk, tcr)`
    returns the transmittance to use for that minute (a switching textile); `trace` is a list that collects
    (minute, tau, tsk, tcr). Optional `env(minute)` returns the air temperature for that minute (a changing
    room; radiant temperature follows it when `tr` was not given, and humidity stays at `rh` percent). Optional `met_fn(minute)` returns the metabolic rate in met for that minute
    (a change of activity; `met` is then only the start value). Neutral values
    (tr=ta, solar=0, eps=0.95, tau=0) reproduce the garment-twonodealign model exactly."""
    o = dict(OURS, **(opts or {}))
    tr_follows = tr is None
    tr = ta if tr is None else tr
    absorbed = alpha * solar
    ref = lambda k: o[k] == "ref"
    area = 1.8258 if ref("area") else 0.202 * mass ** 0.425 * height ** 0.725
    mf, cp = (58.2, 3492.0) if ref("consts") else (58.15, 3490.0)
    m0 = met * mf
    pa = rh / 100.0 * p_sat_kpa(ta)
    icl = 0.155 * clo
    f = 1.0 + 0.15 * clo if ref("rad") else fcl(clo)
    va = max(v, 0.1)

    def hc(tcl):
        if ref("conv"):
            h = max(3.0, 8.600001 * va ** 0.53)
            return max(h, 5.66 * (met - 0.85) ** 0.39) if met > 0.85 else h
        return max(2.38 * abs(tcl - ta) ** 0.25, 12.1 * math.sqrt(v))

    def dry(tsk):
        """(dry loss W/m2, clothing surface temperature)."""
        if ref("rad"):                       # fixed-point loop of the reference, tolerance 0.01 C
            ke = (eps / 0.95) * (1.0 - tau)
            hr, h = 4.7 * ke, hc(ta)
            top = (hr * tr + h * ta + absorbed / f) / (hr + h)
            ra = 1.0 / (f * (hr + h))
            tcl = (ra * tsk + icl * top) / (ra + icl)
            for _ in range(150):
                h = hc(tcl)
                hr = 4.0 * 0.95 * SBC * ((tcl + tr) / 2.0 + 273.15) ** 3 * 0.73 * ke
                ra = 1.0 / (f * (hr + h))
                top = (hr * tr + h * ta + absorbed / f) / (hr + h)
                new = (ra * tsk + icl * top) / (ra + icl)
                done = abs(new - tcl) <= 0.01
                tcl = new
                if done:
                    break
            hs = 4.0 * 0.97 * SBC * ((tsk + tr) / 2.0 + 273.15) ** 3 * 0.73 * tau
            return (tsk - top) / (ra + icl) + f * hs * (tsk - tr), tcl
        k_out = SIGMA_ISO * eps / 0.95 * (1.0 - tau)
        g = lambda tcl: ((tsk - tcl) / icl
                         - f * (hc(tcl) * (tcl - ta) + k_out * ((tcl + 273.0) ** 4 - (tr + 273.0) ** 4)) + absorbed)
        tcl = brentq(g, min(tsk, ta, tr) - 40.0, max(tsk, ta, tr) + 80.0, xtol=1e-9)
        direct = SIGMA_ISO * 0.97 / 0.95 * tau * f * ((tsk + 273.0) ** 4 - (tr + 273.0) ** 4)
        return (tsk - tcl) / icl + direct, tcl

    wmax = 0.59 * va ** -0.08 if (ref("sweatcap") and clo > 0) else 1.0
    gdil, bfmin = (120.0, 0.5) if ref("dilate") else (200.0, 0.0)

    def controls(tsk, tcr, alfa):
        ws, cs = max(tsk - 33.7, 0.0), max(33.7 - tsk, 0.0)
        wc, cc = max(tcr - 36.8, 0.0), max(36.8 - tcr, 0.0)
        tb = alfa * tsk + (1 - alfa) * tcr
        wb = max(tb - (0.1 * 33.7 + 0.9 * 36.8), 0.0)      # neutral body temperature uses alfa = 0.1 in both codes
        bf = min((6.3 + gdil * wc) / (1.0 + 0.5 * cs), 90.0)
        bf = max(bf, bfmin)
        rsw = 170.0 * wb * math.exp(ws / 10.7)
        if ref("sweatcap"):
            rsw = min(rsw, 500.0)
        return bf, 0.68 * rsw, 19.4 * cs * cc

    def evap(tsk, tcl, ersw):
        re_t = icl / (16.5 * 0.45) + 1.0 / (16.5 * f * hc(tcl))
        emax = (p_sat_kpa(tsk) - pa) / re_t
        if emax <= 1e-6:
            return (0.0, wmax) if ref("sweatcap") else (emax, 1.0)
        wet = 0.06 + 0.94 * ersw / emax
        if ref("sweatcap") and wet > wmax:
            p = wmax / 0.94
            return p * emax + 0.06 * (1.0 - p) * emax, wmax
        wet = min(wet, 1.0) if not ref("sweatcap") else wet
        return wet * emax, wet

    res = 0.0023 * m0 * (44.0 - pa * 7.5) + 0.0014 * m0 * (34.0 - ta)
    tsk, tcr, alfa, bf = 33.7, 36.8, 0.10, 6.3
    esk, wet, shiv, ersw = 0.1 * met, 0.0, 0.0, 0.0
    n = minutes - 1 if ref("steps") else minutes
    lag = ref("order")
    for minute in range(n):
        if env is not None:
            ta = env(minute)
            tr = ta if tr_follows else tr
            pa = rh / 100.0 * p_sat_kpa(ta)
            res = 0.0023 * m0 * (44.0 - pa * 7.5) + 0.0014 * m0 * (34.0 - ta)
        if met_fn is not None:
            met = met_fn(minute)
            m0 = met * mf
            res = 0.0023 * m0 * (44.0 - pa * 7.5) + 0.0014 * m0 * (34.0 - ta)
        if gate is not None:
            tau = gate(minute, tsk, tcr)
            if trace is not None:
                trace.append((minute, tau, tsk, tcr))
        if not lag:
            bf, ersw, shiv = controls(tsk, tcr, alfa)
            if ref("alfa"):
                alfa = 0.0417737 + 0.7451833 / (bf + 0.585417)
        d, tcl = dry(tsk)
        d_last = d              # both codes report the dry loss of the last step, before its update
        if not lag:
            esk, wet = evap(tsk, tcl, ersw)
        k = 5.28 + 1.163 * bf
        q_cr = m0 + shiv - res - k * (tcr - tsk)
        q_sk = k * (tcr - tsk) - d - esk
        a_eff = alfa if ref("alfa") else 0.10
        tsk_n = tsk + q_sk * area * 60.0 / (0.97 * a_eff * mass * 3600.0 if ref("consts") else a_eff * mass * cp)
        tcr_n = tcr + q_cr * area * 60.0 / (0.97 * (1 - a_eff) * mass * 3600.0 if ref("consts") else (1 - a_eff) * mass * cp)
        tsk, tcr = tsk_n, tcr_n
        if lag:
            bf, ersw, shiv = controls(tsk, tcr, alfa)
            esk, wet = evap(tsk, dry(tsk)[1], ersw)
            if ref("alfa"):
                alfa = 0.0417737 + 0.7451833 / (bf + 0.585417)
    return dict(tsk=tsk, tcr=tcr, wet=wet, dry=d_last, evap=esk)
