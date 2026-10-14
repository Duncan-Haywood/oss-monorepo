"""Clothing heat balance, ISO 7730 PMV and a Gagge-style two-node model.

Fabric optics enter through four numbers (see `Fabric`): outer-surface infrared emissivity,
infrared transmittance (skin radiates through the cloth to the surroundings in parallel with
conduction through it), solar absorptance, and moisture permeability index. Units are SI
except metabolic rate (met) and insulation (clo), as in the standards.
"""
from dataclasses import dataclass, replace
import math
import numpy as np
from scipy.optimize import brentq

SIGMA_ISO = 3.96e-8      # ISO 7730 radiation constant: sigma * ~0.95 emissivity * ~0.73 area factor
EPS_ISO = 0.95           # emissivity baked into SIGMA_ISO
EPS_SKIN = 0.97
LR = 16.5                # Lewis ratio, K/kPa


@dataclass(frozen=True)
class Fabric:
    clo: float = 0.5          # thermal insulation of the garment ensemble, clo
    eps_out: float = 0.95     # outer-surface infrared emissivity
    tau_ir: float = 0.0       # fraction of skin->surroundings infrared that passes the cloth
    alpha_sol: float = 0.5    # solar absorptance of the outer surface
    im: float = 0.4           # moisture permeability index (Woodcock)


@dataclass(frozen=True)
class Env:
    ta: float = 25.0          # air temperature, C
    tr: float = 25.0          # mean radiant temperature of surroundings, C
    v: float = 0.1            # relative air speed, m/s
    rh: float = 50.0          # relative humidity, %
    solar: float = 0.0        # solar irradiance on the person, W/m2 of body surface (already averaged)


def p_sat_kpa(t):
    return math.exp(16.6536 - 4030.183 / (t + 235.0)) # kPa (ISO 7730 form)


def fcl(clo):
    icl = 0.155 * clo
    return 1.00 + 1.290 * icl if icl <= 0.078 else 1.05 + 0.645 * icl


def dry_loss(tsk, fab: Fabric, env: Env):
    """Dry heat flux from skin (W/m2) and clothing surface temperature (C).

    Skin loses heat by conduction through the cloth to its outer surface, and by radiation straight
    to the surroundings through the fraction `tau_ir` that the fabric passes. The outer surface
    exchanges heat by convection and (1 - tau_ir) of its radiation, and absorbs solar power.
    """
    icl = 0.155 * fab.clo
    f = fcl(fab.clo)
    k_out = SIGMA_ISO * fab.eps_out / EPS_ISO * (1.0 - fab.tau_ir)
    absorbed = fab.alpha_sol * env.solar

    def outer(tcl):
        hc = max(2.38 * abs(tcl - env.ta) ** 0.25, 12.1 * math.sqrt(env.v))
        rad = k_out * ((tcl + 273.0) ** 4 - (env.tr + 273.0) ** 4)
        return (tsk - tcl) / icl - f * (hc * (tcl - env.ta) + rad) + absorbed

    tcl = brentq(outer, min(tsk, env.ta, env.tr) - 40.0, max(tsk, env.ta, env.tr) + 80.0, xtol=1e-9)
    direct = (SIGMA_ISO * EPS_SKIN / EPS_ISO * fab.tau_ir * f
              * ((tsk + 273.0) ** 4 - (env.tr + 273.0) ** 4))
    return (tsk - tcl) / icl + direct, tcl


def pmv(met, fab: Fabric, env: Env, work=0.0):
    """ISO 7730 / Fanger PMV with the optical extension of `dry_loss` (met in met)."""
    m = met * 58.15
    w = work * 58.15
    mw = m - w
    pa = env.rh / 100.0 * p_sat_kpa(env.ta) * 1000.0         # Pa
    tsk = 35.7 - 0.028 * mw
    dry, _ = dry_loss(tsk, fab, env)
    hl1 = 3.05e-3 * (5733.0 - 6.99 * mw - pa)                # diffusion through skin
    hl2 = 0.42 * (mw - 58.15) if mw > 58.15 else 0.0         # regulatory sweat
    hl3 = 1.7e-5 * m * (5867.0 - pa)                         # latent respiration
    hl4 = 0.0014 * m * (34.0 - env.ta)                       # dry respiration
    load = mw - hl1 - hl2 - hl3 - hl4 - dry
    return (0.303 * math.exp(-0.036 * m) + 0.028) * load


