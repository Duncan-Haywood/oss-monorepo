"""Milestone 6: the ledger seat and the ledger slide on a second contact model (Drake).

The same scenes as ``ledger.seat`` (milestone 3) and ``humanoid.slide_sim`` (milestone 3b), built
in Drake's ``MultibodyPlant`` instead of MuJoCo: a rigid 4x8 sheet whose only collision geometry
is small spheres on its back face (the wall contacts) and on its bottom edge (the feet), a wall,
and a ledger board. The holder law, its gains, its release and the press are copied from
``ledger.seat`` and applied as an external wrench at the sheet's centre each step.

What differs is the contact model. MuJoCo (milestone 3) solves a soft, convex contact problem with
an elliptic cone, ``impratio`` 10 and no-slip iterations. Drake here uses point contact with a
compliant normal (stiffness ``k_contact`` N/m) and either

* SAP (``solver="sap"``): Castro et al. 2022, a convex, unconstrained formulation with a
  regularised Coulomb cone whose stiction is near-rigid; or
* TAMSI (``solver="tamsi"``): Castro et al. 2020, a Stribeck-regularised friction law with a
  stiction tolerance (``stiction_tol``, m/s) under which surfaces creep.

Both are discrete at ``time_step`` (Drake's default 1 ms). Requires ``pip install drake``
(checked with 1.51.1).
"""
import math

import numpy as np

from . import ledger as L

G = L.G
MASS, W, H, T = L.MASS, L.W, L.H, L.T
R_SPHERE = 0.002


def _build(mu, layout, sag, ledger_dz, solver, time_step, k_contact, dissipation, stiction_tol,
           mu_ledger=None, edge=None):
    from pydrake.geometry import (Box, CollisionFilterDeclaration, GeometrySet, ProximityProperties,
                                  Sphere)
    from pydrake.math import RigidTransform, RotationMatrix
    from pydrake.multibody.plant import (AddMultibodyPlant, CoulombFriction, MultibodyPlantConfig)
    from pydrake.multibody.tree import SpatialInertia, UnitInertia
    from pydrake.systems.analysis import Simulator
    from pydrake.systems.framework import DiagramBuilder

    builder = DiagramBuilder()
    cfg = MultibodyPlantConfig(time_step=time_step, contact_model="point",
                               discrete_contact_approximation=solver,
                               stiction_tolerance=stiction_tol)
    plant, sg = AddMultibodyPlant(cfg, builder)

    def props(m):
        p = ProximityProperties()
        p.AddProperty("material", "coulomb_friction", CoulombFriction(m, m))
        p.AddProperty("material", "point_contact_stiffness", k_contact)
        p.AddProperty("material", "hunt_crossley_dissipation", dissipation)
        p.AddProperty("material", "relaxation_time", 2 * time_step)
        return p

    world = plant.world_body()
    wall_id = plant.RegisterCollisionGeometry(
        world, RigidTransform([-0.05, 0, 1.5]), Box(0.1, 6, 6), "wall", props(mu))
    lt = math.atan2(ledger_dz, W)
    mu_l = mu if mu_ledger is None else mu_ledger
    ledger_id = plant.RegisterCollisionGeometry(
        world, RigidTransform(RotationMatrix.MakeXRotation(lt), [0.02, 0, L.LEDGER_Z - 0.02]),
        Box(0.04, 3.0, 0.04), "ledger", props(mu_l))
    sheet = plant.AddRigidBody("sheet", SpatialInertia(MASS, np.zeros(3), UnitInertia.SolidBox(T, W, H)))
    hw, hh, ht, r = W / 2, H / 2, T / 2, R_SPHERE
    wall_pts, foot_ids = [], []
    for i, (y, z) in enumerate(L.wall_points(layout)):
        wall_pts.append(plant.RegisterCollisionGeometry(
            sheet, RigidTransform([-ht + r, y, z]), Sphere(r), f"w{i}", props(mu)))
    feet = [(-hw + r, -hh + r), (hw - r, -hh + r)]
    if sag:
        feet.append((0.0, -hh + r - sag))
    if edge is not None:
        feet = [(y, -hh + r + dz) for y, dz in edge]
    for i, (y, z) in enumerate(feet):
        foot_ids.append(plant.RegisterCollisionGeometry(
            sheet, RigidTransform([0, y, z]), Sphere(r), f"f{i}", props(mu_l)))
    plant.Finalize()
    # as in MuJoCo: wall contacts touch only the wall, feet only the ledger
    sg.collision_filter_manager().Apply(CollisionFilterDeclaration().ExcludeBetween(
        GeometrySet(wall_pts), GeometrySet([ledger_id])))
    sg.collision_filter_manager().Apply(CollisionFilterDeclaration().ExcludeBetween(
        GeometrySet(foot_ids), GeometrySet([wall_id])))
    diagram = builder.Build()
    sim = Simulator(diagram)
    ctx = sim.get_mutable_context()
    pctx = plant.GetMyMutableContextFromRoot(ctx)
    return plant, sheet, sim, ctx, pctx, feet, ledger_id


