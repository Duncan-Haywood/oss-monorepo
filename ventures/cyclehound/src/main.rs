use cyclehound::*;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

const HELP: &str = "\
cyclehound: find circular imports in JavaScript and TypeScript, fast.

USAGE:
    cyclehound [OPTIONS] [PATH]...       (default PATH: .)

By default it prints every circular dependency and exits 1 if there is one,
so it works as a CI gate as it is.

OPTIONS:
    --graph            print the whole import graph instead (madge --json shape:
                       {\"file\": [\"dep\", ...]})
    --orphans          list files nothing imports (madge --orphans)
    --unresolved       list relative imports and tsconfig aliases that point at
                       no file; exit 1 if any
    --unused-exports   list exports no file in the graph imports; exit 1 if any
                       (files nothing imports are entry points and skipped;
                       --entries reports theirs too)
    --deps             check package.json dependencies: declared but unused,
                       and imported but undeclared (depcheck's job); every
                       package.json under PATH is checked on its own; exit 1
                       if any
    --depcheck         with --deps: depcheck 1.4.7's rules only, without the
                       script, config-file and alias guesses
    --json             JSON output (cycles: components, cycles and edges with
                       line numbers; with --graph, the adjacency map)
    --ext a,b,c        extensions to read and to try on extensionless imports
                       [default: js,mjs,cjs,jsx,ts,mts,cts,tsx]
    --no-dynamic       ignore import(\"x\") when building edges
    --no-require       ignore require(\"x\")
    --no-type          ignore TypeScript `import type` / `export type`, which
                       are erased before the code runs
    --no-follow        do not follow imports out of the given paths
    --no-tsconfig      treat every bare specifier as a package (by default
                       `paths` and `baseUrl` in the nearest tsconfig.json or
                       jsconfig.json resolve aliases such as \"@/lib/x\")
    --ignore-dir NAME  skip directories with this name (repeatable;
                       node_modules, .git and target are always skipped)
    --no-gitignore     read files .gitignore would skip
    --base DIR         print paths relative to DIR [default: the first PATH]
    --warn             report cycles but exit 0
    -h, --help         this help
    -V, --version      print version";

#[derive(PartialEq)]
enum Mode {
    Cycles,
    Graph,
    Orphans,
    Unresolved,
    UnusedExports,
    Deps,
}

struct Args {
    roots: Vec<PathBuf>,
    opts: Options,
    mode: Mode,
    json: bool,
    ignore_dirs: Vec<String>,
    gitignore: bool,
    base: Option<PathBuf>,
    warn: bool,
    entries: bool,
    depcheck: bool,
}

fn parse_args() -> Result<Option<Args>, String> {
    let mut a = Args {
        roots: Vec::new(),
        opts: Options::default(),
        mode: Mode::Cycles,
        json: false,
        ignore_dirs: Vec::new(),
        gitignore: true,
        base: None,
        warn: false,
        entries: false,
        depcheck: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        let mut val = |name: &str| it.next().ok_or_else(|| format!("{name} needs a value"));
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{HELP}");
                return Ok(None);
            }
            "-V" | "--version" => {
                println!("cyclehound {}", env!("CARGO_PKG_VERSION"));
                return Ok(None);
            }
            "--graph" => a.mode = Mode::Graph,
            "--orphans" => a.mode = Mode::Orphans,
            "--unresolved" => a.mode = Mode::Unresolved,
            "--unused-exports" => a.mode = Mode::UnusedExports,
            "--entries" => a.entries = true,
            "--deps" => a.mode = Mode::Deps,
            "--depcheck" => a.depcheck = true,
            "--circular" => a.mode = Mode::Cycles,
            "--json" => a.json = true,
            "--ext" | "--extensions" => {
                a.opts.exts = val(&arg)?
                    .split(',')
                    .map(|s| s.trim().trim_start_matches('.').to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                if a.opts.exts.is_empty() {
                    return Err("--ext needs at least one extension".into());
                }
            }
            "--no-dynamic" => {
                a.opts.kinds.remove(&ImportKind::Dynamic);
            }
            "--no-type" => {
                a.opts.kinds.remove(&ImportKind::Type);
            }
            "--no-require" => {
                a.opts.kinds.remove(&ImportKind::Require);
            }
            "--no-follow" => a.opts.follow_outside = false,
            "--no-tsconfig" => a.opts.tsconfig = false,
            "--ignore-dir" => a.ignore_dirs.push(val(&arg)?),
            "--no-gitignore" => a.gitignore = false,
            "--base" => a.base = Some(PathBuf::from(val(&arg)?)),
            "--warn" => a.warn = true,
            s if s.starts_with('-') && s.len() > 1 => {
                return Err(format!("unknown option {s} (try --help)"))
            }
            _ => a.roots.push(PathBuf::from(arg)),
        }
    }
    if a.roots.is_empty() {
        a.roots.push(PathBuf::from("."));
    }
    Ok(Some(a))
}

fn walk(a: &Args) -> Result<Vec<PathBuf>, String> {
    let mut out = BTreeSet::new();
    let always = ["node_modules", ".git", "target"];
    for root in &a.roots {
        if root.is_file() {
            out.insert(normalize(root));
            continue;
        }
        if !root.is_dir() {
            return Err(format!("no such file or directory: {}", root.display()));
        }
        let ignore_dirs = a.ignore_dirs.clone();
        let w = ignore::WalkBuilder::new(root)
            .standard_filters(a.gitignore)
            .hidden(false)
            .filter_entry(move |e| {
                let name = e.file_name().to_string_lossy();
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    !always.contains(&name.as_ref())
                        && !ignore_dirs.iter().any(|d| d == name.as_ref())
                } else {
                    true
                }
            })
            .build();
        for entry in w.flatten() {
            if !entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                continue;
            }
            let p = entry.path();
            let ok = p
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| a.opts.exts.iter().any(|x| x == e))
                .unwrap_or(false);
            if ok {
                out.insert(normalize(p));
            }
        }
    }
    Ok(out.into_iter().collect())
}

/// Every file under the roots (any type), for --deps.
fn walk_all(a: &Args) -> Result<Vec<PathBuf>, String> {
    let mut out = BTreeSet::new();
    let always = ["node_modules", ".git", "target"];
    for root in &a.roots {
        if !root.is_dir() {
            return Err(format!("--deps needs a directory: {}", root.display()));
        }
        let ignore_dirs = a.ignore_dirs.clone();
        let w = ignore::WalkBuilder::new(root)
            .standard_filters(a.gitignore)
            .hidden(false)
            .filter_entry(move |e| {
                let name = e.file_name().to_string_lossy();
                if e.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    !always.contains(&name.as_ref())
                        && !ignore_dirs.iter().any(|d| d == name.as_ref())
                } else {
                    true
                }
            })
            .build();
        for entry in w.flatten() {
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                out.insert(normalize(entry.path()));
            }
        }
    }
    Ok(out.into_iter().collect())
}

