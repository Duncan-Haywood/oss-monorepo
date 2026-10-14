"""Stylised one-joint (ankle, sagittal) model of an assistive garment.

Everything is assumed, not measured. The gait cycle is a synthetic profile of ankle angle and net
joint torque with textbook-like shape (stance 0-0.6, push-off peak near 0.5). The muscle is a
lumped actuator: metabolic power = positive work / eta_pos + negative work / eta_neg
+ c_iso * (muscle torque / peak torque)^2 (an activation cost). The suit adds a torque in parallel
with the muscle. Its mass costs metabolic energy through a sensitivity parameter that is swept,
not claimed.
"""
from dataclasses import dataclass
import numpy as np

N = 1000


@dataclass(frozen=True)
class Body:
    mass: float = 70.0          # kg
    peak_torque: float = 1.6    # N m / kg, assumed net ankle push-off peak
    stride: float = 1.1         # s, assumed gait cycle time
    eta_pos: float = 0.25       # assumed muscle positive-work efficiency
    eta_neg: float = -1.2       # assumed negative-work efficiency (magnitude 1.2 means 1/1.2 J per J absorbed)
    c_iso: float = 4.0          # W/kg of activation cost at peak torque, assumed
    ankle_share: float = 0.25   # assumed ankle share of whole-body metabolic power


def phase():
    return np.linspace(0.0, 1.0, N, endpoint=False)


def profiles(b: Body = Body()):
    """Synthetic ankle angle (rad, + = plantarflexion), velocity (rad/s) and net torque (N m)."""
    p = phase()
    # dorsiflexion through mid-stance, then fast plantarflexion at push-off, small swing dorsiflexion
    theta = (-0.12 * np.exp(-((p - 0.30) / 0.14) ** 2) + 0.28 * np.exp(-((p - 0.58) / 0.045) ** 2)
             + 0.0 * p)
    omega = np.gradient(theta, p * b.stride)
    tau = b.peak_torque * b.mass * np.exp(-((p - 0.47) / 0.11) ** 2)
    return p, theta, omega, tau


def metabolic_power(tau_m, omega, b: Body = Body()):
    """Mean ankle metabolic power (W) for muscle torque trace tau_m and joint velocity omega."""
    P = tau_m * omega
    pos = np.clip(P, 0, None).mean() / b.eta_pos
    neg = np.clip(-P, 0, None).mean() / (-b.eta_neg)
    iso = b.c_iso * b.mass * np.mean((tau_m / (b.peak_torque * b.mass)) ** 2)
    return pos + neg + iso


def exo_torque(kind, gain, tau, theta, omega, timing=0.0, b: Body = Body(), stiffness=None):
    """Torque the suit adds (N m). Plantarflexion only; it cannot pull the foot up.

    'active'  : gain * biological torque, delayed by `timing` (fraction of the cycle).
    'elastic' : a spring that loads in dorsiflexion and releases; its stored energy is not tracked, only its torque.
    """
    if kind == "none":
        return np.zeros_like(tau)
    if kind == "active":
        shift = int(round(timing * N))
        return gain * np.roll(tau, shift)
    if kind == "elastic":
        k = stiffness if stiffness is not None else gain * b.peak_torque * b.mass / 0.12
        # spring torque = k * dorsiflexion angle, released as the joint plantarflexes; clipped at >= 0
        return k * np.clip(-theta, 0, None)
    raise ValueError(kind)


def evaluate(kind, gain, timing=0.0, mass_added=0.0, mass_sens=0.01, b: Body = Body(), stiffness=None):
    """Return dict of ankle and whole-body change (%) with an added-mass penalty.

    mass_sens: fractional rise of whole-body metabolic power per kg carried at the ankle/shank
    (assumed, swept). Whole-body baseline = ankle baseline / ankle_share.
    """
    p, theta, omega, tau = profiles(b)
    base = metabolic_power(tau, omega, b)
    te = exo_torque(kind, gain, tau, theta, omega, timing, b, stiffness)
    te = np.minimum(te, tau.max())            # actuator cap: not above the biological peak
    tau_m = tau - te                           # muscle supplies the rest (can go negative: suit over-assists)
    ankle = metabolic_power(tau_m, omega, b)
    whole_base = base / b.ankle_share
    delta_ankle = ankle - base
    penalty = mass_sens * mass_added * whole_base
    exo_w = float(np.mean(np.clip(te * omega, 0, None)))   # mean positive mechanical power from the suit
    return dict(base_w=base, ankle_w=ankle, dankle_pct=100 * delta_ankle / base,
                dwhole_pct=100 * (delta_ankle + penalty) / whole_base, suit_w=exo_w)


def break_even_mass(kind, gain, timing=0.0, mass_sens=0.01, b: Body = Body(), stiffness=None):
    """Added mass (kg) at which the whole-body gain is cancelled; None if the suit does not help."""
    r = evaluate(kind, gain, timing, 0.0, mass_sens, b, stiffness)
    saved = -(r["dwhole_pct"]) / 100 * (r["base_w"] / b.ankle_share)
    if saved <= 0:
        return None
    return saved / (mass_sens * r["base_w"] / b.ankle_share)
