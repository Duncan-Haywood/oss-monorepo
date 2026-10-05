"""Write the MuJoCo model (MJCF) of a ``homebot.layout`` tree.

    from homebot.mjcf import load
    model = load(variant="mobile")            # planar base, primitives only
    model = load(variant="arm", meshes=True)  # printed-part meshes as visuals

Inertias: every body's inertial is the sum of its lumped bought parts (servos, bearings,
extrusion, battery...) and its printed parts. Printed-part mass properties come from the
CAD (``hardware/mass_properties.json``, written by ``experiments/build_cad.py``); if a part
is missing there, its mass is estimated from the body's collision primitives.
"""
from __future__ import annotations

import json
import math
import xml.etree.ElementTree as ET
from functools import lru_cache
from pathlib import Path

import numpy as np

from .layout import PLA, PLA_DARK, build_tree
from .params import DEFAULT, Robot
from .servo import mjcf_actuator, mjcf_joint_attrs
from .tree import Body, combine, mat2quat

PROJECT = Path(__file__).resolve().parents[2]
HARDWARE = PROJECT / "hardware"
MASS_FILE = HARDWARE / "mass_properties.json"
STL_DIR = HARDWARE / "stl"

FALLBACK_FILL = 0.35  # printed-volume fraction assumed when a part has no CAD mass yet


def _f(v) -> str:
    return " ".join(f"{float(x):.6g}" for x in np.atleast_1d(v))


def load_mass_properties(path: Path = MASS_FILE) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}


def _shape_volume(sh) -> float:
    k, s = sh.kind, sh.size
    if k == "box":
        return 8 * s[0] * s[1] * s[2]
    if k == "cylinder":
        return math.pi * s[0] ** 2 * 2 * s[1]
    if k == "sphere":
        return 4 / 3 * math.pi * s[0] ** 3
    if k == "ellipsoid":
        return 4 / 3 * math.pi * s[0] * s[1] * s[2]
    if k == "capsule":
        a = np.asarray(sh.fromto[:3])
        b = np.asarray(sh.fromto[3:])
        L = float(np.linalg.norm(b - a))
        return math.pi * s[0] ** 2 * L + 4 / 3 * math.pi * s[0] ** 3
    return 0.0


def _shape_centre(sh) -> np.ndarray:
    if sh.fromto is not None:
        return (np.asarray(sh.fromto[:3]) + np.asarray(sh.fromto[3:])) / 2
    return np.asarray(sh.pos, float)


def body_inertial(robot: Robot, body: Body, props: dict) -> tuple[float, np.ndarray, np.ndarray]:
    """Mass, centre of mass and inertia (about the COM, body axes) of a body."""
    items = []
    for m in body.masses:
        items.append((m.mass, np.asarray(m.pos, float), m.inertia()))
    have = set()
    for pl in body.parts:
        if pl.part not in props:
            continue
        have.add(pl.part)
        pp = props[pl.part]
        R = pl.rot.copy()
        com = np.asarray(pp["com"], float)
        I = np.asarray(pp["inertia"], float)
        if pl.mirror:
            M = np.diag([1.0, -1.0, 1.0])
            com = M @ com
            I = M @ I @ M
        items.append((pp["mass"], np.asarray(pl.pos) + R @ com, R @ I @ R.T))
    if body.parts and not have:
        # No CAD mass yet: estimate printed mass from the collision primitives that are not servos.
        for sh in body.shapes:
            if sh.name and ("servo" in sh.name or sh.kind == "ellipsoid"):
                continue
            if sh.rgba[:3] == (0.70, 0.72, 0.75) or not sh.collide:
                continue
            v = _shape_volume(sh)
            m = v * robot.printing.density * FALLBACK_FILL
            if m > 0:
                items.append((m, _shape_centre(sh), np.eye(3) * m * 1e-5))
    m, c, I = combine(items)
    if m <= 0:
        m, c, I = 1e-3, np.zeros(3), np.eye(3) * 1e-7
    return m, c, I


