//! Hand-written IFC fixtures, one behaviour each. Real-model agreement with
//! IfcOpenShell is in scripts/agree.py (README, "Verification").

use ifc_engine::ifc::OpeningKind;
use ifc_engine::read_str;

/// Header, units, project, one storey at `z` (file units), and the shared
/// direction/point entities #900.. that walls use.
fn file(unit: &str, z: f64, body: &str) -> String {
    let len_unit = match unit {
        "mm" => "#20=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);".to_string(),
        "ft" => "#19=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);#18=IFCMEASUREWITHUNIT(IFCLENGTHMEASURE(0.3048),#19);#17=IFCDIMENSIONALEXPONENTS(1,0,0,0,0,0,0);#20=IFCCONVERSIONBASEDUNIT(#17,.LENGTHUNIT.,'FOOT',#18);".to_string(),
        _ => "#20=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);".to_string(),
    };
    format!(
        "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('t','',(''),(''),'','','');\nFILE_SCHEMA(('IFC2X3'));\nENDSEC;\nDATA;\n\
{len_unit}\n#21=IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.);\n#22=IFCUNITASSIGNMENT((#20,#21));\n\
#10=IFCPROJECT('p',$,'P',$,$,$,$,$,#22);\n\
#900=IFCCARTESIANPOINT((0.,0.,0.));#901=IFCDIRECTION((0.,0.,1.));#902=IFCDIRECTION((1.,0.,0.));\n\
#903=IFCAXIS2PLACEMENT3D(#900,$,$);#904=IFCLOCALPLACEMENT($,#903);\n\
#905=IFCCARTESIANPOINT((0.,0.,{z}));#906=IFCAXIS2PLACEMENT3D(#905,$,$);#907=IFCLOCALPLACEMENT(#904,#906);\n\
#30=IFCBUILDINGSTOREY('s',$,'Level 1',$,$,#907,$,$,.ELEMENT.,{z});\n{body}\nENDSEC;\nEND-ISO-10303-21;\n"
    )
}

/// A straight wall with an Axis polyline from (x0,y0) to (x1,y1) in its own
/// frame placed at (ox,oy) rotated by RefDirection (dx,dy). Entities #id..#id+9.
fn wall(id: u32, o: (f64, f64), d: (f64, f64), a: (f64, f64), b: (f64, f64), height: f64, thick: f64) -> String {
    let len = ((b.0 - a.0).powi(2) + (b.1 - a.1).powi(2)).sqrt();
    let n = |k: u32| id + k;
    format!(
        "#{p}=IFCCARTESIANPOINT(({ox},{oy},0.));#{dr}=IFCDIRECTION(({dx},{dy},0.));#{ap}=IFCAXIS2PLACEMENT3D(#{p},#901,#{dr});#{lp}=IFCLOCALPLACEMENT(#907,#{ap});\n\
#{pa}=IFCCARTESIANPOINT(({ax},{ay}));#{pb}=IFCCARTESIANPOINT(({bx},{by}));#{pl}=IFCPOLYLINE((#{pa},#{pb}));#{sr}=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#{pl}));\n\
#{bp}=IFCCARTESIANPOINT(({cx},{cy}));#{b2}=IFCAXIS2PLACEMENT2D(#{bp},$);#{pr}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#{b2},{len},{thick});#{ex}=IFCEXTRUDEDAREASOLID(#{pr},#903,#901,{height});#{br}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#{ex}));\n\
#{pd}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{sr},#{br}));\n\
#{id}=IFCWALLSTANDARDCASE('w{id}',$,'Wall {id}',$,$,#{lp},#{pd},$);\n\
#{rc}=IFCRELCONTAINEDINSPATIALSTRUCTURE('c{id}',$,$,$,(#{id}),#30);\n",
        p = n(1), dr = n(2), ap = n(3), lp = n(4), pa = n(5), pb = n(6), pl = n(7), sr = n(8),
        bp = n(9) + 1000, b2 = n(9) + 1001, pr = n(9) + 1002, ex = n(9) + 1003, br = n(9) + 1004, pd = n(9) + 1005, rc = n(9) + 1006,
        ox = o.0, oy = o.1, dx = d.0, dy = d.1, ax = a.0, ay = a.1, bx = b.0, by = b.1,
        cx = (a.0 + b.0) / 2.0, cy = (a.1 + b.1) / 2.0,
    )
}

