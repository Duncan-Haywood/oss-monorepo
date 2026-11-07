//! The IFC layer: units, storeys, walls (axis, joins, layers, height) and the
//! doors, windows and bare openings they host.
//!
//! What is read, and from where (attribute positions are the same in IFC2X3
//! and IFC4 for everything here):
//!  - length and plane-angle units from the project's IfcUnitAssignment
//!    (SI prefixes and conversion-based units such as FOOT and DEGREE);
//!  - every placement as a full 3D rigid frame (IfcLocalPlacement chains);
//!  - a wall's reference line from its `Axis` representation (IfcPolyline,
//!    IfcTrimmedCurve on an IfcLine or IfcCircle, IfcIndexedPolyCurve), else
//!    the long side of its body's plan bounding box;
//!  - wall joins from IfcRelConnectsPathElements: an ATSTART/ATEND pair meets
//!    at the intersection of the two lines (an L corner), an end against
//!    ATPATH is brought onto the other wall's line (a tee). Authoring tools
//!    trim or extend the axis at a join, so without this the corners of a
//!    real model do not touch;
//!  - thickness and layers from IfcMaterialLayerSetUsage, and the centre line
//!    from the layer set's offset and direction sense;
//!  - openings through IfcRelVoidsElement (wall to IfcOpeningElement) and
//!    IfcRelFillsElement (opening to door or window); the rough opening's
//!    extent along the wall, sill and height come from the opening's own
//!    body, so an opening is placed by its geometry, not by guessing which
//!    corner of a door its placement origin sits at;
//!  - doors and windows with no fill relationship are hosted by proximity:
//!    the wall on the same storey whose line their body lies on.
//!
//! All output lengths are metres, in the project's world coordinates.

use crate::geom::{self, Frame, V3};
use crate::step::{Model, Value};
use std::collections::{HashMap, HashSet};

const WALL_TYPES: [&str; 3] = ["IFCWALL", "IFCWALLSTANDARDCASE", "IFCWALLELEMENTEDCASE"];
const MAX_DEPTH: usize = 32;

#[derive(Debug, Clone)]
pub struct Storey {
    pub id: u32,
    pub name: String,
    pub elevation: f64,
}

#[derive(Debug, Clone)]
pub struct Layer {
    pub material: String,
    pub thickness: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum OpeningKind { Door, Window, Void }

impl OpeningKind {
    pub fn as_str(&self) -> &'static str {
        match self { OpeningKind::Door => "door", OpeningKind::Window => "window", OpeningKind::Void => "void" }
    }
}

#[derive(Debug, Clone)]
pub struct Opening {
    /// The door or window, or the bare IfcOpeningElement when unfilled.
    pub id: u32,
    pub guid: String,
    pub name: String,
    pub kind: OpeningKind,
    /// Distance along the wall's centre line from its start, metres.
    pub from: f64,
    pub to: f64,
    /// Bottom of the rough opening above the wall's base.
    pub sill: f64,
    pub height: f64,
    /// OverallWidth / OverallHeight of the door or window, when given.
    pub unit_width: Option<f64>,
    pub unit_height: Option<f64>,
    /// "fills" (IfcRelFillsElement), "void" (unfilled opening), "proximity".
    pub hosted_by: &'static str,
}

#[derive(Debug, Clone)]
pub struct Wall {
    pub id: u32,
    pub guid: String,
    pub name: String,
    pub storey: Option<usize>,
    /// Centre line in plan, metres.
    pub start: [f64; 2],
    pub end: [f64; 2],
    /// Base elevation (world z) and height of the body.
    pub base: f64,
    pub height: Option<f64>,
    pub thickness: Option<f64>,
    pub layers: Vec<Layer>,
    pub axis_source: &'static str,
    /// For an arc wall, its radius and arc length (start/end are the chord).
    pub arc: Option<(f64, f64)>,
    pub joined_start: &'static str,
    pub joined_end: &'static str,
    pub openings: Vec<Opening>,
    /// The original walls merged into this run (empty when not merged).
    pub parts: Vec<u32>,
}

impl Wall {
    /// False for a wall whose layers name concrete, masonry or similar and no
    /// wood; true for wood, and for a wall with no layer information (unknown
    /// is kept). The match is on the material names, so it is a filter for a
    /// US-style Revit export, not a structural classification.
    pub fn maybe_wood_framed(&self) -> bool {
        let has = |m: &Layer, keys: &[&str]| { let n = m.material.to_lowercase(); keys.iter().any(|k| n.contains(k)) };
        if self.layers.is_empty() { return true; }
        if self.layers.iter().any(|l| has(l, &["wood", "stud", "timber", "lumber", "lvl", "joist"])) { return true; }
        !self.layers.iter().any(|l| has(l, &["concrete", "masonry", "cmu", "brick", "block", "stone", "steel", "metal"]))
    }
    pub fn length(&self) -> f64 { ((self.end[0] - self.start[0]).powi(2) + (self.end[1] - self.start[1]).powi(2)).sqrt() }
}

#[derive(Debug, Default)]
pub struct Building {
    pub schema: String,
    pub length_unit: f64,
    pub length_unit_source: String,
    pub storeys: Vec<Storey>,
    pub walls: Vec<Wall>,
    pub warnings: Vec<String>,
    pub stats: Stats,
}

#[derive(Debug, Default)]
pub struct Stats {
    pub entities: usize,
    pub skipped_records: usize,
    pub walls_without_geometry: usize,
    pub joins_applied: usize,
    pub joins_rejected: usize,
    /// Straight continuations (an ATSTART/ATEND pair on parallel lines that already meet).
    pub joins_collinear: usize,
    /// Wall runs built by merging straight continuations.
    pub wall_runs_merged: usize,
    /// Pairs of wall pieces joined across a door or window standing between them.
    pub gaps_bridged: usize,
    pub openings_by_fill: usize,
    pub openings_void: usize,
    pub openings_by_proximity: usize,
    pub doors_windows_unhosted: usize,
    pub openings_without_geometry: usize,
    /// Doors and windows filling an opening in something other than a wall (a roof, a slab).
    pub openings_in_other_hosts: usize,
}

struct Ctx<'m, 'a> {
    m: &'m Model<'a>,
    len: f64,
    angle: f64,
    frames: HashMap<u32, Frame>,
}

