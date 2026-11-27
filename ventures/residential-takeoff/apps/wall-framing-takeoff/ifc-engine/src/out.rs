//! JSON and DXF writers (no dependencies).
use crate::ifc::{Building, Wall};
use std::fmt::Write;

fn js(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => { let _ = write!(o, "\\u{:04x}", c as u32); }
            c => o.push(c),
        }
    }
    o.push('"');
    o
}
fn num(v: f64) -> String { if v.is_finite() { format!("{}", (v * 1e6).round() / 1e6) } else { "null".into() } }
fn opt(v: Option<f64>) -> String { v.map(num).unwrap_or_else(|| "null".into()) }

/// Walls on a storey (None: all).
pub fn walls_on(b: &Building, storey: Option<usize>) -> Vec<&Wall> {
    b.walls.iter().filter(|w| storey.is_none() || w.storey.is_none() || w.storey == storey).collect()
}

pub fn json(b: &Building, storey: Option<usize>) -> String {
    let mut s = String::new();
    let _ = write!(s, "{{\"schema\":{},\"lengthUnitMetres\":{},\"lengthUnit\":{},\"units\":\"metres\",", js(&b.schema), num(b.length_unit), js(&b.length_unit_source));
    s.push_str("\"storeys\":[");
    for (i, st) in b.storeys.iter().enumerate() {
        if i > 0 { s.push(','); }
        let _ = write!(s, "{{\"index\":{},\"id\":{},\"name\":{},\"elevation\":{}}}", i + 1, st.id, js(&st.name), num(st.elevation));
    }
    let _ = write!(s, "],\"storey\":{},\"walls\":[", storey.map(|k| (k + 1).to_string()).unwrap_or_else(|| "null".into()));
    for (i, w) in walls_on(b, storey).into_iter().enumerate() {
        if i > 0 { s.push(','); }
        let _ = write!(s, "{{\"id\":{},\"guid\":{},\"name\":{},\"storey\":{},\"start\":[{},{}],\"end\":[{},{}],\"length\":{},\"base\":{},\"height\":{},\"thickness\":{},\"axis\":{},\"joined\":{{\"start\":{},\"end\":{}}},",
            w.id, js(&w.guid), js(&w.name), w.storey.map(|k| (k + 1).to_string()).unwrap_or_else(|| "null".into()),
            num(w.start[0]), num(w.start[1]), num(w.end[0]), num(w.end[1]), num(w.length()), num(w.base), opt(w.height), opt(w.thickness),
            js(w.axis_source), js(w.joined_start), js(w.joined_end));
        match w.arc { Some((r, l)) => { let _ = write!(s, "\"arc\":{{\"radius\":{},\"length\":{}}},", num(r), num(l)); } None => s.push_str("\"arc\":null,") }
        let open: f64 = w.openings.iter().map(|o| o.to - o.from).sum();
        let _ = write!(s, "\"openFraction\":{},", num(if w.length() > 0.0 { (open / w.length()).min(1.0) } else { 0.0 }));
        let _ = write!(s, "\"parts\":[{}],", w.parts.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(","));
        s.push_str("\"layers\":[");
        for (k, l) in w.layers.iter().enumerate() {
            if k > 0 { s.push(','); }
            let _ = write!(s, "{{\"material\":{},\"thickness\":{}}}", js(&l.material), num(l.thickness));
        }
        s.push_str("],\"openings\":[");
        for (k, o) in w.openings.iter().enumerate() {
            if k > 0 { s.push(','); }
            let _ = write!(s, "{{\"id\":{},\"guid\":{},\"name\":{},\"kind\":\"{}\",\"from\":{},\"to\":{},\"width\":{},\"sill\":{},\"height\":{},\"unitWidth\":{},\"unitHeight\":{},\"hostedBy\":\"{}\"}}",
                o.id, js(&o.guid), js(&o.name), o.kind.as_str(), num(o.from), num(o.to), num(o.to - o.from), num(o.sill), num(o.height), opt(o.unit_width), opt(o.unit_height), o.hosted_by);
        }
        s.push_str("]}");
    }
    let st = &b.stats;
    let _ = write!(s, "],\"stats\":{{\"entities\":{},\"skippedRecords\":{},\"walls\":{},\"wallsWithoutGeometry\":{},\"joinsApplied\":{},\"joinsCollinear\":{},\"joinsRejected\":{},\"wallRunsMerged\":{},\"gapsBridged\":{},\"openingsByFill\":{},\"openingsVoid\":{},\"openingsByProximity\":{},\"doorsWindowsUnhosted\":{},\"openingsWithoutGeometry\":{},\"openingsInOtherHosts\":{}}},",
        st.entities, st.skipped_records, b.walls.len(), st.walls_without_geometry, st.joins_applied, st.joins_collinear, st.joins_rejected, st.wall_runs_merged, st.gaps_bridged, st.openings_by_fill, st.openings_void, st.openings_by_proximity, st.doors_windows_unhosted, st.openings_without_geometry, st.openings_in_other_hosts);
    s.push_str("\"warnings\":[");
    for (i, w) in b.warnings.iter().enumerate() { if i > 0 { s.push(','); } s.push_str(&js(w)); }
    s.push_str("]}");
    s
}

/// The plan as DXF LINE entities in inches, on the layers the
/// wall-framing-takeoff DXF reader looks for: A-WALL centre lines, and each
/// opening as a segment on its wall's line (A-DOOR, A-GLAZ-WINDOW; a bare
/// opening goes on A-DOOR, since it is framed with a header like a door).
pub fn dxf(b: &Building, storey: Option<usize>) -> String {
    let k = 1.0 / 0.0254;
    let mut d = String::new();
    let g = |d: &mut String, c: i32, v: &str| { let _ = write!(d, "{c}\n{v}\n"); };
    g(&mut d, 999, "ifc-engine: walls as centre lines, openings on them, inches");
    for (c, v) in [(0, "SECTION"), (2, "HEADER"), (9, "$INSUNITS")] { g(&mut d, c, v); }
    g(&mut d, 70, "1");
    for (c, v) in [(0, "ENDSEC"), (0, "SECTION"), (2, "ENTITIES")] { g(&mut d, c, v); }
    let line = |d: &mut String, layer: &str, a: [f64; 2], b2: [f64; 2]| {
        g(d, 0, "LINE"); g(d, 8, layer);
        g(d, 10, &num(a[0] * k)); g(d, 20, &num(a[1] * k)); g(d, 30, "0");
        g(d, 11, &num(b2[0] * k)); g(d, 21, &num(b2[1] * k)); g(d, 31, "0");
    };
    for w in walls_on(b, storey) {
        line(&mut d, "A-WALL", w.start, w.end);
        let len = w.length();
        if len <= 0.0 { continue; }
        let u = [(w.end[0] - w.start[0]) / len, (w.end[1] - w.start[1]) / len];
        for o in &w.openings {
            let p = [w.start[0] + u[0] * o.from, w.start[1] + u[1] * o.from];
            let q = [w.start[0] + u[0] * o.to, w.start[1] + u[1] * o.to];
            line(&mut d, if o.kind == crate::ifc::OpeningKind::Window { "A-GLAZ-WINDOW" } else { "A-DOOR" }, p, q);
        }
    }
    for (c, v) in [(0, "ENDSEC"), (0, "EOF")] { g(&mut d, c, v); }
    d
}
