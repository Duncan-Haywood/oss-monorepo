"""Mop water dosing: pump duty for a target wetness, and how far a tank goes.

The peristaltic pump delivers a fixed volume per revolution, so its flow is
close to proportional to duty. The pad wets a strip `pad_width` wide at the
robot's speed, so

    dose (ml/m^2) = flow (ml/min) * duty / (pad_width * speed * 60).

The firmware runs the pump only while the robot is moving forward faster
than `MIN_MOP_SPEED` (firmware/esp32/controller.py), so a robot that stops
or gets stuck does not leave a puddle. The target dose is a setting to tune
on your floor (too wet streaks and soaks wood; too dry smears), not a
figure from a test.
"""

from __future__ import annotations

from dataclasses import dataclass

MIN_MOP_SPEED = 0.05   # m/s; matches controller.MIN_MOP_MM_S


@dataclass(frozen=True)
class Pump:
    flow_ml_min: float = 20.0      # at 100% duty; check your pump's datasheet, then measure into a cup
    min_duty: float = 0.10         # below this a small DC peristaltic pump stalls


def dose_ml_m2(pump: Pump, duty: float, pad_width: float, speed: float) -> float:
    if speed <= 0 or pad_width <= 0:
        raise ValueError("speed and pad width must be positive")
    return pump.flow_ml_min * duty / (pad_width * speed * 60)


def duty_for(pump: Pump, target_ml_m2: float, pad_width: float, speed: float) -> float:
    """Pump duty (0..1) for a target dose; raises if the pump cannot reach it."""
    d = target_ml_m2 * pad_width * speed * 60 / pump.flow_ml_min
    if d > 1:
        raise ValueError(f"needs {d:.0%} duty: the pump is too small for {target_ml_m2} ml/m^2 at {speed} m/s")
    return max(d, pump.min_duty) if d > 0 else 0.0


def tank_area_m2(tank_ml: float, dose: float, priming_ml: float = 5.0) -> float:
    """Floor area one tank mops, after wetting the pad."""
    if dose <= 0:
        raise ValueError("dose must be positive")
    return max(0.0, tank_ml - priming_ml) / dose


@dataclass(frozen=True)
class DoseRow:
    duty: float
    dose_ml_m2: float
    tank_m2: float


def table(pump: Pump, pad_width: float, speed: float, tank_ml: float, duties=(0.1, 0.2, 0.3, 0.5, 0.75, 1.0)):
    return [DoseRow(d, dose_ml_m2(pump, d, pad_width, speed), tank_area_m2(tank_ml, dose_ml_m2(pump, d, pad_width, speed)))
            for d in duties]
