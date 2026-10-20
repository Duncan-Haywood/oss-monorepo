"""IFC4 export of a Plan through IfcOpenShell (optional dependency: pip install ifcopenshell).

One IfcWall per wall (extruded rectangle, 3.5 in thick for interior walls, 5.5 in or 3.5 in for the
exterior per the stud size), one IfcSlab for the floor, and an IfcOpeningElement with an IfcDoor or
IfcWindow filling it for every opening. SI units (metres) in the file. Geometry is simple extrusions:
studs and plates are not modelled as separate members.
"""
import math

import ifcopenshell
import ifcopenshell.api

FT = 0.3048
IN = 0.0254


def export(plan, takeoff_result, path):
    from .takeoff import PLATE_H
    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    project = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcProject", name="house-plan")
    ifcopenshell.api.run("unit.assign_unit", f, length={"is_metric": True, "raw": "METERS"})
    ctx = ifcopenshell.api.run("context.add_context", f, context_type="Model")
    body = ifcopenshell.api.run("context.add_context", f, context_type="Model", context_identifier="Body",
                                target_view="MODEL_VIEW", parent=ctx)
    site = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSite", name="Site")
    bldg = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuilding", name="House")
    storey = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcBuildingStorey", name="Level 1")
    ifcopenshell.api.run("aggregate.assign_object", f, products=[site], relating_object=project)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[bldg], relating_object=site)
    ifcopenshell.api.run("aggregate.assign_object", f, products=[storey], relating_object=bldg)

    def place(prod, x, y, z, angle):
        c, s = math.cos(angle), math.sin(angle)
        m = [[c, -s, 0, x], [s, c, 0, y], [0, 0, 1, z], [0, 0, 0, 1]]
        import numpy as np
        ifcopenshell.api.run("geometry.edit_object_placement", f, product=prod, matrix=np.array(m, dtype=float))

    def box(prod, length, thick, height, local_x=0.0, local_y=0.0):
        """Extruded rectangle: length along local x from 0, thickness centred on local y."""
        rep = ifcopenshell.api.run("geometry.add_wall_representation", f, context=body, length=length,
                                   height=height, thickness=thick)
        ifcopenshell.api.run("geometry.assign_representation", f, product=prod, representation=rep)

    wall_t = {}
    stud = takeoff_result["sizes"]["stud"]
    ext_t = (5.5 if stud == "2x6" else 3.5) * IN
    for w in plan.walls:
        t = ext_t if w.exterior else 3.5 * IN
        wall_t[w.id] = t
        ent = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcWall", name=w.id)
        ang = math.atan2(w.y1 - w.y0, w.x1 - w.x0)
        place(ent, w.x0 * FT, w.y0 * FT, 0.0, ang)
        box(ent, w.length * FT, t, PLATE_H * IN)
        ifcopenshell.api.run("spatial.assign_container", f, products=[ent], relating_structure=storey)
        for o in (o for o in plan.openings if o.wall == w.id):
            op = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcOpeningElement", name=f"opening-{w.id}")
            fill = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcDoor" if o.kind == "door" else "IfcWindow",
                                        name=f"{o.kind}-{o.room}")
            for e in (op, fill):
                ox = (w.x0 + (o.offset + o.width / 2) * math.cos(ang) * 1) * FT
                oy = (w.y0 + (o.offset + o.width / 2) * math.sin(ang) * 1) * FT
                place(e, ox - math.cos(ang) * o.width / 2 * FT, oy - math.sin(ang) * o.width / 2 * FT,
                      o.sill * FT, ang)
                rep = ifcopenshell.api.run("geometry.add_wall_representation", f, context=body, length=o.width * FT,
                                           height=o.height * FT, thickness=t if e is op else 2.0 * IN)
                ifcopenshell.api.run("geometry.assign_representation", f, product=e, representation=rep)
            ifcopenshell.api.run("feature.add_feature", f, feature=op, element=ent)
            ifcopenshell.api.run("feature.add_filling", f, opening=op, element=fill)
            ifcopenshell.api.run("spatial.assign_container", f, products=[fill], relating_structure=storey)

    slab = ifcopenshell.api.run("root.create_entity", f, ifc_class="IfcSlab", name="floor")
    place(slab, 0.0, 0.0, -0.2, 0.0)
    profile = f.createIfcRectangleProfileDef("AREA", None, f.createIfcAxis2Placement2D(
        f.createIfcCartesianPoint((plan.params.width * FT / 2, plan.params.depth * FT / 2))),
        plan.params.width * FT, plan.params.depth * FT)
    solid = f.createIfcExtrudedAreaSolid(profile, f.createIfcAxis2Placement3D(f.createIfcCartesianPoint((0.0, 0.0, 0.0))),
                                         f.createIfcDirection((0.0, 0.0, 1.0)), 0.2)
    rep = f.createIfcShapeRepresentation(body, "Body", "SweptSolid", [solid])
    ifcopenshell.api.run("geometry.assign_representation", f, product=slab, representation=rep)
    ifcopenshell.api.run("spatial.assign_container", f, products=[slab], relating_structure=storey)
    f.write(path)
    return f
