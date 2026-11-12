use dupehound::*;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::Instant;

const HELP: &str = "\
dupehound: find copy-pasted code, fast.

USAGE:
    dupehound [OPTIONS] [PATH]...        (default PATH: .)

OPTIONS:
    --min-tokens N     smallest clone in tokens            [default: 50]
    --min-lines N      smallest clone in lines             [default: 5]
    --max-size BYTES   skip larger files (k/m suffix ok)   [default: 100k]
    --max-lines N      skip files with more lines          [default: 1000]
    --ext a,b,c        file extensions to read             [default: common source types]
    --ignore-dir NAME  skip directories with this name (repeatable;
                       node_modules, .git and target are always skipped)
    --no-gitignore     read files .gitignore would skip
    --normalize        match renamed copies: identifiers, strings and numbers
                       hash by kind (keywords stay)
    --families         group clones into families (every place one block was
                       pasted), largest first, with the lines a shared module
                       could remove; with --json, adds a \"families\" array
    --json             print a JSON report instead of text
    --top N            clones (or families) to list         [default: 20]
    --threshold PCT    exit 1 if duplicated lines exceed PCT percent
    -h, --help         this help
    -V, --version      print version

Duplicated lines are a union: a line inside several copies counts once.
Only the later copy of each pair (by path order) counts as duplicated.";

struct Args {
    roots: Vec<PathBuf>,
    opts: Options,
    walk: WalkOptions,
    json: bool,
    families: bool,
    top: usize,
    threshold: Option<f64>,
}

fn parse_size(s: &str) -> Result<u64, String> {
    let s = s.trim().to_ascii_lowercase();
    let s = s.strip_suffix('b').unwrap_or(&s);
    let (num, mult) = match s.chars().last() {
        Some('k') => (&s[..s.len() - 1], 1024),
        Some('m') => (&s[..s.len() - 1], 1024 * 1024),
        _ => (s, 1),
    };
    num.parse::<u64>()
        .map(|n| n * mult)
        .map_err(|_| format!("bad size: {s}"))
}