/// Group files by the nearest folder above them that holds a package.json,
/// and check each package.
fn run_deps(a: &Args) -> ExitCode {
    let t0 = Instant::now();
    let files = match walk_all(a) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("cyclehound: {e}");
            return ExitCode::from(2);
        }
    };
    let manifests: BTreeSet<PathBuf> = files
        .iter()
        .filter(|f| f.file_name().map(|n| n == "package.json").unwrap_or(false))
        .cloned()
        .collect();
    let dirs: std::collections::HashMap<PathBuf, PathBuf> = manifests
        .iter()
        .map(|m| (m.parent().unwrap_or(Path::new("")).to_path_buf(), m.clone()))
        .collect();
    let mut groups: std::collections::BTreeMap<PathBuf, Vec<PathBuf>> =
        manifests.iter().map(|m| (m.clone(), Vec::new())).collect();
    for f in &files {
        let mut d = f.parent();
        while let Some(cur) = d {
            if let Some(m) = dirs.get(cur) {
                groups.get_mut(m).unwrap().push(f.clone());
                break;
            }
            d = cur.parent();
        }
    }
    let opts = DepOptions {
        depcheck: a.depcheck,
    };
    let reports: Vec<DepReport> = groups
        .iter()
        .map(|(m, fs)| check_package(&Disk, m, fs, &opts))
        .collect();
    let base = normalize(a.base.as_deref().unwrap_or(a.roots[0].as_path()));
    let rel = |p: &Path| relative(p, &base);
    let at = |u: &Use| {
        if u.line == 0 {
            rel(&u.file)
        } else {
            format!("{}:{}", rel(&u.file), u.line)
        }
    };
    let mut findings = 0;
    for r in &reports {
        findings += r.unused.len() + r.unused_dev.len() + r.missing.len() + r.invalid as usize;
    }
    if a.json {
        let list = |v: &[String]| v.iter().map(|x| json_str(x)).collect::<Vec<_>>().join(", ");
        let mut parts = Vec::new();
        for r in &reports {
            let miss: Vec<String> = r
                .missing
                .iter()
                .map(|(n, us)| {
                    let w: Vec<String> = us.iter().map(|u| json_str(&at(u))).collect();
                    format!("{}: [{}]", json_str(n), w.join(", "))
                })
                .collect();
            let using: Vec<String> = r
                .using
                .iter()
                .map(|(n, us)| {
                    let w: Vec<String> = us.iter().map(|u| json_str(&at(u))).collect();
                    format!("{}: [{}]", json_str(n), w.join(", "))
                })
                .collect();
            parts.push(format!(
                "{{\"package\": {}, \"name\": {}, \"files\": {}, \"invalid\": {}, \"dependencies\": [{}], \"devDependencies\": [{}], \"missing\": {{{}}}, \"using\": {{{}}}}}",
                json_str(&rel(&r.manifest)),
                r.name.as_deref().map(json_str).unwrap_or_else(|| "null".into()),
                r.files,
                r.invalid,
                list(&r.unused),
                list(&r.unused_dev),
                miss.join(", "),
                using.join(", ")
            ));
        }
        println!("[{}]", parts.join(",\n "));
    } else {
        for r in &reports {
            if r.unused.is_empty() && r.unused_dev.is_empty() && r.missing.is_empty() && !r.invalid
            {
                continue;
            }
            println!("{}", rel(&r.manifest));
            if r.invalid {
                println!("  cannot parse package.json");
            }
            for d in &r.unused {
                println!("  unused dependency: {d}");
            }
            for d in &r.unused_dev {
                println!("  unused devDependency: {d}");
            }
            for (n, us) in &r.missing {
                let w: Vec<String> = us.iter().take(3).map(&at).collect();
                let more = if us.len() > 3 {
                    format!(" and {} more", us.len() - 3)
                } else {
                    String::new()
                };
                println!("  missing: {n} ({}{more})", w.join(", "));
            }
        }
        eprintln!(
            "{} findings in {} packages ({} files, {:.2}s)",
            findings,
            reports.len(),
            files.len(),
            t0.elapsed().as_secs_f64()
        );
    }
    if findings == 0 || a.warn {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(1)
    }
}