def seat(theta0=math.radians(1.0), mu=0.4, f_n=50.0, k_hold=None, layout="corners", sag=0.0,
         ledger_dz=0.0, v=0.02, t_release=0.5, settle=2.0, k_theta=3000.0, solver="sap",
         time_step=1e-3, k_contact=1e6, dissipation=5.0, stiction_tol=1e-4, gap=0.010, edge=None):
    """``ledger.seat`` in Drake. Same arguments and returns (tilt relative to the ledger, rad;
    creep rate after settling, rad/s; time of first contact; run time), plus the solver,
    contact stiffness (N/m), Hunt-Crossley dissipation (s/m) and TAMSI stiction tolerance."""
    from pydrake.math import RigidTransform, RotationMatrix
    from pydrake.multibody.math import SpatialForce
    from pydrake.multibody.plant import ExternallyAppliedSpatialForce

    plant, sheet, sim, ctx, pctx, feet, ledger_id = _build(
        mu, layout, sag, ledger_dz, solver, time_step, k_contact, dissipation, stiction_tol,
        edge=edge)
    Rx = RotationMatrix.MakeXRotation(theta0)
    low = min((Rx.matrix() @ np.array([0.0, y, z]))[2] - R_SPHERE for y, z in feet)
    z0 = 1.8
    z0 += (L.LEDGER_Z + gap) - (z0 + low)
    plant.SetFreeBodyPose(pctx, sheet, RigidTransform(Rx, [T / 2 + 1e-4, 0.0, z0]))
    y0, z_ref = 0.0, z0
    kt, bt = 20000.0, 2 * math.sqrt(20000.0 * MASS)
    inertia = MASS * (W ** 2 + H ** 2) / 12
    bth = 2 * math.sqrt(k_theta * inertia)
    k_flat, b_flat = 500.0, 50.0
    port = plant.get_applied_spatial_force_input_port()
    cres = plant.get_contact_results_output_port()
    t_contact, t_end = None, 30.0
    t = 0.0
    lt = math.atan2(ledger_dz, W)
    while t < t_end:
        X = plant.EvalBodyPoseInWorld(pctx, sheet)
        R = X.rotation().matrix()
        p = X.translation()
        V = plant.EvalBodySpatialVelocityInWorld(pctx, sheet)
        w_, lin = V.rotational(), V.translational()
        th = L.theta_of(R)
        if t_contact is None:
            res = cres.Eval(pctx)
            for i in range(res.num_point_pair_contacts()):
                pp = res.point_pair_contact_info(i).point_pair()
                if ledger_id in (pp.id_A, pp.id_B):
                    t_contact = t
                    t_end = t_contact + t_release + settle
                    break
        if t_contact is None:
            rr = 1.0
            z_ref -= v * time_step
        else:
            rr = max(0.0, 1.0 - (t - t_contact) / t_release)
        fy = rr * (kt * (y0 - p[1]) - bt * lin[1])
        fz = rr * (MASS * G + kt * (z_ref - p[2]) - bt * lin[2])
        if k_hold is None:
            tx = rr * (k_theta * (theta0 - th) - bth * w_[0])
        else:
            bh = 2 * math.sqrt(max(k_hold, 1.0) * inertia)
            kk = k_theta + (k_hold - k_theta) * (1 - rr)
            bb = bth + (bh - bth) * (1 - rr)
            tx = kk * (theta0 - th) - bb * w_[0]
        ty = -k_flat * math.atan2(R[0, 2], R[2, 2]) - b_flat * w_[1]
        tz = k_flat * math.atan2(R[0, 1], R[1, 1]) - b_flat * w_[2]
        f = ExternallyAppliedSpatialForce()
        f.body_index = sheet.index()
        f.p_BoBq_B = np.zeros(3)
        f.F_Bq_W = SpatialForce([tx, ty, tz], [-f_n, fy, fz])
        port.FixValue(pctx, [f])
        t += time_step
        sim.AdvanceTo(t)
    R = plant.EvalBodyPoseInWorld(pctx, sheet).rotation().matrix()
    V = plant.EvalBodySpatialVelocityInWorld(pctx, sheet)
    return {"theta": L.theta_of(R) - lt, "creep": float(V.rotational()[0]), "t_contact": t_contact,
            "t": t}