fn connect(id: u32, a: u32, b: u32, at_a: &str, at_b: &str) -> String {
    // RelatingElement a, RelatedElement b; attribute 9 = Related type, 10 = Relating type
    format!("#{id}=IFCRELCONNECTSPATHELEMENTS('j{id}',$,$,$,$,#{a},#{b},(),(),.{at_b}.,.{at_a}.);\n")
}

/// A box opening (width along local X, `t` deep along Y, height up Z) at
/// (x,y,z) in the host wall's frame (placement relative to the wall's).
fn opening(id: u32, wall_lp: u32, at: (f64, f64, f64), w: f64, t: f64, h: f64) -> String {
    format!(
        "#{p}=IFCCARTESIANPOINT(({x},{y},{z}));#{ap}=IFCAXIS2PLACEMENT3D(#{p},$,$);#{lp}=IFCLOCALPLACEMENT(#{wall_lp},#{ap});\n\
#{cp}=IFCCARTESIANPOINT(({hx},0.));#{c2}=IFCAXIS2PLACEMENT2D(#{cp},$);#{pr}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#{c2},{w},{t});#{ex}=IFCEXTRUDEDAREASOLID(#{pr},#903,#901,{h});\n\
#{br}=IFCSHAPEREPRESENTATION($,'Body','SweptSolid',(#{ex}));#{pd}=IFCPRODUCTDEFINITIONSHAPE($,$,(#{br}));\n\
#{id}=IFCOPENINGELEMENT('o{id}',$,'Opening',$,$,#{lp},#{pd},$);\n",
        p = id + 1, ap = id + 2, lp = id + 3, cp = id + 4, c2 = id + 5, pr = id + 6, ex = id + 7, br = id + 8, pd = id + 9,
        x = at.0, y = at.1, z = at.2, hx = w / 2.0,
    )
}

#[test]
fn revit_style_trimmed_axes_meet_at_l_corners() {
    // a 10 x 6 m rectangle of 0.3 m walls whose axes stop 0.15 m short of each
    // corner (and the top one overruns), as Revit writes them
    let mut b = String::new();
    b += &wall(100, (0.0, 0.0), (1.0, 0.0), (0.15, 0.0), (9.85, 0.0), 3.0, 0.3);
    b += &wall(200, (10.0, 0.0), (0.0, 1.0), (0.15, 0.0), (5.85, 0.0), 3.0, 0.3);
    b += &wall(300, (10.0, 6.0), (-1.0, 0.0), (-0.15, 0.0), (10.15, 0.0), 3.0, 0.3);
    b += &wall(400, (0.0, 6.0), (0.0, -1.0), (0.15, 0.0), (5.85, 0.0), 3.0, 0.3);
    b += &connect(500, 100, 200, "ATEND", "ATSTART");
    b += &connect(501, 200, 300, "ATEND", "ATSTART");
    b += &connect(502, 300, 400, "ATEND", "ATSTART");
    b += &connect(503, 400, 100, "ATEND", "ATSTART");
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    assert_eq!(m.walls.len(), 4);
    assert_eq!(m.stats.joins_applied, 4);
    let perim: f64 = m.walls.iter().map(|w| w.length()).sum();
    assert!((perim - 32.0).abs() < 1e-9, "perimeter {perim}");
    for w in &m.walls { assert_eq!((w.joined_start, w.joined_end), ("L", "L")); }
    let w = &m.walls[0];
    assert!((w.start[0]).abs() < 1e-9 && (w.end[0] - 10.0).abs() < 1e-9, "{:?} {:?}", w.start, w.end);
    assert_eq!(w.height, Some(3.0));
}

#[test]
fn tee_lands_on_the_through_wall_and_far_joins_are_refused() {
    let mut b = String::new();
    b += &wall(100, (0.0, 0.0), (1.0, 0.0), (0.0, 0.0), (8.0, 0.0), 2.7, 0.2);
    // stops 0.1 m short of wall 100's centre line
    b += &wall(200, (4.0, 3.0), (0.0, -1.0), (0.0, 0.0), (2.9, 0.0), 2.7, 0.1);
    // stops 2 m short: not a join this reader will make
    b += &wall(300, (6.0, 3.0), (0.0, -1.0), (0.0, 0.0), (1.0, 0.0), 2.7, 0.1);
    b += &connect(500, 200, 100, "ATEND", "ATPATH");
    b += &connect(501, 300, 100, "ATEND", "ATPATH");
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let t = m.walls.iter().find(|w| w.id == 200).unwrap();
    assert!((t.end[1]).abs() < 1e-9 && (t.length() - 3.0).abs() < 1e-9);
    assert_eq!(t.joined_end, "T");
    assert_eq!(m.stats.joins_rejected, 1);
    assert!((m.walls.iter().find(|w| w.id == 300).unwrap().length() - 1.0).abs() < 1e-9);
}