def _add_body(robot, parent_el, body: Body, props, meshes, mesh_names, actuators, equalities):
    el = ET.SubElement(parent_el, "body", name=body.name, pos=_f(body.pos))
    m, c, I = body_inertial(robot, body, props)
    I = (I + I.T) / 2
    w = np.linalg.eigvalsh(I)
    if w.min() <= 1e-9:  # point masses only: give it a tiny sphere of inertia
        I = I + np.eye(3) * max(1e-7, 1e-6 * m)
    ET.SubElement(el, "inertial", pos=_f(c), mass=f"{m:.6g}",
                  fullinertia=_f([I[0, 0], I[1, 1], I[2, 2], I[0, 1], I[0, 2], I[1, 2]]))
    for j in body.joints:
        if j.kind == "free":
            ET.SubElement(el, "freejoint", name=j.name)
            continue
        attrs = {"name": j.name, "type": j.kind, "axis": _f(j.axis)}
        if j.range is not None:
            attrs["range"] = _f(j.range)
        if j.drive is not None:
            attrs.update(mjcf_joint_attrs(j.drive, j.share))
            lo, hi = j.range if j.range is not None else (-1.0, 1.0)
            if j.drive.mode == "velocity":
                v = j.drive.max_speed
                lo, hi = -v, v
            if j.follow is None:
                actuators.append(mjcf_actuator(j.drive, j.name, j.name, (lo, hi)))
            else:  # geared to another joint (second gripper jaw): q = q_follow
                equalities.append((j.name, j.follow))
        else:
            attrs.update({"damping": "0.0", "armature": "0.0"} if j.kind != "hinge" or "roller" not in j.name
                         else {"damping": "1e-4", "armature": "1e-6"})
        ET.SubElement(el, "joint", **attrs)
    for sh in body.shapes:
        g = {"type": sh.kind, "size": _f(sh.size), "rgba": _f(sh.rgba)}
        if sh.name:
            g["name"] = sh.name
        if sh.fromto is not None:
            g["fromto"] = _f(sh.fromto)
        else:
            g["pos"] = _f(sh.pos)
            if sh.quat is not None:
                g["quat"] = _f(sh.quat)
        if not sh.collide:
            g.update(contype="0", conaffinity="0", group="2")
        elif meshes and tuple(sh.rgba) in (PLA, PLA_DARK):
            g["group"] = "3"  # printed-part primitive: collision only, the mesh is drawn instead
        else:
            g["group"] = "0" if not meshes else "1"
        if sh.friction is not None:
            g["friction"] = _f(sh.friction)
        if sh.condim is not None:
            g["condim"] = str(sh.condim)
        g["mass"] = "0"
        ET.SubElement(el, "geom", **g)
    if meshes:
        for pl in body.parts:
            key = pl.part + "_mirror" if pl.mirror and pl.part + "_mirror" in mesh_names else pl.part
            if key not in mesh_names:
                continue
            ET.SubElement(el, "geom", type="mesh", mesh=key, pos=_f(pl.pos), quat=_f(mat2quat(pl.rot)),
                          contype="0", conaffinity="0", group="1", mass="0", rgba="0.93 0.55 0.18 1")
    for name, pos in body.sites:
        ET.SubElement(el, "site", name=name, pos=_f(pos), size="0.006", rgba="0.1 0.8 0.2 0.6", group="4")
    for cam in body.cameras:
        ET.SubElement(el, "camera", **{k: (v if isinstance(v, str) else _f(v)) for k, v in cam.items()})
    for ch in body.children:
        _add_body(robot, el, ch, props, meshes, mesh_names, actuators, equalities)
    return el


def _overlapping_pairs(xml: str, max_depth: int = 3) -> list[tuple[str, str]]:
    """Body pairs whose collision geoms touch at the zero pose and are within ``max_depth``
    links of each other: they are designed to nest (gears, cradles), so contacts are excluded."""
    import mujoco

    m = mujoco.MjModel.from_xml_string(xml)
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    pairs = set()

    def depth(b1, b2):
        anc1 = [b1]
        while anc1[-1] != 0:
            anc1.append(m.body_parentid[anc1[-1]])
        k = 0
        b = b2
        while b not in anc1:
            b = m.body_parentid[b]
            k += 1
        return k + anc1.index(b)

    for i in range(d.ncon):
        c = d.contact[i]
        b1, b2 = m.geom_bodyid[c.geom1], m.geom_bodyid[c.geom2]
        if b1 == b2 or b1 == 0 or b2 == 0:
            continue
        if depth(b1, b2) <= max_depth:
            n1, n2 = m.body(b1).name, m.body(b2).name
            pairs.add(tuple(sorted((n1, n2))))
    return sorted(pairs)


