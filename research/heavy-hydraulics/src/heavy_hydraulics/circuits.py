"""Pump-shaft energy of three excavator circuit types over a work cycle.

Units: pressure bar, flow L/min, time s. Hydraulic power (W) = p[bar] * Q[L/min] / 0.6.
Every circuit supplies the same actuator demands (pressure, flow); they differ in
what the pump must add on top.

  open_centre : fixed-displacement pump runs at full flow; all of it is at the
                highest actuator pressure plus the spool drop (bleed-off at load
                pressure; parallel circuit). Unused flow is throttled.
  load_sensing: variable pump delivers exactly the summed demand at the highest
                load pressure plus the margin dp_ls; lighter actuators are
                throttled down to their own pressure by their compensators.
  metered     : ideal independent metering with a supply per actuator, a small
                drop dp_m per actuator, no cross-actuator throttling. A lower
                bound for the electro-hydraulic family, not a design.
"""
from dataclasses import dataclass

W_PER_BAR_LPM = 1 / 0.6


@dataclass(frozen=True)
class Actuator:
    pressure: float  # bar, load pressure while moving
    flow: float      # L/min demanded


@dataclass(frozen=True)
class Phase:
    name: str
    seconds: float
    actuators: tuple


# Four-phase trench-and-load cycle. Pressures and flows are ILLUSTRATIVE, written
# from memory of mini-excavator catalogues (relief ~ 220 to 250 bar, pump ~ 30 to
# 45 L/min); not measured and not sourced. The experiment sweeps them.
REFERENCE_CYCLE = (
    Phase("dig", 4.0, (Actuator(150, 14), Actuator(120, 8))),
    Phase("lift+swing", 5.0, (Actuator(160, 16), Actuator(90, 10))),
    Phase("dump", 2.0, (Actuator(80, 12),)),
    Phase("return", 4.0, (Actuator(40, 12), Actuator(70, 14))),
)


def scale_cycle(cycle, demand=1.0, spread=1.0):
    """Scale flows by `demand` and pressures about the cycle mean by `spread`.

    spread = 0 makes every actuator equal in pressure (no throttling loss in a
    shared circuit); spread = 1 is the reference cycle."""
    ps = [a.pressure for ph in cycle for a in ph.actuators]
    mean = sum(ps) / len(ps)
    return tuple(
        Phase(ph.name, ph.seconds, tuple(
            Actuator(mean + spread * (a.pressure - mean), a.flow * demand)
            for a in ph.actuators))
        for ph in cycle)


def useful_energy(cycle):
    """Hydraulic work delivered to the actuators, J."""
    return sum(a.pressure * a.flow * W_PER_BAR_LPM * ph.seconds
               for ph in cycle for a in ph.actuators)


def cycle_energy(cycle, circuit, pump_flow=40.0, dp_spool=10.0, dp_ls=20.0,
                 dp_m=5.0, eta_pump=0.85):
    """Pump-shaft energy (J) and the hydraulic-side efficiency for one cycle.

    A phase whose demand exceeds `pump_flow` raises ValueError (the pump cannot
    deliver it). Heat is shaft energy minus useful work."""
    total = 0.0
    for ph in cycle:
        q_dem = sum(a.flow for a in ph.actuators)
        p_max = max(a.pressure for a in ph.actuators)
        if q_dem > pump_flow + 1e-9:
            raise ValueError(f"phase {ph.name}: demand {q_dem} > pump {pump_flow} L/min")
        if circuit == "open_centre":
            hyd = pump_flow * (p_max + dp_spool)
        elif circuit == "load_sensing":
            hyd = q_dem * (p_max + dp_ls)
        elif circuit == "metered":
            hyd = sum(a.flow * (a.pressure + dp_m) for a in ph.actuators)
        else:
            raise KeyError(circuit)
        total += hyd * W_PER_BAR_LPM * ph.seconds
    shaft = total / eta_pump
    u = useful_energy(cycle)
    return {"shaft_J": shaft, "useful_J": u, "efficiency": u / shaft,
            "heat_J": shaft - u}


CIRCUITS = ("open_centre", "load_sensing", "metered")