def slide(h, mu_l=0.4, mu_w=0.4, f_n=50.0, h_press=None, v=0.05, k=2.0e4, t_push=2.0,
          settle=0.5, solver="sap", time_step=1e-3, k_contact=1e6, dissipation=5.0,
          stiction_tol=1e-4):
    """``humanoid.slide_sim`` in Drake, line for line: push a seated sheet sideways (+y) with a
    hand moving at v through a spring k at height h above its bottom edge, pressing f_n at
    h_press (default h). Returns the peak tilt magnitude (rad), the distance slid (m) and the
    mean push force after the first 0.5 s of pushing (N)."""
    from pydrake.math import RigidTransform
    from pydrake.multibody.math import SpatialForce
    from pydrake.multibody.plant import ExternallyAppliedSpatialForce

    h_press = h if h_press is None else h_press
    plant, sheet, sim, ctx, pctx, feet, _ = _build(
        mu_w, "corners", 0.0, 0.0, solver, time_step, k_contact, dissipation, stiction_tol,
        mu_ledger=mu_l)
    plant.SetFreeBodyPose(pctx, sheet, RigidTransform([T / 2 + 1e-4, 0.0, L.LEDGER_Z + H / 2 + 1e-4]))
    port = plant.get_applied_spatial_force_input_port()
    flat_k, flat_b = 500.0, 50.0
    hand, y_start, forces, peak = None, None, [], 0.0
    t, t_end = 0.0, settle + t_push
    while t < t_end:
        X = plant.EvalBodyPoseInWorld(pctx, sheet)
        R, com = X.rotation().matrix(), X.translation()
        V = plant.EvalBodySpatialVelocityInWorld(pctx, sheet)
        w_, lin = V.rotational(), V.translational()
        p_push = com + R @ np.array([T / 2, 0.0, h - H / 2])
        p_press = com + R @ np.array([T / 2, 0.0, h_press - H / 2])
        f_press = np.array([-f_n, 0.0, 0.0])
        f_push = np.zeros(3)
        if t >= settle:
            if hand is None:
                hand, y_start = float(p_push[1]), float(com[1])
            hand += v * time_step
            pt_vel = lin + np.cross(w_, p_push - com)
            fy = max(0.0, k * (hand - p_push[1]) - 2 * math.sqrt(k * MASS) * (pt_vel[1] - v))
            f_push = np.array([0.0, fy, 0.0])
            if t > settle + 0.5:
                forces.append(fy)
        torque = np.cross(p_push - com, f_push) + np.cross(p_press - com, f_press)
        torque += [0.0, -flat_k * math.atan2(R[0, 2], R[2, 2]) - flat_b * w_[1],
                   flat_k * math.atan2(R[0, 1], R[1, 1]) - flat_b * w_[2]]
        f = ExternallyAppliedSpatialForce()
        f.body_index = sheet.index()
        f.p_BoBq_B = np.zeros(3)
        f.F_Bq_W = SpatialForce(torque, f_push + f_press)
        port.FixValue(pctx, [f])
        t += time_step
        sim.AdvanceTo(t)
        if t >= settle:
            Rn = plant.EvalBodyPoseInWorld(pctx, sheet).rotation().matrix()
            peak = max(peak, abs(L.theta_of(Rn)))
    com = plant.EvalBodyPoseInWorld(pctx, sheet).translation()
    return {"peak_tilt": peak, "slid": float(com[1] - (y_start or 0.0)),
            "push_mean": float(np.mean(forces)) if forces else 0.0}


def tip_threshold(mu_l, mu_w=0.4, f_n=50.0, h_press=None, tilt=math.radians(0.5), tol=0.01, **kw):
    """``humanoid.tip_threshold_sim`` in Drake: least push height (m above the bottom edge) at
    which the slide tilts the sheet past ``tilt``; None if pushing near the top does not."""
    def peak(h):
        return slide(h, mu_l, mu_w, f_n, h_press, **kw)["peak_tilt"]
    lo, hi = 0.05, H - 0.05
    if peak(hi) < tilt:
        return None
    while hi - lo > tol:
        mid = (lo + hi) / 2
        if peak(mid) >= tilt:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2