fn main() -> ExitCode {
    let a = match parse_args() {
        Ok(Some(a)) => a,
        Ok(None) => return ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("cyclehound: {e}");
            return ExitCode::from(2);
        }
    };
    if a.mode == Mode::Deps {
        return run_deps(&a);
    }
    let t0 = Instant::now();
    let files = match walk(&a) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("cyclehound: {e}");
            return ExitCode::from(2);
        }
    };
    let started = files.len();
    let mut opts = a.opts.clone();
    if a.mode == Mode::UnusedExports {
        // A type-only or dynamic import takes names too, whatever the
        // cycle filters say.
        opts = Options {
            exts: opts.exts,
            follow_outside: opts.follow_outside,
            tsconfig: opts.tsconfig,
            ..Options::default()
        };
    }
    let g = build_graph(files, &opts);
    let base = normalize(a.base.as_deref().unwrap_or_else(|| {
        let r = &a.roots[0];
        if r.is_file() {
            r.parent().unwrap_or(Path::new("."))
        } else {
            r.as_path()
        }
    }));
    let rel = |i: usize| relative(&g.files[i], &base);
    let secs = t0.elapsed().as_secs_f64();
    for p in &g.unreadable {
        eprintln!("cyclehound: could not read {}", p.display());
    }

    match a.mode {
        Mode::Graph => {
            let m = adjacency(&g, &base);
            if a.json {
                let mut s = String::from("{\n");
                let n = m.len();
                for (k, (f, deps)) in m.iter().enumerate() {
                    let d: Vec<String> = deps.iter().map(|x| json_str(x)).collect();
                    s.push_str(&format!(
                        "  {}: [{}]{}\n",
                        json_str(f),
                        d.join(", "),
                        if k + 1 < n { "," } else { "" }
                    ));
                }
                s.push('}');
                println!("{s}");
            } else {
                for (f, deps) in &m {
                    println!("{f}");
                    for d in deps {
                        println!("  {d}");
                    }
                }
                eprintln!(
                    "{} files, {} edges, {:.2}s",
                    g.files.len(),
                    g.edge_count(),
                    secs
                );
            }
            ExitCode::SUCCESS
        }
        Mode::Orphans => {
            let o = orphans(&g, started);
            if a.json {
                let v: Vec<String> = o.iter().map(|&i| json_str(&rel(i))).collect();
                println!("[{}]", v.join(", "));
            } else {
                for &i in &o {
                    println!("{}", rel(i));
                }
                eprintln!("{} orphans among {} files", o.len(), started);
            }
            ExitCode::SUCCESS
        }
        Mode::UnusedExports => {
            let u = unused_exports(&Disk, &g, started, &opts.exts, a.entries);
            if a.json {
                let v: Vec<String> = u
                    .iter()
                    .map(|x| {
                        format!(
                            "{{\"file\": {}, \"line\": {}, \"name\": {}}}",
                            json_str(&rel(x.file)),
                            x.line,
                            json_str(&x.name)
                        )
                    })
                    .collect();
                println!("[{}]", v.join(",\n "));
            } else {
                for x in &u {
                    println!("{}:{}: {}", rel(x.file), x.line, x.name);
                }
                let files: BTreeSet<usize> = u.iter().map(|x| x.file).collect();
                eprintln!(
                    "{} unused exports in {} files ({} files read, {:.2}s)",
                    u.len(),
                    files.len(),
                    g.files.len(),
                    t0.elapsed().as_secs_f64()
                );
            }
            if u.is_empty() || a.warn {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
        Mode::Unresolved => {
            let mut u: Vec<(String, u32, String)> = g
                .unresolved
                .iter()
                .map(|x| (rel(x.from), x.line, x.spec.clone()))
                .collect();
            u.sort();
            if a.json {
                let v: Vec<String> = u
                    .iter()
                    .map(|(f, l, s)| {
                        format!(
                            "{{\"file\": {}, \"line\": {}, \"spec\": {}}}",
                            json_str(f),
                            l,
                            json_str(s)
                        )
                    })
                    .collect();
                println!("[{}]", v.join(",\n "));
            } else {
                for (f, l, s) in &u {
                    println!("{f}:{l}: cannot resolve {s}");
                }
                eprintln!("{} unresolved imports in {} files", u.len(), g.files.len());
            }
            if u.is_empty() || a.warn {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
        Mode::Deps => unreachable!(),
        Mode::Cycles => {
            let comps = strongly_connected(&g);
            let cyc = cycles(&g, &comps);
            let on_cycle: usize = comps.iter().map(|c| c.len()).sum();
            if a.json {
                println!("{}", cycles_json(&g, &comps, &cyc, &base));
            } else if comps.is_empty() {
                eprintln!(
                    "No circular dependency found ({} files, {} edges, {:.2}s)",
                    g.files.len(),
                    g.edge_count(),
                    secs
                );
            } else {
                let mut k = 0;
                for (ci, comp) in comps.iter().enumerate() {
                    println!("Component {} ({} files):", ci + 1, comp.len());
                    for c in &cyc[ci] {
                        k += 1;
                        let mut names: Vec<String> = c.iter().map(|&i| rel(i)).collect();
                        names.push(rel(c[0]));
                        // Show the line of each import on the cycle.
                        let lines: Vec<String> = c
                            .iter()
                            .enumerate()
                            .map(|(j, &v)| {
                                let w = c[(j + 1) % c.len()];
                                let e = g.edges[v].iter().find(|e| e.to == w).unwrap();
                                let tag = if e.kind == ImportKind::Static {
                                    String::new()
                                } else {
                                    format!(" ({})", e.kind.as_str())
                                };
                                format!("{}:{}{}", rel(v), e.line, tag)
                            })
                            .collect();
                        println!("  {k}) {}", names.join(" > "));
                        println!("     via {}", lines.join(", "));
                    }
                }
                eprintln!(
                    "{} circular components, {} files on a cycle, {} cycles listed ({} files, {} edges, {:.2}s)",
                    comps.len(),
                    on_cycle,
                    k,
                    g.files.len(),
                    g.edge_count(),
                    secs
                );
            }
            if comps.is_empty() || a.warn {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(1)
            }
        }
    }
}