SCENES = ("floor", "table", "none")

HOME = {
    "arm": {"r_shoulder_pitch": 0.3, "r_elbow": 1.3},
    "torso": {"r_shoulder_pitch": 0.3, "r_elbow": 1.3, "l_shoulder_pitch": 0.3, "l_elbow": 1.3, "head_tilt": 0.6},
    "mobile": {"lift": 0.25, "r_shoulder_pitch": 0.3, "r_elbow": 1.3, "l_shoulder_pitch": 0.3, "l_elbow": 1.3,
               "head_tilt": 0.6},
}


def _home_keyframe(xml: str, variant: str) -> tuple[str, str]:
    """qpos and ctrl strings of the 'home' keyframe (servo targets = home angles)."""
    import mujoco

    m = mujoco.MjModel.from_xml_string(xml)
    d = mujoco.MjData(m)
    for k, v in HOME.get(variant, {}).items():
        if mujoco.mj_name2id(m, mujoco.mjtObj.mjOBJ_JOINT, k) >= 0:
            d.joint(k).qpos[0] = v
    ctrl = np.zeros(m.nu)
    for i in range(m.nu):
        if m.actuator_biastype[i] == mujoco.mjtBias.mjBIAS_AFFINE and m.actuator_biasprm[i, 1] != 0:
            ctrl[i] = d.qpos[m.jnt_qposadr[m.actuator_trnid[i, 0]]]
    return _f(d.qpos), _f(ctrl)


def planar_base_actuators(robot: Robot) -> list[tuple[str, dict]]:
    """Velocity servos on the planar base joints (world-frame x, y, yaw).

    The force limits are what three wheel servos can push: each wheel gives at most
    ``stall / r`` along its rolling direction, and for a kiwi base the worst-case planar
    force is 1.5 wheel forces along x or y and the yaw torque is 3 wheel forces times the
    wheel distance. The env converts body-frame velocity commands to world frame.
    """
    b = robot.base
    wd = robot.wheel_drive()
    Fw = wd.max_effort / b.wheel_radius
    F, T = 1.5 * Fw, 3 * Fw * b.wheel_distance
    return [
        ("velocity", {"name": "base_x", "joint": "base_x", "kv": "400", "forcerange": f"{-F:.4g} {F:.4g}",
                      "ctrlrange": f"{-b.max_speed:.4g} {b.max_speed:.4g}"}),
        ("velocity", {"name": "base_y", "joint": "base_y", "kv": "400", "forcerange": f"{-F:.4g} {F:.4g}",
                      "ctrlrange": f"{-b.max_speed:.4g} {b.max_speed:.4g}"}),
        ("velocity", {"name": "base_yaw", "joint": "base_yaw", "kv": "20", "forcerange": f"{-T:.4g} {T:.4g}",
                      "ctrlrange": f"{-b.max_yaw_rate:.4g} {b.max_yaw_rate:.4g}"}),
    ]


