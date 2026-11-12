"""Heat-pump load diversity: a population of thermostat-controlled homes at one-minute resolution.

The base model (`model.py`) gives every home the same heat-pump draw in the same hour, UA (T_bal - T)+ / COP,
which is the fully coincident limit. Here each home is a two-node equivalent thermal parameter (ETP) model
(air node and mass node, after Sonderegger 1978 and the GridLAB-D residential module, Chassin et al. 2008):

    Ca dTa/dt = UA (To - Ta) + Hm (Tm - Ta) + Q_gain + Q_hp + Q_strip
    Cm dTm/dt = Hm (Ta - Tm)

with its own UA, thermal masses, setpoint and random initial state, and one of two heat pumps:

* single-stage: the compressor is on or off at full output Q_cap, switched by a thermostat with deadband `db`
  (the hysteresis model of Ihara and Schweppe 1981 and Mortensen and Haggerty 1988);
* variable-speed: output follows a feed-forward plus proportional law, clipped to [0, Q_cap].

Electric strip heat (`strip_kw`, COP 1) comes on as a second stage when the air is `stage2` K below the lower
edge of the band. Q_cap is sized to `size` times the home's design heat load at the climate's 99 % design
temperature (taken as the 1st percentile of the year's hourly temperatures). An optional night setback lowers
the setpoint by `setback_k` from 22:00 until a morning end hour that is either the same for all homes or drawn
uniformly per home in a window (staggered).

Every numeric default is a parameter to sweep: the house constants follow GridLAB-D's documented defaults as
recalled, not a measured building stock (see the README, "Diversity").
"""
from dataclasses import dataclass
import numpy as np

from .model import Params


@dataclass(frozen=True)
class Pop:
    ua_cv: float = 0.25        # coefficient of variation of UA across homes (lognormal)
    t_set: float = 20.0        # mean heating setpoint, C
    t_set_sd: float = 1.0      # sd of setpoints across homes, K
    db: float = 1.0            # thermostat deadband (total width), K
    ca_per_ua: float = 1.35    # air-node capacity / UA, h (0.57 kWh/K at UA 0.42)
    cm_per_ua: float = 30.0    # mass-node capacity / UA, h (12.6 kWh/K at UA 0.42)
    hm_per_ua: float = 9.0     # air-mass conductance / UA (3.8 kW/K at UA 0.42)
    size: float = 1.0          # heat-pump thermal capacity / design heat load
    strip_kw: float = 5.0      # electric strip heat per home, kW (0 = none)
    stage2: float = 1.0        # strip comes on this far below the lower band edge, K
    kp: float = 3.0            # variable-speed proportional gain, kW/K
    setback_k: float = 0.0     # night setback depth, K (0 = none)
    setback_start: float = 22.0
    setback_end: float = 6.0   # synchronized end hour
    stagger_h: float = 0.0     # if > 0: each home's end hour is uniform in [end - stagger/2, end + stagger/2]
    single_stage: bool = True


def minute_temps(hourly):
    """Linear interpolation of hourly temperatures (value at the top of each hour) to minutes, cyclic year."""
    h = np.asarray(hourly, float)
    nxt = np.roll(h, -1)
    f = np.arange(60) / 60.0
    return (h[:, None] * (1 - f) + nxt[:, None] * f).ravel()


def design_temp(hourly):
    return float(np.percentile(hourly, 1.0))


def simulate_population(hourly_temp, p: Params, pop: Pop, homes: int, seeds: int, seed0: int = 0,
                        dt_min: float = 1.0, warm_days: int = 3):
    """One-minute heat-pump electric draw (kW) for `seeds` independent groups of `homes` homes.

    Returns (group_kw [seeds, minutes], info dict). The year is run cyclically: the model first runs the last
    `warm_days` of the year so the initial states are thermostat-consistent, then the full year.
    """
    rng = np.random.default_rng(seed0)
    shape = (seeds, homes)
    sig = np.sqrt(np.log(1 + pop.ua_cv ** 2))
    ua = p.ua_kw_per_k * np.exp(rng.normal(-0.5 * sig * sig, sig, shape))
    tset = pop.t_set + pop.t_set_sd * rng.standard_normal(shape)
    # internal gains so that the nominal home has balance temperature p.t_bal at the mean setpoint
    gain = ua * (pop.t_set - p.t_bal)
    ca, cm, hm = pop.ca_per_ua * ua, pop.cm_per_ua * ua, pop.hm_per_ua * ua
    t_des = design_temp(hourly_temp)
    qcap = pop.size * np.maximum(ua * (tset - t_des) - gain, 0.5)
    if pop.stagger_h > 0:
        end = pop.setback_end + pop.stagger_h * (rng.random(shape) - 0.5)
    else:
        end = np.full(shape, pop.setback_end)
    ta = tset + pop.db * (rng.random(shape) - 0.5)
    tm = ta.copy()
    on = rng.random(shape) < 0.5

    tout = minute_temps(hourly_temp)
    n = len(tout)
    warm = warm_days * 1440
    idx = np.concatenate([np.arange(n - warm, n), np.arange(n)])
    out = np.zeros((seeds, n))
    dt = dt_min / 60.0
    cop_a, cop_b = p.cop_at_8 - p.cop_slope * 8.3, p.cop_slope
    strip_hours = np.zeros(shape)
    home_peak = np.zeros(shape)
    for step, i in enumerate(idx):
        to = tout[i]
        hod = (i / 60.0) % 24.0
        if pop.setback_k > 0:
            if pop.setback_start > 12:
                night = (hod >= pop.setback_start) | (hod < end)
            else:
                night = (hod >= pop.setback_start) & (hod < end)
            sp = np.where(night, tset - pop.setback_k, tset)
        else:
            sp = tset
        lo = sp - 0.5 * pop.db
        if pop.single_stage:
            on = np.where(ta < lo, True, np.where(ta > sp + 0.5 * pop.db, False, on))
            q = np.where(on, qcap, 0.0)
            need_strip = ta < lo - pop.stage2
        else:
            q = np.clip(ua * (sp - to) - gain + pop.kp * (sp - ta), 0.0, qcap)
            need_strip = (ta < sp - 0.5 * pop.db - pop.stage2)
        strip = np.where(need_strip, pop.strip_kw, 0.0)
        cop = np.clip(cop_a + cop_b * to, p.cop_floor, 6.0)
        elec = q / cop + strip
        dta = (ua * (to - ta) + hm * (tm - ta) + gain + q + strip) / ca
        dtm = hm * (ta - tm) / cm
        ta = ta + dt * dta
        tm = tm + dt * dtm
        if step >= warm:
            out[:, i] = elec.sum(axis=1)
            strip_hours += need_strip * dt
            home_peak = np.maximum(home_peak, elec)
    info = dict(t_design=t_des, qcap_mean=float(qcap.mean()), strip_h_per_home=float(strip_hours.mean()),
                home_peak=home_peak, qcap=qcap)
    return out, info


def hourly_mean(minute_series):
    a = np.asarray(minute_series, float)
    return a.reshape(a.shape[:-1] + (-1, 60)).mean(axis=-1)