pub fn read(m: &Model) -> Building {
    let mut b = Building { schema: m.schema.clone(), ..Default::default() };
    b.stats.entities = m.len();
    b.stats.skipped_records = m.skipped;
    let (len, src, angle) = units(m);
    b.length_unit = len;
    b.length_unit_source = src;
    let mut cx = Ctx { m, len, angle, frames: HashMap::new() };

    // storeys, by elevation
    let mut storeys: Vec<Storey> = m.of_type("IFCBUILDINGSTOREY").into_iter().map(|id| {
        let a = m.args(id).unwrap_or_default();
        let f = cx.placement(a.get(5).and_then(Value::as_ref), 0);
        let name = a.get(2).and_then(Value::as_str).filter(|s| !s.is_empty()).or_else(|| a.get(7).and_then(Value::as_str)).unwrap_or_else(|| format!("#{id}"));
        Storey { id, name, elevation: f.o[2] }
    }).collect();
    storeys.sort_by(|p, q| p.elevation.total_cmp(&q.elevation));
    let storey_idx: HashMap<u32, usize> = storeys.iter().enumerate().map(|(i, s)| (s.id, i)).collect();
    let mut container: HashMap<u32, usize> = HashMap::new();
    for r in m.of_type("IFCRELCONTAINEDINSPATIALSTRUCTURE") {
        let a = m.args(r).unwrap_or_default();
        if let Some(&si) = a.get(5).and_then(Value::as_ref).and_then(|s| storey_idx.get(&s)) {
            for el in a.get(4).and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(e) = el.as_ref() { container.insert(e, si); }
            }
        }
    }
    b.storeys = storeys;

    // material layer set usage per element
    let mut usage: HashMap<u32, u32> = HashMap::new();
    for r in m.of_type("IFCRELASSOCIATESMATERIAL") {
        let a = m.args(r).unwrap_or_default();
        let Some(mat) = a.get(5).and_then(Value::as_ref) else { continue };
        for el in a.get(4).and_then(Value::as_list).unwrap_or(&[]) {
            if let Some(e) = el.as_ref() { usage.insert(e, mat); }
        }
    }
    // a wall type's layer set, for walls whose material comes from their type
    let mut typed: HashMap<u32, u32> = HashMap::new();
    for r in m.of_type("IFCRELDEFINESBYTYPE") {
        let a = m.args(r).unwrap_or_default();
        let Some(t) = a.get(5).and_then(Value::as_ref) else { continue };
        if let Some(&mat) = usage.get(&t) {
            for el in a.get(4).and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(e) = el.as_ref() { typed.entry(e).or_insert(mat); }
            }
        }
    }

    let mut walls: Vec<Wall> = Vec::new();
    let mut wall_index: HashMap<u32, usize> = HashMap::new();
    let _ = &wall_index;
    let mut wall_frames: Vec<Frame> = Vec::new();
    for ty in WALL_TYPES {
        for id in m.of_type(ty) {
            let a = m.args(id).unwrap_or_default();
            let frame = cx.placement(a.get(5).and_then(Value::as_ref), 0);
            let reps = cx.representations(a.get(6).and_then(Value::as_ref));
            let mut body_local: Vec<V3> = Vec::new();
            for (ident, items) in &reps {
                if ident == "Body" || ident.is_empty() {
                    for &it in items { cx.points(it, &Frame::ID, &mut body_local, 0); }
                }
            }
            let mut arc = None;
            let mut axis: Option<([f64; 3], [f64; 3], &'static str)> = None;
            for (ident, items) in &reps {
                if ident != "Axis" { continue; }
                for &it in items {
                    if let Some((p, q, src, a2)) = cx.curve_ends(it, 0) { axis = Some((p, q, src)); arc = a2; break; }
                }
            }
            if axis.is_none() && body_local.len() >= 3 {
                let (x0, x1, y0, y1) = bbox(&body_local);
                axis = Some(if x1 - x0 >= y1 - y0 {
                    ([x0, (y0 + y1) / 2.0, 0.0], [x1, (y0 + y1) / 2.0, 0.0], "body-bbox")
                } else {
                    ([(x0 + x1) / 2.0, y0, 0.0], [(x0 + x1) / 2.0, y1, 0.0], "body-bbox")
                });
            }
            let Some((p, q, axis_source)) = axis else { b.stats.walls_without_geometry += 1; continue };
            // layers and the centre-line offset (in wall-local Y)
            let mat = usage.get(&id).or_else(|| typed.get(&id)).copied();
            let (layers, centre_offset) = cx.layers(mat);
            let thickness = if layers.is_empty() {
                // the body's extent across the axis
                if body_local.len() >= 3 {
                    let d = geom::unit(geom::sub(q, p)).unwrap_or([1.0, 0.0, 0.0]);
                    let nrm = [-d[1], d[0], 0.0];
                    let s: Vec<f64> = body_local.iter().map(|v| geom::dot(geom::sub(*v, p), nrm)).collect();
                    let t = s.iter().cloned().fold(f64::MIN, f64::max) - s.iter().cloned().fold(f64::MAX, f64::min);
                    (t > 0.0).then_some(t)
                } else { None }
            } else { Some(layers.iter().map(|l| l.thickness).sum()) };
            // shift the reference line to the centre of the layers
            let (p, q) = match centre_offset {
                Some(off) if axis_source != "body-bbox" => {
                    let d = geom::unit(geom::sub(q, p)).unwrap_or([1.0, 0.0, 0.0]);
                    let nrm = [-d[1], d[0], 0.0];
                    (geom::add(p, geom::scale(nrm, off)), geom::add(q, geom::scale(nrm, off)))
                }
                _ => (p, q),
            };
            let wp = frame.apply(p);
            let wq = frame.apply(q);
            let zs: Vec<f64> = body_local.iter().map(|v| frame.apply(*v)[2]).collect();
            let (base, height) = if zs.is_empty() { (wp[2], None) } else {
                let lo = zs.iter().cloned().fold(f64::MAX, f64::min);
                let hi = zs.iter().cloned().fold(f64::MIN, f64::max);
                (lo, (hi - lo > 1e-6).then_some(hi - lo))
            };
            wall_index.insert(id, walls.len());
            wall_frames.push(frame);
            walls.push(Wall {
                id,
                guid: a.first().and_then(Value::as_str).unwrap_or_default(),
                name: a.get(2).and_then(Value::as_str).unwrap_or_default(),
                storey: container.get(&id).copied(),
                start: [wp[0], wp[1]],
                end: [wq[0], wq[1]],
                base,
                height,
                thickness,
                layers,
                axis_source,
                arc,
                joined_start: "",
                joined_end: "",
                openings: Vec::new(),
                parts: Vec::new(),
            });
        }
    }
    if !b.storeys.is_empty() && walls.iter().any(|w| w.storey.is_none()) {
        let n = walls.iter().filter(|w| w.storey.is_none()).count();
        b.warnings.push(format!("{n} wall(s) are not contained in any storey."));
    }

    let straight = joins(m, &mut walls, &wall_index, &mut b.stats);
    let (walls, _) = merge_straight(walls, &straight, &mut b.stats);
    // doors and windows standing in the gap between two pieces of one straight wall
    let mut unit_pts: HashMap<u32, Vec<V3>> = HashMap::new();
    for ty in ["IFCDOOR", "IFCWINDOW", "IFCDOORSTANDARDCASE", "IFCWINDOWSTANDARDCASE"] {
        for id in m.of_type(ty) { let p = cx.element_points(id); if !p.is_empty() { unit_pts.insert(id, p); } }
    }
    let gaps = bridges(&walls, &unit_pts, &container);
    b.stats.gaps_bridged = gaps.len();
    let (mut walls, wall_index) = merge_straight(walls, &gaps, &mut b.stats);

    // openings by relationship
    let mut fills: HashMap<u32, u32> = HashMap::new(); // opening -> door/window
    for r in m.of_type("IFCRELFILLSELEMENT") {
        let a = m.args(r).unwrap_or_default();
        if let (Some(o), Some(e)) = (a.get(4).and_then(Value::as_ref), a.get(5).and_then(Value::as_ref)) { fills.insert(o, e); }
    }
    let mut hosted: HashSet<u32> = HashSet::new();
    for r in m.of_type("IFCRELVOIDSELEMENT") {
        let a = m.args(r).unwrap_or_default();
        let (Some(host), Some(op)) = (a.get(4).and_then(Value::as_ref), a.get(5).and_then(Value::as_ref)) else { continue };
        let filler = fills.get(&op).copied();
        let Some(&wi) = wall_index.get(&host) else {
            // a skylight in a roof, a hatch in a slab: not a wall opening
            if let Some(f) = filler { if hosted.insert(f) { b.stats.openings_in_other_hosts += 1; } }
            continue
        };
        let pts = cx.element_points(op);
        let (kind, eid) = match filler.and_then(|f| m.type_of(f).map(|t| (f, t))) {
            Some((f, "IFCDOOR")) | Some((f, "IFCDOORSTANDARDCASE")) => (OpeningKind::Door, f),
            Some((f, "IFCWINDOW")) | Some((f, "IFCWINDOWSTANDARDCASE")) => (OpeningKind::Window, f),
            _ => (OpeningKind::Void, op),
        };
        let pts = if pts.is_empty() { filler.map(|f| cx.element_points(f)).unwrap_or_default() } else { pts };
        if pts.is_empty() { b.stats.openings_without_geometry += 1; continue; }
        if let Some(f) = filler { hosted.insert(f); }
        let src = if filler.is_some() { "fills" } else { "void" };
        if let Some(o) = place_opening(&cx, &walls[wi], eid, kind, &pts, src, None) {
            if filler.is_some() { b.stats.openings_by_fill += 1 } else { b.stats.openings_void += 1 }
            walls[wi].openings.push(o);
        }
    }
    // doors and windows with no relationship: host by proximity
    for ty in ["IFCDOOR", "IFCWINDOW", "IFCDOORSTANDARDCASE", "IFCWINDOWSTANDARDCASE"] {
        for id in m.of_type(ty) {
            if hosted.contains(&id) { continue; }
            let Some(pts) = unit_pts.get(&id).cloned() else { b.stats.doors_windows_unhosted += 1; continue };
            let st = container.get(&id).copied();
            let kind = if ty.starts_with("IFCDOOR") { OpeningKind::Door } else { OpeningKind::Window };
            let mut best: Option<((f64, f64), usize)> = None;
            for (wi, w) in walls.iter().enumerate() {
                if st.is_some() && w.storey.is_some() && w.storey != st { continue; }
                if let Some(score) = proximity(w, &pts) {
                    if best.is_none_or(|(s, _)| score.0 < s.0 - 1e-9 || (score.0 <= s.0 + 1e-9 && score.1 < s.1)) { best = Some((score, wi)); }
                }
            }
            match best.and_then(|(_, wi)| place_opening(&cx, &walls[wi], id, kind, &pts, "proximity", Some(st)).map(|o| (wi, o))) {
                Some((wi, o)) => { walls[wi].openings.push(o); b.stats.openings_by_proximity += 1; }
                None => b.stats.doors_windows_unhosted += 1,
            }
        }
    }
    for w in &mut walls { w.openings.sort_by(|p, q| p.from.total_cmp(&q.from)); }
    let mut voids_merged = 0usize;
    let mut voids_covered = 0usize;
    for w in &mut walls {
        let (ops, merged, covered) = tidy_openings(std::mem::take(&mut w.openings));
        w.openings = ops;
        voids_merged += merged;
        voids_covered += covered;
    }
    if voids_covered + voids_merged > 0 {
        b.warnings.push(format!("{voids_covered} bare opening(s) already filled by a door or window were dropped and {voids_merged} touching bare opening(s) were merged into their neighbours."));
    }
    let _ = wall_frames;
    if b.stats.walls_without_geometry > 0 {
        b.warnings.push(format!("{} wall(s) had no axis and no readable body and were skipped.", b.stats.walls_without_geometry));
    }
    if b.stats.doors_windows_unhosted > 0 {
        b.warnings.push(format!("{} door(s)/window(s) could not be placed in any wall (no fill relationship and no wall under them).", b.stats.doors_windows_unhosted));
    }
    if b.stats.joins_rejected > 0 {
        b.warnings.push(format!("{} wall join(s) were not applied: the lines are parallel or meet too far from the wall end.", b.stats.joins_rejected));
    }
    let framey = walls.iter().filter(|w| { let l = w.length(); l > 0.0 && w.openings.iter().map(|o| o.to - o.from).sum::<f64>() / l > 0.9 }).count();
    if framey > 0 {
        b.warnings.push(format!("{framey} wall(s) are more than 90% opening: often a window or door frame modelled as a wall (see openFraction); check before framing them."));
    }
    if walls.iter().any(|w| w.arc.is_some()) {
        b.warnings.push("Curved walls are reported by their chord; their arc length is in `arc`.".into());
    }
    b.walls = walls;
    b
}

