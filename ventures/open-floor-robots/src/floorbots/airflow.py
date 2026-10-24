"""Vacuum sizing: where the fan curve meets the system curve.

Fan: a straight-line pressure-flow curve between the shut-off pressure and
the free-air flow on the fan's datasheet,

    p_fan(Q) = p_max * (1 - Q / q_max).

System: what the air has to get through, in series,

    p_sys(Q) = K_inlet * 1/2 rho (Q / A_inlet)^2     inlet slot + duct + bin (lumped loss coefficient)
             + R_filter * Q                           filter, laminar (pressure proportional to flow)

The operating point is where they cross. From it come the air speed at the
inlet (what picks dirt up), the suction at the nozzle, the air power and,
through an assumed fan efficiency, the electrical power.

Every default is an assumption chosen to be plausible for a 70 mm brushless
robot-vacuum fan and a 160 mm nozzle. None is a measurement. Replace the fan
numbers with your fan's datasheet and the losses with a pressure-gauge
reading on your build (hardware/vacuum.md, "Measuring the system curve").
"""

from __future__ import annotations

from dataclasses import dataclass

RHO = 1.2   # kg/m^3, air at ~20 C


@dataclass(frozen=True)
class Fan:
    p_max: float = 2500.0        # Pa, shut-off pressure
    q_max: float = 0.012         # m^3/s free-air flow (12 L/s)
    efficiency: float = 0.30     # air power / electrical power at the operating point

    def pressure(self, q: float) -> float:
        return max(0.0, self.p_max * (1 - q / self.q_max))


@dataclass(frozen=True)
class System:
    inlet_w: float = 0.160       # m, nozzle slot length
    inlet_gap: float = 0.004     # m, effective slot height (nozzle lip to floor; cad nozzle_lip_gap)
    k_inlet: float = 2.5         # lumped loss coefficient for slot, duct and bin
    r_filter: float = 60000.0    # Pa per m^3/s, filter resistance

    @property
    def inlet_area(self) -> float:
        return self.inlet_w * self.inlet_gap

    def pressure(self, q: float) -> float:
        v = q / self.inlet_area
        return self.k_inlet * 0.5 * RHO * v * v + self.r_filter * q


@dataclass(frozen=True)
class OperatingPoint:
    flow_m3s: float
    pressure_pa: float
    inlet_speed_ms: float
    air_power_w: float
    electrical_w: float

    @property
    def flow_l_s(self) -> float:
        return self.flow_m3s * 1000


def operating_point(fan: Fan = Fan(), system: System = System()) -> OperatingPoint:
    lo, hi = 0.0, fan.q_max
    for _ in range(80):
        mid = (lo + hi) / 2
        if fan.pressure(mid) > system.pressure(mid):
            lo = mid
        else:
            hi = mid
    q = (lo + hi) / 2
    p = fan.pressure(q)
    air = p * q
    return OperatingPoint(q, p, q / system.inlet_area, air, air / fan.efficiency)


def sweep_gap(fan: Fan = Fan(), base: System = System(), gaps=(0.003, 0.004, 0.006, 0.008, 0.012)):
    """How the nozzle height trades inlet speed against flow (the ride-height question)."""
    out = []
    for g in gaps:
        s = System(base.inlet_w, g, base.k_inlet, base.r_filter)
        out.append((g, operating_point(fan, s)))
    return out


def bin_area_m2(bin_ml: float, dust_g_m2: float = 0.5, bulk_g_ml: float = 0.3, fill: float = 0.7) -> float:
    """Floor area until the bin is full: an assumed dust load (g per m^2 per clean) and loose bulk density."""
    if dust_g_m2 <= 0:
        raise ValueError("dust load must be positive")
    return bin_ml * fill * bulk_g_ml / dust_g_m2
