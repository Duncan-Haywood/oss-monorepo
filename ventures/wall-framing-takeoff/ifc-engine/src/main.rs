use ifc_engine::{ifc, out, step};
use std::time::Instant;

const HELP: &str = "ifc-engine: read an IFC (STEP) building model into a wall plan

usage:
  ifc-engine plan  <file.ifc> [--storey N|name]   walls, joins, layers, openings as JSON (metres)
  ifc-engine dxf   <file.ifc> [--storey N|name]   the same plan as DXF lines (inches), for
                                                  `node cli.mjs plan.dxf` in wall-framing-takeoff
  ifc-engine stats <file.ifc>                     entity counts and timings

--storey takes the 1-based index in elevation order (see `plan` output) or a storey name.
";

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(cmd), Some(path)) = (args.first(), args.get(1)) else { eprint!("{HELP}"); std::process::exit(2) };
    if cmd == "-h" || cmd == "--help" { print!("{HELP}"); return; }
    let storey_arg = args.iter().position(|a| a == "--storey").and_then(|i| args.get(i + 1)).cloned()
        .or_else(|| args.iter().find_map(|a| a.strip_prefix("--storey=").map(String::from)));
    let t0 = Instant::now();
    let bytes = match std::fs::read(path) { Ok(b) => b, Err(e) => { eprintln!("{path}: {e}"); std::process::exit(1) } };
    let text = String::from_utf8_lossy(&bytes);
    let t1 = Instant::now();
    let m = match step::Model::parse(&text) { Ok(m) => m, Err(e) => { eprintln!("{path}: {e}"); std::process::exit(1) } };
    let t2 = Instant::now();
    let b = ifc::read(&m);
    let t3 = Instant::now();
    let storey = match storey_arg {
        None => None,
        Some(s) => {
            let k = s.parse::<usize>().ok().filter(|&k| k >= 1 && k <= b.storeys.len()).map(|k| k - 1)
                .or_else(|| b.storeys.iter().position(|st| st.name.eq_ignore_ascii_case(&s)));
            match k {
                Some(k) => Some(k),
                None => {
                    let list: Vec<String> = b.storeys.iter().enumerate().map(|(i, s)| format!("{} = {}", i + 1, s.name)).collect();
                    eprintln!("no storey {s:?}; the file has {}", list.join(", "));
                    std::process::exit(1)
                }
            }
        }
    };
    match cmd.as_str() {
        "plan" => println!("{}", out::json(&b, storey)),
        "dxf" => print!("{}", out::dxf(&b, storey)),
        "stats" => {
            let mut types: Vec<(&str, usize)> = ["IFCWALL", "IFCWALLSTANDARDCASE", "IFCDOOR", "IFCWINDOW", "IFCOPENINGELEMENT", "IFCRELVOIDSELEMENT", "IFCRELFILLSELEMENT", "IFCRELCONNECTSPATHELEMENTS", "IFCBUILDINGSTOREY"].iter().map(|t| (*t, m.count(t))).collect();
            types.retain(|t| t.1 > 0);
            println!("{{\"bytes\":{},\"entities\":{},\"skipped\":{},\"duplicates\":{},\"readMs\":{:.1},\"indexMs\":{:.1},\"modelMs\":{:.1},\"counts\":{{{}}}}}",
                bytes.len(), m.len(), m.skipped, m.duplicates,
                (t1 - t0).as_secs_f64() * 1e3, (t2 - t1).as_secs_f64() * 1e3, (t3 - t2).as_secs_f64() * 1e3,
                types.iter().map(|(t, n)| format!("\"{t}\":{n}")).collect::<Vec<_>>().join(","));
        }
        _ => { eprint!("{HELP}"); std::process::exit(2) }
    }
}