/// Revit writes one IfcOpeningElement per cut, so a wall can carry a bare
/// void under the doors and windows that fill it, and one passage as several
/// touching voids. Drop a void that fills and units cover (80% or more of its
/// width) and merge voids that overlap or touch, so each rough opening is
/// counted once. Returns the openings, voids merged, voids dropped.
fn tidy_openings(ops: Vec<Opening>) -> (Vec<Opening>, usize, usize) {
    const TOUCH: f64 = 0.01;
    let fills: Vec<(f64, f64)> = ops.iter().filter(|o| o.kind != OpeningKind::Void).map(|o| (o.from, o.to)).collect();
    let mut covered = 0;
    let mut kept: Vec<Opening> = Vec::new();
    for o in ops {
        if o.kind == OpeningKind::Void && o.to > o.from {
            let mut iv: Vec<(f64, f64)> = fills.iter().map(|&(a, b)| (a.max(o.from), b.min(o.to))).filter(|(a, b)| b > a).collect();
            iv.sort_by(|p, q| p.0.total_cmp(&q.0));
            let (mut tot, mut end) = (0.0, f64::MIN);
            for (a, b) in iv {
                let a = a.max(end);
                if b > a { tot += b - a; end = b; }
            }
            if tot >= 0.8 * (o.to - o.from) { covered += 1; continue; }
        }
        kept.push(o);
    }
    let mut merged = 0;
    let mut out: Vec<Opening> = Vec::new();
    for o in kept {
        if let Some(last) = out.last_mut() {
            if last.kind == OpeningKind::Void && o.kind == OpeningKind::Void && o.from <= last.to + TOUCH {
                let top = (last.sill + last.height).max(o.sill + o.height);
                last.sill = last.sill.min(o.sill);
                last.height = top - last.sill;
                last.to = last.to.max(o.to);
                merged += 1;
                continue;
            }
        }
        out.push(o);
    }
    (out, merged, covered)
}

fn bbox(p: &[V3]) -> (f64, f64, f64, f64) {
    let mut r = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for v in p { r.0 = r.0.min(v[0]); r.1 = r.1.max(v[0]); r.2 = r.2.min(v[1]); r.3 = r.3.max(v[1]); }
    r
}

