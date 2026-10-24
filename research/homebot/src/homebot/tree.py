"""A small kinematic-tree description that both the MJCF writer and the CAD assembly use.

Bodies carry their joint, collision primitives, point/box masses of bought parts
(servos, bearings, extrusion, battery), and placements of printed parts. Every body
frame is axis-aligned with its parent at the zero pose; joint axes say how it moves.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .servo import Drive


@dataclass
class Joint:
    name: str
    kind: str  # "hinge", "slide" or "free"
    axis: tuple[float, float, float] = (0.0, 0.0, 1.0)
    range: tuple[float, float] | None = None
    drive: Drive | None = None
    servo_id: int | None = None  # bus id on the real robot
    sign: int = 1  # real servo direction relative to the sim joint (set by mounting)
    # Coupled joints (the two jaws of the parallel gripper): ``follow`` names the driven joint
    # this one is geared to (q = q_driven); the drive's reflected inertia, back-EMF damping
    # and friction are split between the coupled joints by ``share``.
    follow: str | None = None
    share: float = 1.0


@dataclass
class Shape:
    """Collision/visual primitive in body coordinates (MuJoCo conventions)."""

    kind: str  # box, capsule, cylinder, sphere, ellipsoid
    size: tuple[float, ...]
    pos: tuple[float, float, float] = (0.0, 0.0, 0.0)
    quat: tuple[float, float, float, float] | None = None
    fromto: tuple[float, ...] | None = None
    rgba: tuple[float, float, float, float] = (0.85, 0.55, 0.20, 1.0)
    collide: bool = True
    name: str | None = None
    friction: tuple[float, float, float] | None = None
    group: int = 0
    condim: int | None = None


@dataclass
class Mass:
    """A lumped mass: point (inertia zero) or a uniform box of ``size`` (full edge lengths)."""

    name: str
    mass: float
    pos: tuple[float, float, float]
    size: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rot: np.ndarray | None = None  # 3x3 rotation of the box axes in the body frame

    def inertia(self) -> np.ndarray:
        a, b, c = self.size
        m = self.mass
        I = np.diag([m * (b * b + c * c), m * (a * a + c * c), m * (a * a + b * b)]) / 12.0
        if self.rot is not None:
            I = self.rot @ I @ self.rot.T
        return I


@dataclass
class Placement:
    """A printed part placed in a body: part frame -> body frame."""

    part: str
    pos: tuple[float, float, float] = (0.0, 0.0, 0.0)
    rot: np.ndarray = field(default_factory=lambda: np.eye(3))
    mirror: bool = False  # mirrored copy (left side parts)


@dataclass
class Body:
    name: str
    pos: tuple[float, float, float] = (0.0, 0.0, 0.0)
    joints: list[Joint] = field(default_factory=list)
    shapes: list[Shape] = field(default_factory=list)
    masses: list[Mass] = field(default_factory=list)
    parts: list[Placement] = field(default_factory=list)
    sites: list[tuple[str, tuple[float, float, float]]] = field(default_factory=list)
    cameras: list[dict] = field(default_factory=list)
    children: list["Body"] = field(default_factory=list)

    def add(self, child: "Body") -> "Body":
        self.children.append(child)
        return child

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()


def combine(masses: list[tuple[float, np.ndarray, np.ndarray]]):
    """Total mass, centre of mass and inertia about the centre of mass of
    ``(mass, com, inertia_about_own_com)`` triples (parallel-axis theorem)."""
    m = sum(mi for mi, _, _ in masses)
    if m <= 0:
        return 0.0, np.zeros(3), np.zeros((3, 3))
    c = sum(mi * np.asarray(ci) for mi, ci, _ in masses) / m
    I = np.zeros((3, 3))
    for mi, ci, Ii in masses:
        d = np.asarray(ci) - c
        I += Ii + mi * (np.dot(d, d) * np.eye(3) - np.outer(d, d))
    return m, c, I


def rot_from_axes(x, y, z) -> np.ndarray:
    """Rotation whose columns are the given unit axes (part frame axes in body coords)."""
    R = np.column_stack([x, y, z]).astype(float)
    return R


def mat2quat(R: np.ndarray) -> tuple[float, float, float, float]:
    """3x3 rotation -> (w, x, y, z) quaternion."""
    R = np.asarray(R, float)
    t = np.trace(R)
    if t > 0:
        s = np.sqrt(t + 1.0) * 2
        w = 0.25 * s
        x = (R[2, 1] - R[1, 2]) / s
        y = (R[0, 2] - R[2, 0]) / s
        z = (R[1, 0] - R[0, 1]) / s
    elif R[0, 0] > R[1, 1] and R[0, 0] > R[2, 2]:
        s = np.sqrt(1.0 + R[0, 0] - R[1, 1] - R[2, 2]) * 2
        w = (R[2, 1] - R[1, 2]) / s
        x = 0.25 * s
        y = (R[0, 1] + R[1, 0]) / s
        z = (R[0, 2] + R[2, 0]) / s
    elif R[1, 1] > R[2, 2]:
        s = np.sqrt(1.0 + R[1, 1] - R[0, 0] - R[2, 2]) * 2
        w = (R[0, 2] - R[2, 0]) / s
        x = (R[0, 1] + R[1, 0]) / s
        y = 0.25 * s
        z = (R[1, 2] + R[2, 1]) / s
    else:
        s = np.sqrt(1.0 + R[2, 2] - R[0, 0] - R[1, 1]) * 2
        w = (R[1, 0] - R[0, 1]) / s
        x = (R[0, 2] + R[2, 0]) / s
        y = (R[1, 2] + R[2, 1]) / s
        z = 0.25 * s
    q = np.array([w, x, y, z])
    q /= np.linalg.norm(q)
    if q[0] < 0:
        q = -q
    return tuple(float(v) for v in q)