#[test]
fn millimetres_and_a_raised_storey() {
    let b = wall(100, (0.0, 0.0), (1.0, 0.0), (0.0, 0.0), (4000.0, 0.0), 2600.0, 140.0);
    let m = read_str(&file("mm", 3000.0, &b)).unwrap();
    assert_eq!(m.length_unit, 0.001);
    let w = &m.walls[0];
    assert!((w.length() - 4.0).abs() < 1e-9);
    assert!((w.base - 3.0).abs() < 1e-9 && (w.height.unwrap() - 2.6).abs() < 1e-9);
    assert!((m.storeys[0].elevation - 3.0).abs() < 1e-9);
}

#[test]
fn feet_through_a_conversion_based_unit() {
    let b = wall(100, (0.0, 0.0), (1.0, 0.0), (0.0, 0.0), (10.0, 0.0), 8.0, 0.5);
    let m = read_str(&file("ft", 0.0, &b)).unwrap();
    assert!((m.length_unit - 0.3048).abs() < 1e-12);
    assert!((m.walls[0].length() - 3.048).abs() < 1e-9);
}

#[test]
fn layer_set_usage_shifts_the_reference_line_to_the_centre() {
    // reference line on the exterior face; layers run +Y from offset 0
    let mut b = wall(100, (0.0, 0.0), (1.0, 0.0), (0.0, 0.0), (5.0, 0.0), 2.7, 0.24);
    b += "#600=IFCMATERIAL('Brick');#601=IFCMATERIAL('Wood Stud');#602=IFCMATERIAL('Gypsum');\n\
#603=IFCMATERIALLAYER(#600,0.1,$);#604=IFCMATERIALLAYER(#601,0.0889,$);#605=IFCMATERIALLAYER(#602,0.0127,$);\n\
#606=IFCMATERIALLAYERSET((#603,#604,#605),'Ext');#607=IFCMATERIALLAYERSETUSAGE(#606,.AXIS2.,.POSITIVE.,0.);\n\
#608=IFCRELASSOCIATESMATERIAL('m',$,$,$,(#100),#607);\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let w = &m.walls[0];
    let t = 0.1 + 0.0889 + 0.0127;
    assert!((w.thickness.unwrap() - t).abs() < 1e-12);
    assert!((w.start[1] - t / 2.0).abs() < 1e-12, "{:?}", w.start);
    assert_eq!(w.layers.iter().map(|l| l.material.as_str()).collect::<Vec<_>>(), ["Brick", "Wood Stud", "Gypsum"]);
}

#[test]
fn openings_by_relationship_are_placed_by_their_own_geometry() {
    let mut b = wall(100, (2.0, 1.0), (0.0, 1.0), (0.0, 0.0), (6.0, 0.0), 2.7, 0.2);
    // rough opening 0.95 wide from 1.5 m along, sill 0.9, 1.2 high; the
    // window's own placement origin is somewhere unhelpful
    b += &opening(700, 104, (1.5, 0.0, 0.9), 0.95, 0.4, 1.2);
    b += "#720=IFCCARTESIANPOINT((9.,9.,9.));#721=IFCAXIS2PLACEMENT3D(#720,$,$);#722=IFCLOCALPLACEMENT(#907,#721);\n\
#730=IFCWINDOW('win',$,'W1',$,$,#722,$,$,1.2,0.9);\n\
#740=IFCRELVOIDSELEMENT('v',$,$,$,#100,#700);#741=IFCRELFILLSELEMENT('f',$,$,$,#700,#730);\n";
    // and a bare opening (a cased passage): framed like a door
    b += &opening(800, 104, (4.0, 0.0, 0.0), 0.9, 0.4, 2.1);
    b += "#840=IFCRELVOIDSELEMENT('v2',$,$,$,#100,#800);\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let o = &m.walls[0].openings;
    assert_eq!(o.len(), 2);
    assert_eq!(o[0].kind, OpeningKind::Window);
    assert_eq!(o[0].id, 730);
    assert!((o[0].from - 1.5).abs() < 1e-9 && (o[0].to - 2.45).abs() < 1e-9, "{:?}", o[0]);
    assert!((o[0].sill - 0.9).abs() < 1e-9 && (o[0].height - 1.2).abs() < 1e-9);
    assert_eq!((o[0].unit_width, o[0].unit_height), (Some(0.9), Some(1.2)));
    assert_eq!(o[1].kind, OpeningKind::Void);
    assert_eq!(m.stats.openings_by_fill, 1);
    assert_eq!(m.stats.openings_void, 1);
}

