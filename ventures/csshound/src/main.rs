//! csshound CLI. See README.md.
use csshound::{analyse_with, page, Options, Report};
use rayon::prelude::*;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

/// Print a line; stop quietly when stdout is closed (`csshound ... | head`).
macro_rules! out {
    ($($t:tt)*) => {{
        use std::io::Write;
        if writeln!(std::io::stdout(), $($t)*).is_err() {
            std::process::exit(0);
        }
    }};
}

const USAGE: &str = "csshound: find CSS rules a page never uses (PurgeCSS's rules, in Rust)

usage:
  csshound [options] <dir|page.html>...      judge each page's own CSS against the page
  csshound [options] --css F --content F...  judge stylesheets against content files

options:
  --json           one JSON line per page: {\"page\", \"rejected\", ...}
  --dead           list each rule that would go entirely, with its byte offset
  --top N          in the summary, show the N pages with the most removable bytes (default 10)
  --safelist NAME  never treat this class, id, tag or attribute as unused (repeatable)
  --purgecss       PurgeCSS's input and rules exactly: same as --no-imports --no-dynamic
  --no-dynamic     do not keep classes built at run time from a prefix (`cls-${x}`)
  --no-imports     read only the scripts a page loads, not the local modules they
                   import (the input PurgeCSS gets from tests/bench/purgecss_pages.mjs)
  --jobs N         threads (default: all cores)
  --fail           exit 1 when any rule is unused (a CI gate)
  -h, --help       this text
";

struct Opts {
    json: bool,
    dead: bool,
    top: usize,
    fail: bool,
    imports: bool,
    dynamic: bool,
    jobs: Option<usize>,
    safelist: HashSet<String>,
    css: Vec<PathBuf>,
    content: Vec<PathBuf>,
    paths: Vec<PathBuf>,
}

fn parse_args() -> Result<Opts, String> {
    let mut o = Opts {
        json: false,
        dead: false,
        top: 10,
        fail: false,
        imports: true,
        dynamic: true,
        jobs: None,
        safelist: HashSet::new(),
        css: vec![],
        content: vec![],
        paths: vec![],
    };
    let mut args = std::env::args().skip(1);
    while let Some(a) = args.next() {
        let mut value = |name: &str| args.next().ok_or(format!("{name} needs a value"));
        match a.as_str() {
            "-h" | "--help" => return Err(String::new()),
            "--json" => o.json = true,
            "--dead" => o.dead = true,
            "--fail" => o.fail = true,
            "--no-imports" => o.imports = false,
            "--no-dynamic" => o.dynamic = false,
            "--purgecss" => {
                o.imports = false;
                o.dynamic = false;
            }
            "--top" => o.top = value("--top")?.parse().map_err(|_| "--top needs a number")?,
            "--jobs" => o.jobs = Some(value("--jobs")?.parse().map_err(|_| "--jobs needs a number")?),
            "--safelist" => {
                o.safelist.insert(value("--safelist")?);
            }
            "--css" => o.css.push(value("--css")?.into()),
            "--content" => o.content.push(value("--content")?.into()),
            s if s.starts_with('-') => return Err(format!("unknown option {s}")),
            _ => o.paths.push(a.into()),
        }
    }
    if o.css.is_empty() && o.paths.is_empty() {
        return Err("give a directory, a page or --css".into());
    }
    Ok(o)
}

const SKIP: [&str; 3] = ["node_modules", ".git", "target"];

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = fs::read_dir(dir) else { return };
    for e in rd.flatten() {
        let name = e.file_name();
        let name = name.to_string_lossy();
        if SKIP.contains(&name.as_ref()) {
            continue;
        }
        let p = e.path();
        if p.is_dir() {
            walk(&p, out);
        } else if name.ends_with(".html") {
            out.push(p);
        }
    }
}

fn json_line(name: &str, r: &Report) -> String {
    csshound::report_json(name, r, false)
}

fn print_dead(name: &str, r: &Report) {
    for (off, sel) in &r.dead {
        let one_line: String = sel.split_whitespace().collect::<Vec<_>>().join(" ");
        out!("{name}:{off}: {one_line}");
    }
}