def build_xml(robot: Robot = DEFAULT, variant: str = "mobile", base_mode: str = "planar",
              meshes: bool = False, scene: str | None = None, timestep: float = 0.002,
              extra_world: str = "", props: dict | None = None) -> str:
    """MJCF string. ``scene``: 'floor' (default for mobile) or 'table' (default for arm/torso)."""
    if scene is None:
        scene = "floor" if variant == "mobile" else "table"
    props = load_mass_properties() if props is None else props
    tree = build_tree(robot, variant, base_mode)
    root = ET.Element("mujoco", model=f"homebot_{variant}")
    ET.SubElement(root, "compiler", angle="radian", autolimits="true", meshdir=str(STL_DIR))
    ET.SubElement(root, "option", timestep=f"{timestep:g}", integrator="implicitfast", cone="elliptic",
                  impratio="5")
    vis = ET.SubElement(root, "visual")
    ET.SubElement(vis, "global", offwidth="1280", offheight="960", azimuth="140", elevation="-20")
    ET.SubElement(vis, "headlight", ambient="0.35 0.35 0.35", diffuse="0.6 0.6 0.6")
    ET.SubElement(vis, "quality", shadowsize="2048")
    default = ET.SubElement(root, "default")
    ET.SubElement(default, "geom", condim="3", friction="0.8 0.01 0.0005", solref="0.005 1")
    asset = ET.SubElement(root, "asset")
    ET.SubElement(asset, "texture", name="grid", type="2d", builtin="checker", width="512", height="512",
                  rgb1="0.82 0.82 0.80", rgb2="0.74 0.74 0.72")
    ET.SubElement(asset, "material", name="grid", texture="grid", texrepeat="8 8", reflectance="0.05")
    ET.SubElement(asset, "texture", name="sky", type="skybox", builtin="gradient", rgb1="0.98 0.98 1.0",
                  rgb2="0.80 0.84 0.90", width="256", height="256")
    mesh_names = set()
    if meshes:
        for stl in sorted(STL_DIR.glob("*.stl")):
            name = stl.stem
            ET.SubElement(asset, "mesh", name=name, file=stl.name, scale="0.001 0.001 0.001")
            mesh_names.add(name)
    wb = ET.SubElement(root, "worldbody")
    ET.SubElement(wb, "light", pos="1 -1 2.5", dir="-0.4 0.4 -1", diffuse="0.6 0.6 0.6", castshadow="true")
    ET.SubElement(wb, "geom", name="floor", type="plane", size="5 5 0.05", material="grid", group="0")
    if scene == "table":
        ET.SubElement(wb, "geom", name="table", type="box", size="0.30 0.45 0.02", pos="0.42 0 0.73",
                      rgba="0.55 0.40 0.28 1", group="0")
    actuators: list = []
    equalities: list = []
    for ch in tree.children:
        _add_body(robot, wb, ch, props, meshes, mesh_names, actuators, equalities)
    if extra_world:
        for el in ET.fromstring(f"<w>{extra_world}</w>"):
            wb.append(el)
    if equalities:
        eq = ET.SubElement(root, "equality")
        for j1, j2 in equalities:
            ET.SubElement(eq, "joint", joint1=j1, joint2=j2, polycoef="0 1 0 0 0", solref="0.004 1")
    act = ET.SubElement(root, "actuator")
    for tag, attrs in actuators:
        ET.SubElement(act, tag, **attrs)
    if variant == "mobile" and base_mode == "planar":
        for tag, attrs in planar_base_actuators(robot):
            ET.SubElement(act, tag, **attrs)
    xml = ET.tostring(root, encoding="unicode")
    pairs = set(_overlapping_pairs(xml))
    tree_names = [b.name for b in tree.walk()]
    for side in ("l_", "r_"):  # the two jaws: geared together, pads touch when closed
        if side + "jaw" in tree_names:
            pairs.add((side + "jaw", side + "jaw2"))
    pairs = sorted(pairs)
    if variant == "mobile" and base_mode == "free":  # rollers touch only the floor
        pairs = sorted(set(pairs) | {tuple(sorted(("base", n))) for n in tree_names if "_roller_" in n})
    if pairs:
        contact = ET.SubElement(root, "contact")
        for b1, b2 in pairs:
            ET.SubElement(contact, "exclude", body1=b1, body2=b2)
        xml = ET.tostring(root, encoding="unicode")
    qpos, ctrl = _home_keyframe(xml, variant)
    kf = ET.SubElement(root, "keyframe")
    ET.SubElement(kf, "key", name="home", qpos=qpos, ctrl=ctrl)
    return ET.tostring(root, encoding="unicode")


@lru_cache(maxsize=16)
def _cached(variant, base_mode, meshes, scene, timestep):

    return build_xml(DEFAULT, variant, base_mode, meshes, scene, timestep)


def load(variant: str = "mobile", base_mode: str = "planar", meshes: bool = False, scene: str | None = None,
         timestep: float = 0.002, robot: Robot | None = None, extra_world: str = ""):
    """Compiled ``mujoco.MjModel`` of a variant (default robot parameters are cached)."""
    import mujoco

    if robot is None and not extra_world:
        xml = _cached(variant, base_mode, meshes, scene, timestep)
    else:
        xml = build_xml(robot or DEFAULT, variant, base_mode, meshes, scene, timestep, extra_world)
    return mujoco.MjModel.from_xml_string(xml)