/// How well a body lies on a wall, for doors and windows with no fill
/// relationship. The body's plan centre must fall along the wall; then the
/// score is the gap between the body's extent across the wall and the
/// wall's thickness band (0 when they overlap), then the centre's distance
/// from the centre line. A body more than 0.15 m clear of the band is not
/// on the wall. Smaller is better.
fn proximity(w: &Wall, pts: &[V3]) -> Option<(f64, f64)> {
    let len = w.length();
    if len < 1e-6 { return None; }
    let u = [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len];
    let (mut cx, mut cy) = (0.0, 0.0);
    let (mut lo, mut hi) = (f64::MAX, f64::MIN);
    for p in pts {
        cx += p[0]; cy += p[1];
        let n = -(p[0] - w.start[0]) * u[1] + (p[1] - w.start[1]) * u[0];
        lo = lo.min(n); hi = hi.max(n);
    }
    cx /= pts.len() as f64; cy /= pts.len() as f64;
    let dx = cx - w.start[0];
    let dy = cy - w.start[1];
    let along = dx * u[0] + dy * u[1];
    let perp = (-dx * u[1] + dy * u[0]).abs();
    let half = w.thickness.unwrap_or(0.3) / 2.0;
    let gap = (lo - half).max(-half - hi).max(0.0);
    (gap <= 0.15 && along > -0.05 && along < len + 0.05).then_some((gap, perp))
}

fn place_opening(cx: &Ctx, w: &Wall, id: u32, kind: OpeningKind, pts: &[V3], hosted_by: &'static str, _st: Option<Option<usize>>) -> Option<Opening> {
    let len = w.length();
    if len < 1e-6 { return None; }
    let u = [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len];
    let mut lo = f64::MAX;
    let mut hi = f64::MIN;
    let mut zlo = f64::MAX;
    let mut zhi = f64::MIN;
    for p in pts {
        let a = (p[0] - w.start[0]) * u[0] + (p[1] - w.start[1]) * u[1];
        lo = lo.min(a); hi = hi.max(a);
        zlo = zlo.min(p[2]); zhi = zhi.max(p[2]);
    }
    let from = lo.max(0.0);
    let to = hi.min(len);
    if to - from < 0.01 { return None; }
    let a = cx.m.args(id).unwrap_or_default();
    let dims = |k: usize| a.get(k).and_then(Value::as_f64).filter(|v| *v > 0.0).map(|v| v * cx.len);
    let (uh, uw) = if kind == OpeningKind::Void { (None, None) } else { (dims(8), dims(9)) };
    Some(Opening {
        id,
        guid: a.first().and_then(Value::as_str).unwrap_or_default(),
        name: a.get(2).and_then(Value::as_str).unwrap_or_default(),
        kind,
        from,
        to,
        sill: zlo - w.base,
        height: zhi - zlo,
        unit_width: uw,
        unit_height: uh,
        hosted_by,
    })
}

fn joins(m: &Model, walls: &mut [Wall], idx: &HashMap<u32, usize>, st: &mut Stats) -> Vec<(usize, usize)> {
    let mut straight = Vec::new();
    // L joins first, then tees, so a tee lands on an already-resolved line
    let mut ls = Vec::new();
    let mut ts = Vec::new();
    for r in m.of_type("IFCRELCONNECTSPATHELEMENTS") {
        let a = m.args(r).unwrap_or_default();
        let (Some(&i), Some(&j)) = (a.get(5).and_then(Value::as_ref).and_then(|x| idx.get(&x)), a.get(6).and_then(Value::as_ref).and_then(|x| idx.get(&x))) else { continue };
        if i == j { continue; }
        // attribute 9 is RelatedConnectionType, 10 RelatingConnectionType
        let ej = a.get(9).and_then(Value::as_enum).unwrap_or("NOTDEFINED");
        let ei = a.get(10).and_then(Value::as_enum).unwrap_or("NOTDEFINED");
        let end = |e: &str| match e { "ATSTART" => Some(false), "ATEND" => Some(true), _ => None };
        match (end(ei), end(ej), ei == "ATPATH", ej == "ATPATH") {
            (Some(x), Some(y), _, _) => ls.push((i, x, j, y)),
            (Some(x), None, _, true) => ts.push((i, x, j)),
            (None, Some(y), true, _) => ts.push((j, y, i)),
            _ => {}
        }
    }
    let lim = |w: &Wall| w.thickness.unwrap_or(0.3).max(0.05) + 0.05;
    let line = |w: &Wall| (w.start, [w.end[0] - w.start[0], w.end[1] - w.start[1]]);
    for (i, ei, j, ej) in ls {
        if walls[i].arc.is_some() || walls[j].arc.is_some() { st.joins_rejected += 1; continue; }
        let (p, u) = line(&walls[i]);
        let (q, v) = line(&walls[j]);
        let Some((t, _)) = geom::intersect2(p, u, q, v) else {
            let gap = dist(if ei { walls[i].end } else { walls[i].start }, if ej { walls[j].end } else { walls[j].start });
            // a straight wall split in two (ArchiCAD does this): already meeting
            if gap <= lim(&walls[i]).max(lim(&walls[j])) {
                let mid = { let a = if ei { walls[i].end } else { walls[i].start }; let b = if ej { walls[j].end } else { walls[j].start }; [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0] };
                set_end(&mut walls[i], ei, mid, "I");
                set_end(&mut walls[j], ej, mid, "I");
                st.joins_collinear += 1;
                straight.push((i, j));
            } else {
                debug(format_args!("L parallel #{} #{} gap {gap:.3}", walls[i].id, walls[j].id));
                st.joins_rejected += 1;
            }
            continue
        };
        let x = [p[0] + t * u[0], p[1] + t * u[1]];
        let mi = dist(if ei { walls[i].end } else { walls[i].start }, x);
        let mj = dist(if ej { walls[j].end } else { walls[j].start }, x);
        if mi > lim(&walls[i]).max(lim(&walls[j])) || mj > lim(&walls[i]).max(lim(&walls[j])) {
            debug(format_args!("L far #{} #{} moves {mi:.3} {mj:.3} thk {:?} {:?}", walls[i].id, walls[j].id, walls[i].thickness, walls[j].thickness));
            st.joins_rejected += 1; continue;
        }
        set_end(&mut walls[i], ei, x, "L");
        set_end(&mut walls[j], ej, x, "L");
        st.joins_applied += 1;
    }
    for (i, ei, j) in ts {
        if walls[i].arc.is_some() || walls[j].arc.is_some() { st.joins_rejected += 1; continue; }
        let (p, u) = line(&walls[i]);
        let (q, v) = line(&walls[j]);
        let Some((t, s)) = geom::intersect2(p, u, q, v) else { st.joins_rejected += 1; continue };
        let x = [p[0] + t * u[0], p[1] + t * u[1]];
        let lj = walls[j].length().max(1e-9);
        let along = s * lj;
        let m_end = dist(if ei { walls[i].end } else { walls[i].start }, x);
        let reach = lim(&walls[i]).max(lim(&walls[j]));
        if m_end > reach || along < -reach || along > lj + reach { st.joins_rejected += 1; continue; }
        set_end(&mut walls[i], ei, x, "T");
        st.joins_applied += 1;
    }
    straight
}