fn parse_args() -> Result<Option<Args>, String> {
    let mut a = Args {
        roots: Vec::new(),
        opts: Options::default(),
        walk: WalkOptions::default(),
        json: false,
        families: false,
        top: 20,
        threshold: None,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        let mut val = |name: &str| it.next().ok_or_else(|| format!("{name} needs a value"));
        let num = |v: String, name: &str| {
            v.parse::<u64>()
                .map_err(|_| format!("{name}: not a number: {v}"))
        };
        match arg.as_str() {
            "-h" | "--help" => {
                println!("{HELP}");
                return Ok(None);
            }
            "-V" | "--version" => {
                println!("dupehound {}", env!("CARGO_PKG_VERSION"));
                return Ok(None);
            }
            "--min-tokens" => a.opts.min_tokens = num(val(&arg)?, &arg)?.max(1) as usize,
            "--min-lines" => a.opts.min_lines = num(val(&arg)?, &arg)? as u32,
            "--max-lines" => a.walk.max_lines = num(val(&arg)?, &arg)? as u32,
            "--max-size" => a.walk.max_size = parse_size(&val(&arg)?)?,
            "--ext" => {
                a.walk.extensions = val(&arg)?
                    .split(',')
                    .map(|s| s.trim().trim_start_matches('.').to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            }
            "--ignore-dir" => a.walk.ignore_dirs.push(val(&arg)?),
            "--no-gitignore" => a.walk.respect_gitignore = false,
            "--normalize" => {
                a.opts.normalize = true;
                a.walk.normalize = true
            }
            "--json" => a.json = true,
            "--families" => a.families = true,
            "--top" => a.top = num(val(&arg)?, &arg)? as usize,
            "--threshold" => {
                let v = val(&arg)?;
                a.threshold = Some(
                    v.parse()
                        .map_err(|_| format!("--threshold: not a number: {v}"))?,
                )
            }
            s if s.starts_with('-') && s.len() > 1 => {
                return Err(format!("unknown option {s} (see --help)"))
            }
            _ => a.roots.push(PathBuf::from(arg)),
        }
    }
    if a.roots.is_empty() {
        a.roots.push(PathBuf::from("."));
    }
    Ok(Some(a))
}

fn print_families(files: &[SourceFile], fams: &[Family], top: usize) {
    for f in fams.iter().take(top) {
        let n = f.occurrences.len();
        let whole = f.occurrences.iter().filter(|x| x.whole_file).count();
        // Show an exact copy when there are several: it is the block to extract.
        let first = f.occurrences[f.identical_first].span;
        let (a, b) = span_line_range(files, first);
        let lines = if f.shortest_lines == f.longest_lines {
            format!("{} lines", f.shortest_lines)
        } else {
            format!("{}-{} lines", f.shortest_lines, f.longest_lines)
        };
        let what = match &f.common_name {
            Some(name) => format!("every copy in a file named {name}"),
            None => "in differently named files".to_string(),
        };
        let whole = if whole > 0 {
            format!(", {whole} whole-file")
        } else {
            String::new()
        };
        let ident = if f.identical_copies > 1 {
            format!(
                "; {} identical ({} lines)",
                f.identical_copies, f.identical_lines
            )
        } else {
            String::new()
        };
        println!(
            "{:>7} to {:<7} removable  {n} copies of {lines}{whole}{ident}, {what}",
            f.removable_lines, f.removable_lines_max
        );
        println!(
            "                     first {}:{a}-{b}; shared home: {}/",
            files[first.file as usize].path,
            if f.common_dir.is_empty() {
                "."
            } else {
                &f.common_dir
            }
        );
    }
    if fams.len() > top {
        println!(
            "... and {} more families (--top N or --json for all)",
            fams.len() - top
        );
    }
    let lo: u64 = fams.iter().map(|f| f.removable_lines).sum();
    let hi: u64 = fams.iter().map(|f| f.removable_lines_max).sum();
    println!(
        "\n{} families; moving each family's block to one shared module would remove {lo} to {hi} lines (before import and call lines; families can overlap).",
        fams.len()
    );
}

fn main() -> ExitCode {
    let args = match parse_args() {
        Ok(Some(a)) => a,
        Ok(None) => return ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("dupehound: {e}");
            return ExitCode::from(2);
        }
    };
    let t0 = Instant::now();
    let files = load(&args.roots, &args.walk);
    let clones = detect(&files, args.opts);
    let st = stats(&files, &clones);
    let secs = t0.elapsed().as_secs_f64();

    if args.json && args.families {
        println!(
            "{}",
            json_report_with_families(&files, &clones, &st, args.opts, secs)
        );
    } else if args.json {
        println!("{}", json_report(&files, &clones, &st, args.opts, secs));
    } else if args.families {
        print_families(&files, &families(&files, &clones), args.top);
        println!(
            "\n{} files, {} lines: {} clones, {} duplicated lines ({:.2}%). {:.2}s",
            st.files,
            st.lines,
            st.clones,
            st.duplicated_lines,
            st.duplicated_percent(),
            t0.elapsed().as_secs_f64()
        );
    } else {
        let mut by_size: Vec<&Clone_> = clones.iter().collect();
        by_size.sort_by_key(|c| std::cmp::Reverse(c.tokens()));
        for c in by_size.iter().take(args.top) {
            let (a1, b1) = span_line_range(&files, c.first);
            let (a2, b2) = span_line_range(&files, c.second);
            println!(
                "{:>6} tokens  {}:{}-{}  ==  {}:{}-{}",
                c.tokens(),
                files[c.second.file as usize].path,
                a2,
                b2,
                files[c.first.file as usize].path,
                a1,
                b1
            );
        }
        if clones.len() > args.top {
            println!(
                "... and {} more (--top N or --json for all)",
                clones.len() - args.top
            );
        }
        println!(
            "\n{} files, {} lines, {} tokens: {} clones, {} duplicated lines ({:.2}%), {} duplicated tokens. {:.2}s",
            st.files, st.lines, st.tokens, st.clones, st.duplicated_lines, st.duplicated_percent(),
            st.duplicated_tokens, secs
        );
    }
    match args.threshold {
        Some(t) if st.duplicated_percent() > t => {
            eprintln!(
                "dupehound: duplicated lines {:.2}% exceed threshold {t}%",
                st.duplicated_percent()
            );
            ExitCode::from(1)
        }
        _ => ExitCode::SUCCESS,
    }
}