#[test]
fn a_door_in_the_gap_between_two_wall_pieces_bridges_them() {
    let mut b = String::new();
    b += &wall(100, (0.0, 0.0), (1.0, 0.0), (0.0, 0.0), (3.0, 0.0), 2.7, 0.1);
    b += &wall(200, (3.9, 0.0), (1.0, 0.0), (0.0, 0.0), (2.0, 0.0), 2.7, 0.1);
    // a door body 0.9 wide in the gap, no relationships at all
    b += "#700=IFCCARTESIANPOINT((3.,-0.05,0.));#701=IFCAXIS2PLACEMENT3D(#700,$,$);#702=IFCLOCALPLACEMENT(#907,#701);\n\
#703=IFCBOUNDINGBOX(#900,0.9,0.1,2.1);#704=IFCSHAPEREPRESENTATION($,'Body','BoundingBox',(#703));#705=IFCPRODUCTDEFINITIONSHAPE($,$,(#704));\n\
#706=IFCDOOR('d',$,'D1',$,$,#702,#705,$,2.1,0.9);#707=IFCRELCONTAINEDINSPATIALSTRUCTURE('c',$,$,$,(#706),#30);\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    assert_eq!(m.walls.len(), 1, "{:#?}", m.walls);
    let w = &m.walls[0];
    assert!((w.length() - 5.9).abs() < 1e-9);
    assert_eq!(w.parts, vec![100, 200]);
    assert_eq!(w.openings.len(), 1);
    assert!((w.openings[0].from - 3.0).abs() < 1e-9 && (w.openings[0].to - 3.9).abs() < 1e-9);
    assert_eq!(w.openings[0].hosted_by, "proximity");
}

#[test]
fn trimmed_line_and_arc_axes() {
    let mut b = String::new();
    // IfcTrimmedCurve on an IfcLine trimmed by parameter (magnitude 2)
    b += "#100=IFCWALLSTANDARDCASE('a',$,'A',$,$,#904,#105,$);#101=IFCCARTESIANPOINT((1.,1.));#102=IFCDIRECTION((0.,1.));#103=IFCVECTOR(#102,2.);#104=IFCLINE(#101,#103);\n\
#106=IFCTRIMMEDCURVE(#104,(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(2.5)),.T.,.PARAMETER.);#107=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#106));#105=IFCPRODUCTDEFINITIONSHAPE($,$,(#107));\n";
    // a quarter circle of radius 4 about (10,0), from 0 to pi/2
    b += "#200=IFCWALLSTANDARDCASE('b',$,'B',$,$,#904,#205,$);#201=IFCCARTESIANPOINT((10.,0.));#202=IFCAXIS2PLACEMENT2D(#201,$);#203=IFCCIRCLE(#202,4.);\n\
#206=IFCTRIMMEDCURVE(#203,(IFCPARAMETERVALUE(0.)),(IFCPARAMETERVALUE(1.5707963267948966)),.T.,.PARAMETER.);#207=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#206));#205=IFCPRODUCTDEFINITIONSHAPE($,$,(#207));\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let a = m.walls.iter().find(|w| w.id == 100).unwrap();
    assert!((a.start[1] - 1.0).abs() < 1e-12 && (a.end[1] - 6.0).abs() < 1e-12, "{:?}", a.end);
    let c = m.walls.iter().find(|w| w.id == 200).unwrap();
    let (r, l) = c.arc.unwrap();
    assert!((r - 4.0).abs() < 1e-12 && (l - 2.0 * std::f64::consts::PI).abs() < 1e-9);
    assert!((c.end[0] - 10.0).abs() < 1e-9 && (c.end[1] - 4.0).abs() < 1e-9);
}

#[test]
fn hostile_input_never_panics() {
    // a placement cycle, refs to nothing, wrong types where points belong
    let b = "#100=IFCWALLSTANDARDCASE('a',$,'A',$,$,#101,#103,$);#101=IFCLOCALPLACEMENT(#102,#903);#102=IFCLOCALPLACEMENT(#101,#903);\n\
#103=IFCPRODUCTDEFINITIONSHAPE($,$,(#104,#999));#104=IFCSHAPEREPRESENTATION($,'Axis','Curve2D',(#105));#105=IFCPOLYLINE((#902,#10,'x',(1,2)));\n\
#110=IFCRELCONNECTSPATHELEMENTS('j',$,$,$,$,#100,#100,(),(),.ATSTART.,.ATEND.);#111=IFCRELVOIDSELEMENT('v',$,$,$,#100,#100);\n";
    let m = read_str(&file("m", 0.0, b)).unwrap();
    assert_eq!(m.walls.len(), 0);
    assert_eq!(m.stats.walls_without_geometry, 1);
    // byte noise after the header
    let mut s = file("m", 0.0, "");
    let mut x: u64 = 0x9e3779b97f4a7c15;
    let noise: String = (0..20000).map(|_| { x ^= x << 13; x ^= x >> 7; x ^= x << 17; { let a = b"#=(),'.$*;ABC123 \n/\""; a[(x % a.len() as u64) as usize] as char } }).collect();
    s.insert_str(s.find("ENDSEC;\nEND").unwrap(), &noise);
    let _ = read_str(&s).unwrap();
}

#[test]
fn wood_only_filter_keeps_wood_and_unknown_and_drops_concrete() {
    use ifc_engine::ifc::Layer;
    let b = wall(100, (0.0, 0.0), (1.0, 0.0), (0.0, 0.0), (4.0, 0.0), 2.7, 0.1);
    let mut m = read_str(&file("m", 0.0, &b)).unwrap();
    let mut w = m.walls.remove(0);
    let l = |s: &str| Layer { material: s.to_string(), thickness: 0.05 };
    assert!(w.maybe_wood_framed(), "no layer data: unknown is kept");
    // names as Revit writes them in the Schultz Residence model
    w.layers = vec![l("Gypsum Wall Board"), l("Wood - Stud Layer")];
    assert!(w.maybe_wood_framed());
    w.layers = vec![l("Concrete - Cast-in-Place Concrete")];
    assert!(!w.maybe_wood_framed());
    w.layers = vec![l("Concrete Masonry Units"), l("Gypsum Wall Board")];
    assert!(!w.maybe_wood_framed());
    w.layers = vec![l("Gypsum Wall Board"), l("Paint")];
    assert!(w.maybe_wood_framed(), "a finish-only wall is not called masonry");
}

#[test]
fn voids_behind_fills_and_small_penetrations_are_not_framed_openings() {
    // Schultz Residence "Window Wall" pattern: an unfilled cut 2.0 m wide behind two windows,
    // plus a 0.2 m pipe hole and a real cased passage with no fill.
    let mut b = wall(100, (2.0, 1.0), (0.0, 1.0), (0.0, 0.0), (8.0, 0.0), 2.7, 0.2);
    b += &opening(700, 104, (0.0, 0.0, 0.05), 2.0, 0.4, 0.95); // the stray cut, covered by the windows
    b += &opening(710, 104, (0.1, 0.0, 1.0), 0.9, 0.4, 1.2);
    b += &opening(720, 104, (1.1, 0.0, 1.0), 0.9, 0.4, 1.2);
    b += "#730=IFCWINDOW('w1',$,'W1',$,$,#907,$,$,1.2,0.9);#731=IFCWINDOW('w2',$,'W2',$,$,#907,$,$,1.2,0.9);\n\
#740=IFCRELVOIDSELEMENT('v',$,$,$,#100,#700);\n\
#741=IFCRELVOIDSELEMENT('v1',$,$,$,#100,#710);#742=IFCRELFILLSELEMENT('f1',$,$,$,#710,#730);\n\
#743=IFCRELVOIDSELEMENT('v2',$,$,$,#100,#720);#744=IFCRELFILLSELEMENT('f2',$,$,$,#720,#731);\n";
    b += &opening(800, 104, (3.0, 0.0, 0.5), 0.1, 0.4, 0.2); // pipe hole
    b += "#840=IFCRELVOIDSELEMENT('v3',$,$,$,#100,#800);\n";
    b += &opening(850, 104, (5.0, 0.0, 0.0), 0.9, 0.4, 2.1); // cased passage
    b += "#890=IFCRELVOIDSELEMENT('v4',$,$,$,#100,#850);\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let kinds: Vec<_> = m.walls[0].openings.iter().map(|o| (o.kind, o.id)).collect();
    assert_eq!(kinds, [(OpeningKind::Window, 730), (OpeningKind::Window, 731), (OpeningKind::Void, 850)], "{kinds:?}");
    assert_eq!(m.stats.voids_covered_by_fills, 1);
    assert_eq!(m.stats.voids_small_dropped, 1);
    assert!(m.warnings.iter().any(|w| w.contains("2 unfilled void(s) were dropped")), "{:?}", m.warnings);
}

#[test]
fn floating_low_voids_are_stair_cutouts_not_doors() {
    let mut b = wall(100, (2.0, 1.0), (0.0, 1.0), (0.0, 0.0), (6.0, 0.0), 2.7, 0.2);
    b += &opening(700, 104, (0.0, 0.0, 0.3), 0.8, 0.4, 0.5); // floating, 0.8 m top: a cutout
    b += "#740=IFCRELVOIDSELEMENT('v',$,$,$,#100,#700);\n";
    b += &opening(2000, 104, (3.0, 0.0, 0.0), 0.9, 0.4, 2.1); // cased passage to the floor: kept
    b += "#2040=IFCRELVOIDSELEMENT('v2',$,$,$,#100,#2000);\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let o = &m.walls[0].openings;
    assert_eq!(o.len(), 1, "{o:?}");
    assert!((o[0].from - 3.0).abs() < 1e-9);
    assert_eq!(m.stats.voids_floating_dropped, 1);
}

#[test]
fn void_at_a_free_wall_end_shortens_the_wall_and_slivers_drop() {
    let mut b = wall(100, (2.0, 1.0), (0.0, 1.0), (0.0, 0.0), (6.0, 0.0), 2.7, 0.2);
    b += &opening(700, 104, (0.0, 0.0, 0.0), 0.8, 0.4, 2.1); // 0 to 0.8 m at the free start: wall starts past it
    b += "#740=IFCRELVOIDSELEMENT('v',$,$,$,#100,#700);\n";
    b += &opening(2000, 104, (3.0, 0.0, 0.0), 0.04, 0.4, 2.1); // 4 cm sliver: not frameable
    b += "#2040=IFCRELVOIDSELEMENT('v2',$,$,$,#100,#2000);\n";
    let m = read_str(&file("m", 0.0, &b)).unwrap();
    let w = &m.walls[0];
    assert!(w.openings.is_empty(), "{:?}", w.openings);
    assert!((w.length() - 5.2).abs() < 1e-6, "{}", w.length());
    assert_eq!(m.stats.voids_end_trimmed, 1);
    assert_eq!(m.stats.voids_small_dropped, 1);
}

#[test]
fn frame_stub_is_a_short_wall_that_is_mostly_opening() {
    let mut b = wall(100, (2.0, 1.0), (0.0, 1.0), (0.0, 0.0), (8.0, 0.0), 2.7, 0.2);
    b += &opening(850, 104, (5.0, 0.0, 0.0), 0.9, 0.4, 2.1);
    b += "#890=IFCRELVOIDSELEMENT('v4',$,$,$,#100,#850);\n";
    let mut m = read_str(&file("m", 0.0, &b)).unwrap();
    let mut w = m.walls.remove(0);
    assert_eq!(w.openings.len(), 1);
    assert!(!w.is_frame_stub(), "8 m wall with a 0.9 m opening");
    w.end = [w.start[0] + 0.946, w.start[1]];
    w.openings[0].from = 0.165; w.openings[0].to = 0.946;
    assert!(w.is_frame_stub(), "37 in wall with a 31 in door");
    w.end = [w.start[0] + 3.0, w.start[1]];
    assert!(!w.is_frame_stub(), "3 m wall with the same opening");
}