/// Pairs of collinear wall pieces (same storey and thickness) with a door or
/// window standing in the gap between them: the unit's body runs past one
/// piece's end and the other piece starts where the unit ends.
fn bridges(walls: &[Wall], units: &HashMap<u32, Vec<V3>>, container: &HashMap<u32, usize>) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    let mut ids: Vec<&u32> = units.keys().collect();
    ids.sort();
    for id in ids {
        let pts = &units[id];
        let st = container.get(id).copied();
        for (i, w) in walls.iter().enumerate() {
            if st.is_some() && w.storey.is_some() && w.storey != st { continue; }
            if proximity(w, pts).is_none() && !touches(w, pts) { continue; }
            let len = w.length();
            if len < 1e-6 { continue; }
            let u = [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len];
            let along = |p: [f64; 2]| (p[0] - w.start[0]) * u[0] + (p[1] - w.start[1]) * u[1];
            let off = |p: [f64; 2]| (-(p[0] - w.start[0]) * u[1] + (p[1] - w.start[1]) * u[0]).abs();
            let (mut lo, mut hi) = (f64::MAX, f64::MIN);
            for p in pts { let a = along([p[0], p[1]]); lo = lo.min(a); hi = hi.max(a); }
            if hi <= len + 0.02 && lo >= -0.02 { continue; }
            let mut best: Option<(f64, usize)> = None;
            for (j, v) in walls.iter().enumerate() {
                if j == i || v.storey != w.storey { continue; }
                let same_t = match (w.thickness, v.thickness) { (Some(a), Some(b)) => (a - b).abs() < 0.002, (None, None) => true, _ => false };
                if !same_t || off(v.start) > 0.03 || off(v.end) > 0.03 { continue; }
                let (a0, a1) = { let (x, y) = (along(v.start), along(v.end)); (x.min(y), x.max(y)) };
                if hi > len + 0.02 && a0 >= len - 0.02 && a0 <= hi + 0.05
                    && best.is_none_or(|(d, _)| a0 - len < d) { best = Some((a0 - len, j)); }
                if lo < -0.02 && a1 <= 0.02 && a1 >= lo - 0.05
                    && best.is_none_or(|(d, _)| -a1 < d) { best = Some((-a1, j)); }
            }
            if let Some((_, j)) = best { out.push((i.min(j), i.max(j))); }
        }
    }
    out.sort();
    out.dedup();
    out
}

/// A body whose plan centre lies on the wall's line just past one of its
/// ends (a door in the gap after the wall stops).
fn touches(w: &Wall, pts: &[V3]) -> bool {
    let len = w.length();
    if len < 1e-6 { return false; }
    let u = [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len];
    let half = w.thickness.unwrap_or(0.3) / 2.0;
    let (mut lo, mut hi, mut nlo, mut nhi) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for p in pts {
        let a = (p[0] - w.start[0]) * u[0] + (p[1] - w.start[1]) * u[1];
        let n = -(p[0] - w.start[0]) * u[1] + (p[1] - w.start[1]) * u[0];
        lo = lo.min(a); hi = hi.max(a); nlo = nlo.min(n); nhi = nhi.max(n);
    }
    let gap = (nlo - half).max(-half - nhi).max(0.0);
    gap <= 0.05 && hi > -0.02 && lo < len + 0.02
}

/// Merge chains of straight continuations (walls split in two on one line,
/// same thickness and storey) into one wall run, so an opening that spans a
/// split is placed once, on the whole run. Returns the walls and a map from
/// every original wall id to its run's index.
fn merge_straight(walls: Vec<Wall>, pairs: &[(usize, usize)], st: &mut Stats) -> (Vec<Wall>, HashMap<u32, usize>) {
    let n = walls.len();
    let mut parent: Vec<usize> = (0..n).collect();
    fn find(p: &mut [usize], mut x: usize) -> usize { while p[x] != x { p[x] = p[p[x]]; x = p[x]; } x }
    for &(i, j) in pairs {
        let same = walls[i].storey == walls[j].storey
            && match (walls[i].thickness, walls[j].thickness) { (Some(a), Some(b)) => (a - b).abs() < 0.002, (None, None) => true, _ => false };
        if !same { continue; }
        let (a, b) = (find(&mut parent, i), find(&mut parent, j));
        if a != b { parent[a.max(b)] = a.min(b); }
    }
    let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n { let r = find(&mut parent, i); groups.entry(r).or_default().push(i); }
    let mut keys: Vec<usize> = groups.keys().copied().collect();
    keys.sort();
    let mut out = Vec::with_capacity(keys.len());
    let mut index = HashMap::new();
    for k in keys {
        let g = &groups[&k];
        let first = &walls[g[0]];
        let mut w = first.clone();
        if g.len() > 1 {
            let len = first.length().max(1e-9);
            let u = [(first.end[0] - first.start[0]) / len, (first.end[1] - first.start[1]) / len];
            let o = first.start;
            let (mut lo, mut hi) = ((f64::MAX, [0.0; 2], ""), (f64::MIN, [0.0; 2], ""));
            for &m in g {
                for (p, how) in [(walls[m].start, walls[m].joined_start), (walls[m].end, walls[m].joined_end)] {
                    let a = (p[0] - o[0]) * u[0] + (p[1] - o[1]) * u[1];
                    if a < lo.0 { lo = (a, p, how); }
                    if a > hi.0 { hi = (a, p, how); }
                }
                w.base = w.base.min(walls[m].base);
                w.height = match (w.height, walls[m].height) { (Some(a), Some(b)) => Some(a.max(b)), (a, b) => a.or(b) };
            }
            w.start = [o[0] + u[0] * lo.0, o[1] + u[1] * lo.0];
            w.end = [o[0] + u[0] * hi.0, o[1] + u[1] * hi.0];
            w.joined_start = if lo.2 == "I" { "" } else { lo.2 };
            w.joined_end = if hi.2 == "I" { "" } else { hi.2 };
            w.parts = g.iter().flat_map(|&m| if walls[m].parts.is_empty() { vec![walls[m].id] } else { walls[m].parts.clone() }).collect();
            st.wall_runs_merged += 1;
        }
        for &m in g {
            index.insert(walls[m].id, out.len());
            for &p in &walls[m].parts { index.insert(p, out.len()); }
        }
        out.push(w);
    }
    (out, index)
}

fn debug(a: std::fmt::Arguments) {
    if std::env::var_os("IFC_ENGINE_DEBUG").is_some() { eprintln!("{a}"); }
}

fn set_end(w: &mut Wall, at_end: bool, x: [f64; 2], how: &'static str) {
    if at_end { w.end = x; w.joined_end = how } else { w.start = x; w.joined_start = how }
}

fn dist(a: [f64; 2], b: [f64; 2]) -> f64 { ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2)).sqrt() }