def ppd(p):
    return 100.0 - 95.0 * math.exp(-0.03353 * p ** 4 - 0.2179 * p ** 2)


def comfort_equivalent_shift(met, base: Fabric, new: Fabric, env: Env):
    """Temperature offset d (C) applied to both ta and tr such that `base` at env+d has the PMV
    that `new` has at env. Positive: the new fabric is worth d degrees of extra warmth tolerated...
    sign convention: d > 0 means `new` feels as `base` would in an environment d degrees warmer."""
    target = pmv(met, new, env)
    f = lambda d: pmv(met, base, replace(env, ta=env.ta + d, tr=env.tr + d)) - target
    return brentq(f, -30.0, 30.0)


# ---------------------------------------------------------------- Gagge-style two-node model
def two_node(met, fab: Fabric, env: Env, minutes=120, height=1.7, mass=70.0, dt=60.0):
    """Two-node (core, skin) transient model after Gagge, Fobelets and Berglund (1986).

    Constants are those I recall from the published description; the model is checked only
    qualitatively and against the PMV module, not against the original paper's tables.
    Returns a dict of end-of-run values and the sweat loss in g.
    """
    area = 0.202 * mass ** 0.425 * height ** 0.725
    m = met * 58.15
    pa = env.rh / 100.0 * p_sat_kpa(env.ta)                   # kPa
    tsk, tcr = 33.7, 36.8
    cap_sk = 0.10 * mass * 3490.0 / area                      # J/(m2 K)
    cap_cr = 0.90 * mass * 3490.0 / area
    icl = 0.155 * fab.clo
    f = fcl(fab.clo)
    re_cl = icl / (LR * fab.im)                                # m2 kPa / W
    sweat_g = 0.0
    out = {}
    for _ in range(int(minutes * 60 / dt)):
        warm_s, cold_s = max(tsk - 33.7, 0.0), max(33.7 - tsk, 0.0)
        warm_c, cold_c = max(tcr - 36.8, 0.0), max(36.8 - tcr, 0.0)
        tb = 0.1 * tsk + 0.9 * tcr
        warm_b = max(tb - (0.1 * 33.7 + 0.9 * 36.8), 0.0)
        skbf = min((6.3 + 200.0 * warm_c) / (1.0 + 0.5 * cold_s), 90.0)       # L/(h m2)
        k = 5.28 + 1.163 * skbf                                                 # W/(m2 K)
        shiv = 19.4 * cold_s * cold_c
        rsw = 170.0 * warm_b * math.exp(warm_s / 10.7)                          # g/(m2 h)
        dry, tcl = dry_loss(tsk, fab, env)
        he = LR * max(2.38 * abs(tcl - env.ta) ** 0.25, 12.1 * math.sqrt(env.v))
        re_t = re_cl + 1.0 / (f * he)
        psk = p_sat_kpa(tsk)
        emax = (psk - pa) / re_t
        ersw = 0.68 * rsw
        wet = min(0.06 + 0.94 * ersw / emax, 1.0) if emax > 1e-6 else 1.0
        esk = wet * emax
        if emax > 0:
            sweat_g += (max(esk - 0.06 * emax, 0.0) / 0.68) * area * dt / 3600.0
        res = 0.0023 * m * (44.0 - pa * 7.5) + 0.0014 * m * (34.0 - env.ta)
        q_cr = m + shiv - res - k * (tcr - tsk)
        q_sk = k * (tcr - tsk) - dry - esk
        tcr += q_cr * dt / cap_cr
        tsk += q_sk * dt / cap_sk
    out.update(tsk=tsk, tcr=tcr, wet=wet, dry=dry, evap=esk, sweat_g=sweat_g, tcl=tcl)
    return out