fn main() -> ExitCode {
    let o = match parse_args() {
        Ok(o) => o,
        Err(e) => {
            if e.is_empty() {
                print!("{USAGE}");
                return ExitCode::SUCCESS;
            }
            eprintln!("csshound: {e}\n\n{USAGE}");
            return ExitCode::from(2);
        }
    };
    let opts = Options { safelist: o.safelist.clone(), dynamic_prefixes: o.dynamic };
    if let Some(j) = o.jobs {
        rayon::ThreadPoolBuilder::new().num_threads(j.max(1)).build_global().ok();
    }

    // stylesheet mode
    if !o.css.is_empty() {
        let read = |ps: &[PathBuf]| -> Result<String, String> {
            let mut s = String::new();
            for p in ps {
                let b = fs::read(p).map_err(|e| format!("{}: {e}", p.display()))?;
                s.push_str(&String::from_utf8_lossy(&b));
                s.push('\n');
            }
            Ok(s)
        };
        let (css, content) = match (read(&o.css), read(&o.content)) {
            (Ok(a), Ok(b)) => (a, b),
            (Err(e), _) | (_, Err(e)) => {
                eprintln!("csshound: {e}");
                return ExitCode::from(2);
            }
        };
        let r = analyse_with(&css, &content, &opts);
        if o.json {
            out!("{}", json_line("<css>", &r));
        } else {
            if o.dead {
                print_dead("<css>", &r);
            }
            for s in &r.rejected {
                out!("{s}");
            }
            eprintln!(
                "{} of {} rules unused ({} of {} bytes); {} selectors rejected",
                r.dead_rules, r.rules, r.dead_bytes, r.css_bytes, r.rejected.len()
            );
        }
        return if o.fail && !r.rejected.is_empty() { ExitCode::from(1) } else { ExitCode::SUCCESS };
    }

    // page mode
    let mut pages: Vec<(PathBuf, PathBuf)> = Vec::new(); // (base, file)
    for p in &o.paths {
        if p.is_dir() {
            let mut v = Vec::new();
            walk(p, &mut v);
            pages.extend(v.into_iter().map(|f| (p.clone(), f)));
        } else if p.is_file() {
            pages.push((p.parent().map(Path::to_path_buf).unwrap_or_default(), p.clone()));
        } else {
            eprintln!("csshound: {}: not found", p.display());
            return ExitCode::from(2);
        }
    }
    let mut results: Vec<(String, Report)> = pages
        .par_iter()
        .filter_map(|(base, f)| {
            let pg = page::prepare_with(f, o.imports).ok()?;
            if pg.css.trim().is_empty() {
                return None;
            }
            let name = f.strip_prefix(base).unwrap_or(f).to_string_lossy().replace('\\', "/");
            Some((name, analyse_with(&pg.css, &pg.content, &opts)))
        })
        .collect();
    results.sort_by(|a, b| a.0.cmp(&b.0));

    let mut any = false;
    let (mut css, mut dead, mut rules, mut dead_rules, mut rejected) = (0usize, 0usize, 0usize, 0usize, 0usize);
    for (name, r) in &results {
        any |= !r.rejected.is_empty();
        css += r.css_bytes;
        dead += r.dead_bytes;
        rules += r.rules;
        dead_rules += r.dead_rules;
        rejected += r.rejected.len();
        if o.json {
            out!("{}", json_line(name, r));
        } else if o.dead {
            print_dead(name, r);
        }
    }
    if !o.json {
        let with = results.iter().filter(|(_, r)| r.dead_rules > 0).count();
        let pct = |a: usize, b: usize| if b == 0 { 0.0 } else { 100.0 * a as f64 / b as f64 };
        out!(
            "{} pages with CSS; {} have unused rules\n{} of {} rules unused ({:.1}%), {} of {} CSS bytes ({:.1}%); {} selectors rejected",
            results.len(), with, dead_rules, rules, pct(dead_rules, rules), dead, css, pct(dead, css), rejected
        );
        let mut worst: Vec<&(String, Report)> = results.iter().filter(|(_, r)| r.dead_bytes > 0).collect();
        worst.sort_by(|a, b| b.1.dead_bytes.cmp(&a.1.dead_bytes).then(a.0.cmp(&b.0)));
        for (name, r) in worst.into_iter().take(o.top) {
            out!("  {:>7} B  {:>3} rules  {name}", r.dead_bytes, r.dead_rules);
        }
    }
    if o.fail && any {
        ExitCode::from(1)
    } else {
        ExitCode::SUCCESS
    }
}