/// Project length unit (metres per file unit), where it came from, and the
/// plane angle unit (radians per file unit).
fn units(m: &Model) -> (f64, String, f64) {
    let mut list: Vec<u32> = Vec::new();
    for p in m.of_type("IFCPROJECT") {
        if let Some(ua) = m.args(p).and_then(|a| a.get(8).and_then(Value::as_ref)) {
            if let Some(a) = m.args(ua) { list.extend(a.first().and_then(Value::as_list).unwrap_or(&[]).iter().filter_map(Value::as_ref)); }
        }
    }
    if list.is_empty() {
        for ua in m.of_type("IFCUNITASSIGNMENT") {
            if let Some(a) = m.args(ua) { list.extend(a.first().and_then(Value::as_list).unwrap_or(&[]).iter().filter_map(Value::as_ref)); }
        }
    }
    let mut len = None;
    let mut angle = 1.0;
    for u in list {
        let Some(a) = m.args(u) else { continue };
        match (m.type_of(u), a.get(1).and_then(Value::as_enum)) {
            (Some(_), Some("LENGTHUNIT")) => if let Some(s) = unit_scale(m, u, 0) { len = Some((s, describe_unit(m, u))) },
            (Some(_), Some("PLANEANGLEUNIT")) => if let Some(s) = unit_scale(m, u, 0) { angle = s },
            _ => {}
        }
    }
    match len {
        Some((s, d)) => (s, d, angle),
        None => (1.0, "none in the file; read as metres".into(), angle),
    }
}

fn describe_unit(m: &Model, u: u32) -> String {
    let a = m.args(u).unwrap_or_default();
    match m.type_of(u) {
        Some("IFCSIUNIT") => format!("{}{}", a.get(2).and_then(Value::as_enum).unwrap_or(""), a.get(3).and_then(Value::as_enum).unwrap_or("")),
        _ => a.get(2).and_then(Value::as_str).unwrap_or_else(|| "conversion-based unit".into()),
    }
}

/// SI value of one of a unit (metres, radians).
fn unit_scale(m: &Model, u: u32, depth: usize) -> Option<f64> {
    if depth > 8 { return None; }
    let a = m.args(u)?;
    match m.type_of(u)? {
        "IFCSIUNIT" => {
            let p = match a.get(2).and_then(Value::as_enum) {
                Some("EXA") => 1e18, Some("PETA") => 1e15, Some("TERA") => 1e12, Some("GIGA") => 1e9, Some("MEGA") => 1e6,
                Some("KILO") => 1e3, Some("HECTO") => 1e2, Some("DECA") => 1e1, Some("DECI") => 1e-1, Some("CENTI") => 1e-2,
                Some("MILLI") => 1e-3, Some("MICRO") => 1e-6, Some("NANO") => 1e-9, Some("PICO") => 1e-12, _ => 1.0,
            };
            Some(p)
        }
        "IFCCONVERSIONBASEDUNIT" | "IFCCONVERSIONBASEDUNITWITHOFFSET" => {
            let name = a.get(2).and_then(Value::as_str).unwrap_or_default().to_uppercase();
            let mwu = a.get(3).and_then(Value::as_ref).and_then(|r| m.args(r));
            let from_factor = mwu.and_then(|f| {
                let v = f.first()?.as_f64()?;
                let s = unit_scale(m, f.get(1)?.as_ref()?, depth + 1)?;
                (v > 0.0).then_some(v * s)
            });
            from_factor.or(match name.as_str() {
                "FOOT" | "FEET" | "FT" => Some(0.3048),
                "INCH" | "IN" => Some(0.0254),
                "YARD" => Some(0.9144),
                "DEGREE" => Some(std::f64::consts::PI / 180.0),
                _ => None,
            })
        }
        _ => None,
    }
}

impl<'m, 'a> Ctx<'m, 'a> {
    fn pt(&self, r: Option<u32>) -> Option<V3> {
        let r = r?;
        if !self.m.is(r, "IFCCARTESIANPOINT") { return None; }
        let c = self.m.args(r)?.first()?.as_f64_list();
        if c.is_empty() { return None; }
        Some([c[0] * self.len, c.get(1).copied().unwrap_or(0.0) * self.len, c.get(2).copied().unwrap_or(0.0) * self.len])
    }
    fn dir(&self, r: Option<u32>) -> Option<V3> {
        let r = r?;
        if !self.m.is(r, "IFCDIRECTION") { return None; }
        let c = self.m.args(r)?.first()?.as_f64_list();
        if c.is_empty() { return None; }
        Some([c[0], c.get(1).copied().unwrap_or(0.0), c.get(2).copied().unwrap_or(0.0)])
    }

    /// IfcAxis2Placement2D/3D as a frame (lengths already in metres).
    fn axis2(&self, r: Option<u32>) -> Frame {
        let Some(r) = r else { return Frame::ID };
        let Some(a) = self.m.args(r) else { return Frame::ID };
        let o = self.pt(a.first().and_then(Value::as_ref)).unwrap_or([0.0; 3]);
        match self.m.type_of(r) {
            Some("IFCAXIS2PLACEMENT3D") => Frame::from_axes(o, self.dir(a.get(1).and_then(Value::as_ref)), self.dir(a.get(2).and_then(Value::as_ref))),
            Some("IFCAXIS2PLACEMENT2D") => Frame::from_axes(o, None, self.dir(a.get(1).and_then(Value::as_ref))),
            _ => Frame::ID,
        }
    }

    /// World frame of an IfcLocalPlacement chain (memoised; cycles stop at depth).
    fn placement(&mut self, r: Option<u32>, depth: usize) -> Frame {
        let Some(r) = r else { return Frame::ID };
        if let Some(f) = self.frames.get(&r) { return *f; }
        if depth > MAX_DEPTH || !self.m.is(r, "IFCLOCALPLACEMENT") { return Frame::ID; }
        let a = self.m.args(r).unwrap_or_default();
        let parent = self.placement(a.first().and_then(Value::as_ref), depth + 1);
        let f = self.axis2(a.get(1).and_then(Value::as_ref)).within(&parent);
        self.frames.insert(r, f);
        f
    }

    /// (RepresentationIdentifier, items) of a product's shape.
    fn representations(&self, pds: Option<u32>) -> Vec<(String, Vec<u32>)> {
        let Some(a) = pds.and_then(|p| self.m.args(p)) else { return vec![] };
        a.get(2).and_then(Value::as_list).unwrap_or(&[]).iter().filter_map(Value::as_ref).filter_map(|r| {
            let ra = self.m.args(r)?;
            let ident = ra.get(1).and_then(Value::as_str).unwrap_or_default();
            Some((ident, ra.get(3).and_then(Value::as_list).unwrap_or(&[]).iter().filter_map(Value::as_ref).collect()))
        }).collect()
    }

    /// World points of an element's Body (or any shape when no Body).
    fn element_points(&mut self, id: u32) -> Vec<V3> {
        let Some(a) = self.m.args(id) else { return vec![] };
        let f = self.placement(a.get(5).and_then(Value::as_ref), 0);
        let reps = self.representations(a.get(6).and_then(Value::as_ref));
        let mut out = Vec::new();
        for (ident, items) in &reps {
            if ident == "Body" { for &it in items { self.points(it, &f, &mut out, 0); } }
        }
        if out.is_empty() {
            for (ident, items) in &reps {
                if ident != "Axis" && ident != "FootPrint" { for &it in items { self.points(it, &f, &mut out, 0); } }
            }
        }
        out
    }

    /// Corner points of a profile, in its own 2D frame (metres).
    fn profile(&self, r: u32, out: &mut Vec<V3>, depth: usize) {
        if depth > MAX_DEPTH { return; }
        let Some(a) = self.m.args(r) else { return };
        let ty = self.m.type_of(r).unwrap_or("");
        let pos = || self.axis2(a.get(2).and_then(Value::as_ref));
        match ty {
            "IFCRECTANGLEPROFILEDEF" | "IFCRECTANGLEHOLLOWPROFILEDEF" | "IFCROUNDEDRECTANGLEPROFILEDEF" => {
                let (Some(x), Some(y)) = (a.get(3).and_then(Value::as_f64), a.get(4).and_then(Value::as_f64)) else { return };
                let (hx, hy) = (x * self.len / 2.0, y * self.len / 2.0);
                let f = pos();
                for (sx, sy) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] { out.push(f.apply([sx * hx, sy * hy, 0.0])); }
            }
            "IFCCIRCLEPROFILEDEF" | "IFCCIRCLEHOLLOWPROFILEDEF" => {
                let Some(rad) = a.get(3).and_then(Value::as_f64) else { return };
                let r = rad * self.len;
                let f = pos();
                for (sx, sy) in [(-1.0, -1.0), (1.0, -1.0), (1.0, 1.0), (-1.0, 1.0)] { out.push(f.apply([sx * r, sy * r, 0.0])); }
            }
            "IFCARBITRARYCLOSEDPROFILEDEF" | "IFCARBITRARYPROFILEDEFWITHVOIDS" => {
                if let Some(c) = a.get(2).and_then(Value::as_ref) { self.curve_points(c, out, depth + 1); }
            }
            "IFCDERIVEDPROFILEDEF" => {
                let mut tmp = Vec::new();
                if let Some(p) = a.get(2).and_then(Value::as_ref) { self.profile(p, &mut tmp, depth + 1); }
                // the 2D operator: origin and axis 1
                let op = a.get(3).and_then(Value::as_ref).and_then(|o| self.m.args(o)).unwrap_or_default();
                let x = self.dir(op.first().and_then(Value::as_ref));
                let o = self.pt(op.get(2).and_then(Value::as_ref)).unwrap_or([0.0; 3]);
                let f = Frame::from_axes(o, None, x);
                out.extend(tmp.into_iter().map(|p| f.apply(p)));
            }
            _ => {}
        }
    }

    /// Points along a curve (polyline vertices, indexed coordinates, composite segments).
    fn curve_points(&self, r: u32, out: &mut Vec<V3>, depth: usize) {
        if depth > MAX_DEPTH { return; }
        let Some(a) = self.m.args(r) else { return };
        match self.m.type_of(r).unwrap_or("") {
            "IFCPOLYLINE" => for p in a.first().and_then(Value::as_list).unwrap_or(&[]) { if let Some(q) = self.pt(p.as_ref()) { out.push(q) } },
            "IFCINDEXEDPOLYCURVE" => if let Some(pl) = a.first().and_then(Value::as_ref) { self.point_list(pl, out) },
            "IFCCOMPOSITECURVE" => for s in a.first().and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(seg) = s.as_ref().and_then(|s| self.m.args(s)) {
                    if let Some(c) = seg.get(2).and_then(Value::as_ref) { self.curve_points(c, out, depth + 1) }
                }
            },
            "IFCTRIMMEDCURVE" => if let Some((p, q, _, _)) = self.curve_ends(r, depth + 1) { out.push(p); out.push(q) },
            _ => {}
        }
    }

    fn point_list(&self, r: u32, out: &mut Vec<V3>) {
        let Some(a) = self.m.args(r) else { return };
        for c in a.first().and_then(Value::as_list).unwrap_or(&[]) {
            let v = c.as_f64_list();
            if v.len() >= 2 { out.push([v[0] * self.len, v[1] * self.len, v.get(2).copied().unwrap_or(0.0) * self.len]); }
        }
    }

    /// End points of an axis curve, its source, and (radius, arc length) for an arc.
    fn curve_ends(&self, r: u32, depth: usize) -> Option<(V3, V3, &'static str, Option<(f64, f64)>)> {
        if depth > MAX_DEPTH { return None; }
        let a = self.m.args(r)?;
        match self.m.type_of(r)? {
            "IFCPOLYLINE" => {
                let mut v = Vec::new();
                self.curve_points(r, &mut v, depth + 1);
                (v.len() >= 2).then(|| (v[0], v[v.len() - 1], "polyline", None))
            }
            "IFCINDEXEDPOLYCURVE" => {
                let mut v = Vec::new();
                self.curve_points(r, &mut v, depth + 1);
                (v.len() >= 2).then(|| (v[0], v[v.len() - 1], "indexed-polycurve", None))
            }
            "IFCTRIMMEDCURVE" => {
                let basis = a.first()?.as_ref()?;
                let sense = a.get(3).and_then(Value::as_enum) != Some("F");
                let trim = |k: usize| -> (Option<V3>, Option<f64>) {
                    let mut pt = None; let mut par = None;
                    for v in a.get(k).and_then(Value::as_list).unwrap_or(&[]) {
                        match v {
                            Value::Ref(p) => pt = self.pt(Some(*p)),
                            Value::Typed(_, x) => par = x.as_f64(),
                            _ => {}
                        }
                    }
                    (pt, par)
                };
                let (p1, t1) = trim(1);
                let (p2, t2) = trim(2);
                let ba = self.m.args(basis)?;
                match self.m.type_of(basis)? {
                    "IFCLINE" => {
                        let o = self.pt(ba.first()?.as_ref())?;
                        let vec = self.m.args(ba.get(1)?.as_ref()?)?;
                        let d = self.dir(vec.first()?.as_ref())?;
                        let mag = vec.get(1).and_then(Value::as_f64).unwrap_or(1.0) * self.len;
                        let d = geom::scale(geom::unit(d)?, mag);
                        let at = |t: f64| geom::add(o, geom::scale(d, t));
                        let p = t1.map(at).or(p1)?;
                        let q = t2.map(at).or(p2)?;
                        Some(if sense { (p, q, "trimmed-line", None) } else { (q, p, "trimmed-line", None) })
                    }
                    "IFCCIRCLE" => {
                        let f = self.axis2(ba.first()?.as_ref());
                        let rad = ba.get(1)?.as_f64()? * self.len;
                        let at = |t: f64| f.apply([rad * (t * self.angle).cos(), rad * (t * self.angle).sin(), 0.0]);
                        let p = t1.map(at).or(p1)?;
                        let q = t2.map(at).or(p2)?;
                        let ang = |v: V3| { let l = geom::sub(v, f.o); geom::dot(l, f.y).atan2(geom::dot(l, f.x)) };
                        let mut sweep = ang(q) - ang(p);
                        if sense { while sweep < 0.0 { sweep += std::f64::consts::TAU } } else { while sweep > 0.0 { sweep -= std::f64::consts::TAU } }
                        let arc = Some((rad, rad * sweep.abs()));
                        Some(if sense { (p, q, "trimmed-arc", arc) } else { (q, p, "trimmed-arc", arc) })
                    }
                    _ => None,
                }
            }
            "IFCCOMPOSITECURVE" => {
                let mut v = Vec::new();
                self.curve_points(r, &mut v, depth + 1);
                (v.len() >= 2).then(|| (v[0], v[v.len() - 1], "composite", None))
            }
            _ => None,
        }
    }

    /// Points of a geometric item, placed by `f`.
    fn points(&self, r: u32, f: &Frame, out: &mut Vec<V3>, depth: usize) {
        if depth > MAX_DEPTH { return; }
        let Some(a) = self.m.args(r) else { return };
        match self.m.type_of(r).unwrap_or("") {
            "IFCEXTRUDEDAREASOLID" | "IFCEXTRUDEDAREASOLIDTAPERED" => {
                let mut prof = Vec::new();
                if let Some(p) = a.first().and_then(Value::as_ref) { self.profile(p, &mut prof, depth + 1); }
                let pos = self.axis2(a.get(1).and_then(Value::as_ref)).within(f);
                let d = self.dir(a.get(2).and_then(Value::as_ref)).and_then(geom::unit).unwrap_or([0.0, 0.0, 1.0]);
                let depth_m = a.get(3).and_then(Value::as_f64).unwrap_or(0.0) * self.len;
                for p in prof {
                    out.push(pos.apply(p));
                    out.push(pos.apply(geom::add(p, geom::scale(d, depth_m))));
                }
            }
            "IFCBOOLEANCLIPPINGRESULT" | "IFCBOOLEANRESULT" => {
                // the first operand bounds the result of a difference or a clip
                if let Some(p) = a.get(1).and_then(Value::as_ref) { self.points(p, f, out, depth + 1); }
            }
            "IFCFACETEDBREP" | "IFCFACETEDBREPWITHVOIDS" | "IFCMANIFOLDSOLIDBREP" => {
                if let Some(s) = a.first().and_then(Value::as_ref) { self.points(s, f, out, depth + 1); }
            }
            "IFCCLOSEDSHELL" | "IFCOPENSHELL" => for x in a.first().and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(x) = x.as_ref() { self.points(x, f, out, depth + 1) }
            },
            "IFCSHELLBASEDSURFACEMODEL" | "IFCFACEBASEDSURFACEMODEL" => for x in a.first().and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(x) = x.as_ref() { self.points(x, f, out, depth + 1) }
            },
            "IFCCONNECTEDFACESET" => for x in a.first().and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(x) = x.as_ref() { self.points(x, f, out, depth + 1) }
            },
            "IFCFACE" | "IFCFACESURFACE" => for x in a.first().and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(x) = x.as_ref() { self.points(x, f, out, depth + 1) }
            },
            "IFCFACEOUTERBOUND" | "IFCFACEBOUND" => if let Some(x) = a.first().and_then(Value::as_ref) { self.points(x, f, out, depth + 1) },
            "IFCPOLYLOOP" => for p in a.first().and_then(Value::as_list).unwrap_or(&[]) {
                if let Some(q) = self.pt(p.as_ref()) { out.push(f.apply(q)) }
            },
            "IFCTRIANGULATEDFACESET" | "IFCPOLYGONALFACESET" => {
                let mut v = Vec::new();
                if let Some(pl) = a.first().and_then(Value::as_ref) { self.point_list(pl, &mut v); }
                out.extend(v.into_iter().map(|p| f.apply(p)));
            }
            "IFCBOUNDINGBOX" => {
                let c = self.pt(a.first().and_then(Value::as_ref)).unwrap_or([0.0; 3]);
                let d: Vec<f64> = (1..4).map(|k| a.get(k).and_then(Value::as_f64).unwrap_or(0.0) * self.len).collect();
                for k in 0..8 {
                    let p = [c[0] + if k & 1 > 0 { d[0] } else { 0.0 }, c[1] + if k & 2 > 0 { d[1] } else { 0.0 }, c[2] + if k & 4 > 0 { d[2] } else { 0.0 }];
                    out.push(f.apply(p));
                }
            }
            "IFCMAPPEDITEM" => {
                let Some(src) = a.first().and_then(Value::as_ref).and_then(|s| self.m.args(s)) else { return };
                let origin = self.axis2(src.first().and_then(Value::as_ref));
                let target = self.operator(a.get(1).and_then(Value::as_ref));
                let place = origin.within(&target.within(f));
                let rep = src.get(1).and_then(Value::as_ref).and_then(|r| self.m.args(r)).unwrap_or_default();
                for it in rep.get(3).and_then(Value::as_list).unwrap_or(&[]) {
                    if let Some(it) = it.as_ref() { self.points(it, &place, out, depth + 1); }
                }
            }
            "IFCPOLYLINE" | "IFCINDEXEDPOLYCURVE" | "IFCCOMPOSITECURVE" | "IFCTRIMMEDCURVE" => {
                let mut v = Vec::new();
                self.curve_points(r, &mut v, depth + 1);
                out.extend(v.into_iter().map(|p| f.apply(p)));
            }
            _ => {}
        }
    }

    /// IfcCartesianTransformationOperator3D (uniform scale is ignored: it is
    /// almost always 1 in building models).
    fn operator(&self, r: Option<u32>) -> Frame {
        let Some(a) = r.and_then(|r| self.m.args(r)) else { return Frame::ID };
        let x = self.dir(a.first().and_then(Value::as_ref));
        let o = self.pt(a.get(2).and_then(Value::as_ref)).unwrap_or([0.0; 3]);
        let z = self.dir(a.get(4).and_then(Value::as_ref));
        Frame::from_axes(o, z, x)
    }

    /// Layers of a material association, and the offset from the reference
    /// line to the layers' centre (wall-local +Y), when it is a layer set usage.
    fn layers(&self, mat: Option<u32>) -> (Vec<Layer>, Option<f64>) {
        let Some(mat) = mat else { return (vec![], None) };
        let Some(a) = self.m.args(mat) else { return (vec![], None) };
        let (set, usage) = match self.m.type_of(mat) {
            Some("IFCMATERIALLAYERSETUSAGE") => (a.first().and_then(Value::as_ref), Some(a)),
            Some("IFCMATERIALLAYERSET") => (Some(mat), None),
            _ => return (vec![], None),
        };
        let Some(sa) = set.and_then(|s| self.m.args(s)) else { return (vec![], None) };
        let layers: Vec<Layer> = sa.first().and_then(Value::as_list).unwrap_or(&[]).iter().filter_map(Value::as_ref).filter_map(|l| {
            let la = self.m.args(l)?;
            let t = la.get(1)?.as_f64()? * self.len;
            let material = la.first().and_then(Value::as_ref).and_then(|mm| self.m.args(mm)).and_then(|ma| ma.first().and_then(Value::as_str)).unwrap_or_default();
            (t >= 0.0).then_some(Layer { material, thickness: t })
        }).collect();
        let total: f64 = layers.iter().map(|l| l.thickness).sum();
        let off = usage.and_then(|u| {
            // only AXIS2 (across the wall) offsets the centre line
            if u.get(1).and_then(Value::as_enum) != Some("AXIS2") { return None; }
            let sign = if u.get(2).and_then(Value::as_enum) == Some("NEGATIVE") { -1.0 } else { 1.0 };
            let o = u.get(3).and_then(Value::as_f64).unwrap_or(0.0) * self.len;
            Some(o + sign * total / 2.0)
        });
        (layers, off)
    }
}
