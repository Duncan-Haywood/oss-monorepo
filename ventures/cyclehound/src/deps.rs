//! Dependency check: which packages a `package.json` declares that no file
//! uses, and which packages files import that it does not declare (the job
//! of `depcheck` and of knip's dependency checks), on the same lexer as the
//! cycle check.
//!
//! The rules follow depcheck 1.4.7 with its default options, read from its
//! source (`dist/check.js`, `dist/index.js`, `dist/special/*.js`):
//!
//! - A package is the folder holding a `package.json`. Its files are every
//!   file below it, except folders that hold their own `package.json` (a
//!   nested package is checked on its own).
//! - A file uses a package when it has `import ... from "x"`, `import "x"`,
//!   `export ... from "x"`, `import("x")`, `require("x")`,
//!   `require.resolve("x")`, `import x = require("x")` or
//!   `grunt.loadNpmTasks("x")` with a plain string. The package is the
//!   specifier's first segment, or first two for `@scope/name`
//!   (require-package-name's rule). Node's built-in modules are not packages.
//! - `#name` specifiers go through package.json `imports` first.
//! - In a TypeScript file, using `x` also uses `@types/x` when that is
//!   declared (`@types/node` for a built-in, `@types/scope__name` for
//!   `@scope/name`).
//! - `tsconfig*.json` uses `compilerOptions.types` and `extends`.
//! - `package.json` uses `react` when `dependencies.react` is 17 or later
//!   (the new JSX transform imports it implicitly).
//! - A script in `package.json` uses a dependency when it runs one of the
//!   binaries the installed package declares (`node_modules/<dep>/package.json`
//!   `bin`), and a used package's installed `peerDependencies` and
//!   `optionalDependencies` count as used when declared.
//! - Unused: in `dependencies` or `devDependencies` and used by no file.
//!   Missing: used, and in none of `dependencies`, `devDependencies`,
//!   `peerDependencies` or `optionalDependencies`.
//!
//! depcheck's other specials (eslint, babel, jest, webpack and twelve more
//! config readers) and its Vue, Svelte, Sass, CoffeeScript and GraphQL
//! parsers are not reproduced. Instead, unless [`DepOptions::depcheck`] is
//! set, three guesses close the gaps a fresh checkout shows most often:
//!
//! - a script that runs a command named after the package, or a known
//!   binary of a common package (`tsc` for `typescript`), uses it even when
//!   nothing is installed (depcheck only sees binaries of installed
//!   packages, so on a fresh clone it calls `tsx` and `typescript` unused);
//! - a string in a `*.config.*` or `*rc.*` file that is exactly a declared
//!   package name uses it (`plugins: { autoprefixer: {} }` in
//!   `postcss.config.mjs`);
//! - a specifier that a tsconfig `paths` alias maps to a file, or that has a
//!   scheme (`bun:test`, `virtual:x`, `https://...`), is not a package.

use super::{clause_from, resolve_with, tokenize, type_only, Configs, Files, Kind, Resolve};
use crate::tsconfig::{parse_jsonc, Json};
use rayon::prelude::*;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::path::{Path, PathBuf};

/// Node's built-in modules as is-core-module 2.18.0 reports them for Node
/// 22 (the names that are built in without the `node:` prefix).
const BUILTINS: &[&str] = &[
    "assert",
    "async_hooks",
    "buffer",
    "child_process",
    "cluster",
    "console",
    "constants",
    "crypto",
    "dgram",
    "diagnostics_channel",
    "dns",
    "domain",
    "events",
    "fs",
    "_http_agent",
    "_http_client",
    "_http_common",
    "_http_incoming",
    "_http_outgoing",
    "_http_server",
    "http",
    "http2",
    "https",
    "inspector",
    "module",
    "net",
    "os",
    "path",
    "perf_hooks",
    "process",
    "punycode",
    "querystring",
    "readline",
    "repl",
    "_stream_duplex",
    "_stream_transform",
    "_stream_wrap",
    "_stream_passthrough",
    "_stream_readable",
    "_stream_writable",
    "stream",
    "string_decoder",
    "sys",
    "timers",
    "_tls_common",
    "_tls_wrap",
    "tls",
    "trace_events",
    "tty",
    "url",
    "util",
    "v8",
    "vm",
    "wasi",
    "worker_threads",
    "zlib",
];
/// Built in only with the prefix (`node:test`, not `test`).
const PREFIX_ONLY: &[&str] = &["sea", "sqlite", "test"];

/// Binaries of common packages whose command is not the package's name,
/// for the no-install guess. Each is the package's own `bin` field.
const KNOWN_BINS: &[(&str, &[&str])] = &[
    ("typescript", &["tsc", "tsserver"]),
    ("@capacitor/cli", &["cap", "capacitor"]),
    ("@playwright/test", &["playwright"]),
    ("@biomejs/biome", &["biome"]),
    ("@angular/cli", &["ng"]),
    ("@vue/cli-service", &["vue-cli-service"]),
    ("@storybook/cli", &["sb", "storybook"]),
    ("@cloudflare/wrangler", &["wrangler"]),
    ("postcss-cli", &["postcss"]),
    ("npm-run-all", &["npm-run-all", "run-p", "run-s"]),
    ("npm-run-all2", &["npm-run-all", "run-p", "run-s"]),
    ("ts-node", &["ts-node", "ts-node-esm"]),
    ("vue-tsc", &["vue-tsc"]),
];

fn is_core(name: &str) -> bool {
    match name.strip_prefix("node:") {
        Some(rest) => BUILTINS.contains(&rest) || PREFIX_ONLY.contains(&rest),
        None => BUILTINS.contains(&name),
    }
}

/// require-package-name 2.0.1: `@scope/name/x` is `@scope/name`, `name/x`
/// is `name`; None for what names no package (`@/x`, `/abs`).
pub fn package_name(spec: &str) -> Option<String> {
    if let Some(rest) = spec.strip_prefix('@') {
        let mut it = rest.splitn(3, '/');
        let scope = it.next().filter(|s| !s.is_empty())?;
        // The pattern lets `@a//b` through as `@a/b`; nobody writes that.
        let name = it.next().filter(|s| !s.is_empty())?;
        Some(format!("@{scope}/{name}"))
    } else {
        let first = spec.split('/').next().unwrap_or("");
        (!first.is_empty()).then(|| first.to_string())
    }
}

/// DefinitelyTyped's name for a package.
pub fn types_name(dep: &str) -> String {
    if is_core(dep) {
        return "@types/node".into();
    }
    match dep.strip_prefix('@').and_then(|r| r.split_once('/')) {
        Some((scope, name)) => format!("@types/{scope}__{name}"),
        None => format!("@types/{dep}"),
    }
}

/// Options for [`check_package`].
#[derive(Debug, Clone, Default)]
pub struct DepOptions {
    /// depcheck's rules only: no script, config or alias guesses.
    pub depcheck: bool,
}

/// Where a package is used: a file and line (0 for a whole-file use such
/// as package.json or a tsconfig).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Use {
    pub file: PathBuf,
    pub line: u32,
}

/// One package's findings.
#[derive(Debug, Clone, Default)]
pub struct DepReport {
    /// The package.json.
    pub manifest: PathBuf,
    pub name: Option<String>,
    pub unused: Vec<String>,
    pub unused_dev: Vec<String>,
    /// Used but undeclared, with every place it is used.
    pub missing: BTreeMap<String, Vec<Use>>,
    /// Every package used, declared or not, with where.
    pub using: BTreeMap<String, Vec<Use>>,
    /// Files read.
    pub files: usize,
    /// The package.json could not be parsed.
    pub invalid: bool,
}

fn keys(j: &Json, field: &str) -> Vec<String> {
    match j.get(field) {
        Some(Json::Obj(v)) => {
            let mut seen = BTreeSet::new();
            v.iter()
                .filter(|(k, _)| seen.insert(k.clone()))
                .map(|(k, _)| k.clone())
                .collect()
        }
        _ => Vec::new(),
    }
}

fn strings(j: &Json, out: &mut Vec<String>) {
    match j {
        Json::Str(s) => out.push(s.clone()),
        Json::Arr(v) => v.iter().for_each(|x| strings(x, out)),
        Json::Obj(v) => v.iter().for_each(|(_, x)| strings(x, out)),
        Json::Other => {}
    }
}

/// depcheck's `applyImportsMap`: a `#name` specifier is replaced by every
/// target the `imports` field maps it to (all conditions), with `*`
/// filled in by what the wildcard matched. Unmatched, it stays as written.
fn apply_imports(imports: Option<&Json>, spec: &str) -> Vec<String> {
    let Some(Json::Obj(map)) = imports else {
        return vec![spec.to_string()];
    };
    if !spec.starts_with('#') {
        return vec![spec.to_string()];
    }
    let mut out = Vec::new();
    for (pat, target) in map {
        let matched: Option<String> = if pat.contains('*') {
            // depcheck turns the pattern into a regex with `.*` per `*` and
            // keeps the whole match (not the wildcard part) as the fill.
            if glob_match(pat, spec) {
                Some(spec.to_string())
            } else {
                None
            }
        } else if pat == spec {
            Some(String::new())
        } else {
            None
        };
        if let Some(fill) = matched {
            let mut ts = Vec::new();
            strings(target, &mut ts);
            for t in ts {
                if !fill.is_empty() && t.contains('*') {
                    out.push(t.replace('*', &fill));
                } else {
                    out.push(t);
                }
            }
        }
    }
    if out.is_empty() {
        vec![spec.to_string()]
    } else {
        out
    }
}

/// `*` matches any run of characters; everything else literally.
fn glob_match(pat: &str, s: &str) -> bool {
    let parts: Vec<&str> = pat.split('*').collect();
    let mut rest = s;
    for (i, p) in parts.iter().enumerate() {
        if i == 0 {
            match rest.strip_prefix(p) {
                Some(r) => rest = r,
                None => return false,
            }
        } else if i == parts.len() - 1 {
            return rest.len() >= p.len() && rest.ends_with(p);
        } else {
            match rest.find(p) {
                Some(k) => rest = &rest[k + p.len()..],
                None => return false,
            }
        }
    }
    rest.is_empty()
}

/// How a specifier was written, which decides what depcheck makes of it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Form {
    /// `import ... from "x"`, `import "x"`: URLs dropped, webpack `!`
    /// loader chains split.
    Import,
    /// `import type ... from "x"`: as Import, but only `@types/x` is used
    /// when that is declared.
    ImportType,
    /// `export ... from "x"`: the value as written.
    ExportFrom,
    /// `require("x")` with one argument (and TypeScript's
    /// `import x = require("x")`): as Import.
    Require,
    /// `import("x")`, `System.import("x")`, `require.resolve("x")`,
    /// `grunt.loadNpmTasks("x")`: the value as written.
    Call,
    /// `import("x")` where TypeScript reads a type (`typeof import("x")`,
    /// `x: import("x").T`, anything in a `.d.ts`): depcheck's default
    /// detectors skip these.
    TypeImport,
}

/// One specifier as written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Spec {
    pub value: String,
    pub line: u32,
    pub form: Form,
}

/// A string argument at `k`: `"x"`, `` `x` `` (no substitution), either
/// inside any number of parentheses. Returns the value, whether it was a
/// template, and the index after it.
fn string_arg(t: &[super::Tok], mut k: usize) -> Option<(String, bool, usize)> {
    let mut open = 0;
    while t.get(k).map(|x| x.kind) == Some(Kind::Punct(b'(')) {
        open += 1;
        k += 1;
    }
    let tok = t.get(k)?;
    let (v, tmpl) = match tok.kind {
        Kind::Str => (tok.text.to_string(), false),
        Kind::Value
            if tok.text.len() >= 2 && tok.text.starts_with('`') && tok.text.ends_with('`') =>
        {
            (tok.text[1..tok.text.len() - 1].to_string(), true)
        }
        _ => return None,
    };
    k += 1;
    for _ in 0..open {
        if t.get(k).map(|x| x.kind) != Some(Kind::Punct(b')')) {
            return None;
        }
        k += 1;
    }
    Some((v, tmpl, k))
}

/// Does `import(` at `j` sit where TypeScript reads a type?
fn type_position(t: &[super::Tok], j: usize, after: usize) -> bool {
    let prev = |k: usize| j.checked_sub(k).and_then(|i| t.get(i));
    if let Some(p) = prev(1) {
        match p.kind {
            Kind::Ident if matches!(p.text, "typeof" | "extends" | "keyof") => return true,
            Kind::Punct(b':' | b'|' | b'&' | b'<') => return true,
            // `type T = import("x").U`
            Kind::Punct(b'=')
                if prev(2).is_some_and(|x| x.kind == Kind::Ident)
                    && prev(3).is_some_and(|x| x.kind == Kind::Ident && x.text == "type") =>
            {
                return true;
            }
            _ => {}
        }
    }
    // `import("x").Name` read as a type: a member that is not a promise's.
    t.get(after).map(|x| x.kind) == Some(Kind::Punct(b'.'))
        && t.get(after + 1).is_some_and(|x| {
            x.kind == Kind::Ident && !matches!(x.text, "then" | "catch" | "finally")
        })
}

/// The specifiers one JavaScript or TypeScript file passes to depcheck's
/// default detectors, with their lines and forms. `ts` marks a TypeScript
/// file and `dts` a declaration file.
pub fn extract_specifiers(src: &str, ts: bool, dts: bool) -> Vec<Spec> {
    let t = tokenize(src);
    let mut out = Vec::new();
    let kind = |k: usize| t.get(k).map(|x| x.kind);
    let text = |k: usize| t.get(k).map(|x| x.text).unwrap_or("");
    let dot_before = |j: usize| j > 0 && t[j - 1].kind == Kind::Punct(b'.');
    for j in 0..t.len() {
        if t[j].kind != Kind::Ident {
            continue;
        }
        let line = t[j].line;
        let mut push = |value: String, form: Form| out.push(Spec { value, line, form });
        match t[j].text {
            "import" if !dot_before(j) => {
                if kind(j + 1) == Some(Kind::Punct(b'(')) {
                    if let Some((v, _, after)) = string_arg(&t, j + 2) {
                        let form = if ts && (dts || type_position(&t, j, after + 1)) {
                            Form::TypeImport
                        } else {
                            Form::Call
                        };
                        push(v, form);
                    }
                } else if kind(j + 1) == Some(Kind::Str) {
                    push(text(j + 1).to_string(), Form::Import);
                } else if matches!(
                    kind(j + 1),
                    Some(Kind::Ident) | Some(Kind::Punct(b'{')) | Some(Kind::Punct(b'*'))
                ) {
                    if let Some(s) = clause_from(&t, j + 1) {
                        let form = if type_only(&t, j + 1) {
                            Form::ImportType
                        } else {
                            Form::Import
                        };
                        push(t[s].text.to_string(), form);
                    }
                }
            }
            // `System.import("x")`
            "import" if j >= 2 && text(j - 2) == "System" => {
                if kind(j + 1) == Some(Kind::Punct(b'(')) {
                    if let Some((v, _, _)) = string_arg(&t, j + 2) {
                        push(v, Form::Call);
                    }
                }
            }
            "export" if !dot_before(j) => {
                let opens = matches!(
                    kind(j + 1),
                    Some(Kind::Punct(b'{')) | Some(Kind::Punct(b'*'))
                ) || (kind(j + 1) == Some(Kind::Ident) && text(j + 1) == "type");
                if opens {
                    if let Some(s) = clause_from(&t, j + 1) {
                        push(t[s].text.to_string(), Form::ExportFrom);
                    }
                }
            }
            "require" if !dot_before(j) => {
                if kind(j + 1) == Some(Kind::Punct(b'(')) {
                    // Exactly one argument.
                    if let Some((v, _, after)) = string_arg(&t, j + 2) {
                        if kind(after) == Some(Kind::Punct(b')')) {
                            push(v, Form::Require);
                        }
                    }
                } else if kind(j + 1) == Some(Kind::Punct(b'.'))
                    && text(j + 2) == "resolve"
                    && kind(j + 3) == Some(Kind::Punct(b'('))
                {
                    if let Some((v, false, _)) = string_arg(&t, j + 4) {
                        push(v, Form::Call);
                    }
                }
            }
            "loadNpmTasks" if dot_before(j) && kind(j + 1) == Some(Kind::Punct(b'(')) => {
                if let Some((v, false, _)) = string_arg(&t, j + 2) {
                    push(v, Form::Call);
                }
            }
            _ => {}
        }
    }
    out
}

/// depcheck's `extractInlineWebpack`: URLs name nothing; `a!b!./c` names
/// each loader in the chain (and the file); `!!a?x!./c` names the loader.
fn inline_webpack(v: &str) -> Vec<String> {
    let parts: Vec<&str> = v.split('!').collect();
    if parts.len() == 1 {
        let lower = v.to_ascii_lowercase();
        if lower.starts_with("http://") || lower.starts_with("https://") {
            return Vec::new();
        }
        return vec![v.to_string()];
    }
    if parts[0].is_empty() {
        let loader: Vec<&str> = parts[1].split('?').collect();
        if loader.len() == 1 {
            return parts.iter().map(|s| s.to_string()).collect();
        }
        return vec![loader[0].to_string()];
    }
    parts.iter().map(|s| s.to_string()).collect()
}

/// The first whole number in a version range (semver.coerce's major).
fn coerced_major(v: &str) -> Option<u64> {
    let b = v.as_bytes();
    let start = b.iter().position(|c| c.is_ascii_digit())?;
    let end = b[start..]
        .iter()
        .position(|c| !c.is_ascii_digit())
        .map_or(b.len(), |e| start + e);
    v[start..end].parse().ok()
}

/// The installed package.json of `dep`, looked up from `dir` upward the way
/// Node does (`node_modules/<dep>/package.json` in each ancestor).
fn installed(fs: &dyn Files, dir: &Path, dep: &str) -> Option<Json> {
    let mut d = Some(dir);
    while let Some(cur) = d {
        let p = cur.join("node_modules").join(dep).join("package.json");
        if let Some(b) = fs.read(&p) {
            return parse_jsonc(&String::from_utf8_lossy(&b));
        }
        d = cur.parent().filter(|x| !x.as_os_str().is_empty());
    }
    None
}

/// Node's folder resolution (`require("./dir")`): package.json `main`, as
/// a file, with `.js`, `.json` or `.node`, or as a folder with `index.*`;
/// else `index.*`. Returns the package.json nearest the file it lands on,
/// at or below `dir` (resolve-from then findup-sync, as depcheck does).
fn folder_entry_meta(fs: &dyn Files, dir: &Path) -> Option<Json> {
    let manifest = dir.join("package.json");
    let main = fs
        .read(&manifest)
        .and_then(|b| parse_jsonc(&String::from_utf8_lossy(&b)))
        .and_then(|m| m.get("main").and_then(|x| x.as_str()).map(String::from));
    let mut tries: Vec<PathBuf> = Vec::new();
    if let Some(m) = main.filter(|m| !m.is_empty()) {
        let b = crate::normalize(&dir.join(&m));
        tries.push(b.clone());
        for e in ["js", "json", "node"] {
            tries.push(PathBuf::from(format!("{}.{e}", b.display())));
        }
        for e in ["js", "json", "node"] {
            tries.push(b.join(format!("index.{e}")));
        }
    }
    for e in ["js", "json", "node"] {
        tries.push(dir.join(format!("index.{e}")));
    }
    let hit = tries.into_iter().find(|p| fs.is_file(p))?;
    let mut d = hit.parent();
    while let Some(cur) = d {
        if let Some(b) = fs.read(&cur.join("package.json")) {
            return parse_jsonc(&String::from_utf8_lossy(&b));
        }
        if cur == dir {
            break;
        }
        d = cur.parent();
    }
    None
}

/// The commands a package's installed `bin` field names.
fn installed_bins(meta: &Json, dep: &str) -> Vec<(String, String)> {
    match meta.get("bin") {
        Some(Json::Str(s)) => {
            let base = dep.rsplit('/').next().unwrap_or(dep).to_string();
            vec![(base, s.clone())]
        }
        Some(Json::Obj(v)) => v
            .iter()
            .filter_map(|(k, x)| x.as_str().map(|s| (k.clone(), s.to_string())))
            .collect(),
        _ => Vec::new(),
    }
}

/// depcheck's `isBinaryInUse`: the command, or one of the ways scripts
/// spell it, appears as a whole space-separated phrase in a script.
fn bin_in_scripts(dep: &str, bin: &str, target: Option<&str>, scripts: &[String]) -> bool {
    let mut features = vec![
        bin.to_string(),
        format!("--require {bin}"),
        format!("--require {bin}/register"),
        format!("-r {bin}"),
        format!("-r {bin}/register"),
        format!("$(npm bin)/{bin}"),
        format!("node_modules/.bin/{bin}"),
        format!("./node_modules/.bin/{bin}"),
    ];
    if let Some(t) = target {
        let p = normalize_join(&format!("node_modules/{dep}"), t);
        features.push(format!("./{p}"));
        features.push(p);
    }
    scripts.iter().any(|s| {
        let padded = format!(" {s} ");
        features.iter().any(|f| padded.contains(&format!(" {f} ")))
    })
}

/// path.join for forward-slash paths: drop `.` segments and fold `..`.
fn normalize_join(a: &str, b: &str) -> String {
    let mut out: Vec<&str> = Vec::new();
    for seg in a.split('/').chain(b.split('/')) {
        match seg {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            s => out.push(s),
        }
    }
    out.join("/")
}

/// The guess for an uninstalled package: does a script run a command named
/// after it (or one of its known binaries), as a word at the start of a
/// command (after `&&`, `;`, `|`, `npx`, `pnpm exec` and the like)?
fn guessed_bin_in_scripts(dep: &str, scripts: &[String]) -> bool {
    let mut bins: Vec<&str> = KNOWN_BINS
        .iter()
        .filter(|(d, _)| *d == dep)
        .flat_map(|(_, b)| b.iter().copied())
        .collect();
    if bins.is_empty() && !KNOWN_BINS.iter().any(|(d, _)| *d == dep) {
        bins.push(dep.rsplit('/').next().unwrap_or(dep));
    }
    scripts.iter().any(|s| {
        bins.iter().any(|b| {
            let padded = format!(" {} ", s.replace(['(', ')', '"', '\''], " "));
            padded.contains(&format!(" {b} "))
                || padded.contains(&format!(" node_modules/.bin/{b} "))
                || padded.contains(&format!(" ./node_modules/.bin/{b} "))
        })
    })
}

fn is_ts(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()),
        Some("ts" | "tsx" | "mts" | "cts")
    )
}

fn is_js(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()),
        Some("js" | "mjs" | "cjs" | "jsx")
    ) || is_ts(p)
}

fn is_tsconfig(p: &Path) -> bool {
    let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    n.starts_with("tsconfig") && n.ends_with(".json")
}

/// `postcss.config.mjs`, `tailwind.config.ts`, `.eslintrc.cjs`,
/// `.prettierrc.json`: files whose strings name packages a tool loads.
fn is_config(p: &Path) -> bool {
    let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    n.contains(".config.") || n.contains("rc.") || n.ends_with("rc")
}

/// String literals in a config file, with their lines.
fn config_strings(src: &str, json: bool) -> Vec<(String, u32)> {
    if json {
        let mut v = Vec::new();
        if let Some(j) = parse_jsonc(src) {
            collect_json_strings(&j, &mut v);
        }
        return v.into_iter().map(|s| (s, 0)).collect();
    }
    // Strings, and identifier keys (`plugins: { autoprefixer: {} }`).
    let t = tokenize(src);
    let mut out = Vec::new();
    for (k, tok) in t.iter().enumerate() {
        let key = tok.kind == Kind::Ident
            && t.get(k + 1).map(|x| x.kind) == Some(Kind::Punct(b':'))
            && k > 0
            && matches!(t[k - 1].kind, Kind::Punct(b'{') | Kind::Punct(b','));
        if tok.kind == Kind::Str || key {
            out.push((tok.text.to_string(), tok.line));
        }
    }
    out
}

/// Config files that show their tool is used: `<stem>.config.*`, `.<stem>rc*`.
const TOOL_CONFIGS: &[(&str, &[&str])] = &[
    ("postcss", &["postcss"]),
    ("tailwind", &["tailwindcss"]),
    ("jest", &["jest"]),
    ("vite", &["vite"]),
    ("vitest", &["vitest"]),
    ("eslint", &["eslint"]),
    ("prettier", &["prettier"]),
    ("babel", &["@babel/core"]),
    ("webpack", &["webpack"]),
    ("rollup", &["rollup"]),
    ("playwright", &["@playwright/test"]),
    ("next", &["next"]),
    ("svelte", &["svelte"]),
    ("astro", &["astro"]),
    ("nuxt", &["nuxt"]),
    ("stylelint", &["stylelint"]),
    ("commitlint", &["@commitlint/cli"]),
    ("lint-staged", &["lint-staged"]),
    ("tsup", &["tsup"]),
    ("drizzle", &["drizzle-kit"]),
    ("wrangler", &["wrangler"]),
    ("capacitor", &["@capacitor/cli", "@capacitor/core"]),
];

/// The packages a config file's name says are in use.
fn tools_for_config(p: &Path) -> Vec<&'static str> {
    let n = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let n = n.strip_prefix('.').unwrap_or(n);
    let mut out = Vec::new();
    if n.starts_with("tsconfig") && n.ends_with(".json") {
        out.push("typescript");
    }
    for (stem, pkgs) in TOOL_CONFIGS {
        let rest = match n.strip_prefix(stem) {
            Some(r) => r,
            None => continue,
        };
        if rest.starts_with(".config.")
            || rest.starts_with("rc")
            || (*stem == "wrangler" && (rest == ".toml" || rest == ".json" || rest == ".jsonc"))
        {
            out.extend(pkgs.iter().copied());
        }
    }
    out
}

/// Packages named in a test file's environment pragma
/// (`// @vitest-environment jsdom`, `/** @jest-environment node */`):
/// vitest loads the package of that name, jest `jest-environment-<name>`
/// (or the name itself).
fn environment_pragmas(src: &str) -> Vec<(String, u32)> {
    let mut out = Vec::new();
    for (i, line) in src.lines().enumerate() {
        for tag in ["@vitest-environment", "@jest-environment"] {
            if let Some(k) = line.find(tag) {
                let name: String = line[k + tag.len()..]
                    .trim_start()
                    .chars()
                    .take_while(|c| !c.is_whitespace() && *c != '*')
                    .collect();
                if name.is_empty() {
                    continue;
                }
                let n = (i + 1) as u32;
                if tag == "@jest-environment" {
                    out.push((format!("jest-environment-{name}"), n));
                }
                out.push((name, n));
            }
        }
    }
    out
}

/// Bare packages a stylesheet loads: `@import "x"`, `@plugin "x"`,
/// `@config`, `@use`/`@forward` (Sass), quoted or in `url()`.
fn css_packages(src: &str) -> Vec<(String, u32)> {
    let mut out = Vec::new();
    for (i, line) in src.lines().enumerate() {
        let l = line.trim_start();
        for at in [
            "@import",
            "@plugin",
            "@use",
            "@forward",
            "@config",
            "@reference",
        ] {
            let Some(rest) = l.strip_prefix(at) else {
                continue;
            };
            let rest = rest.trim_start();
            let rest = rest.strip_prefix("url(").unwrap_or(rest);
            let q = rest.chars().next();
            let Some(q) = q.filter(|c| *c == '"' || *c == '\'') else {
                continue;
            };
            let body = &rest[1..];
            let Some(end) = body.find(q) else { continue };
            let spec = body[..end].trim_start_matches('~');
            if spec.starts_with('.') || spec.starts_with('/') || spec.contains("://") {
                continue;
            }
            if let Some(n) = package_name(spec) {
                out.push((n, (i + 1) as u32));
            }
        }
    }
    out
}

fn is_css(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()),
        Some("css" | "scss" | "sass" | "less" | "pcss")
    )
}

/// Peers a framework needs at run time, for the no-install guess: when the
/// first is used and not installed, the others count as used.
const KNOWN_PEERS: &[(&str, &[&str])] = &[
    ("next", &["react", "react-dom"]),
    (
        "@testing-library/react",
        &["@testing-library/dom", "react-dom"],
    ),
    ("@vitejs/plugin-react", &["react", "react-dom"]),
    ("@tailwindcss/postcss", &["tailwindcss", "postcss"]),
    ("@capacitor/cli", &["@capacitor/core"]),
    ("@capacitor/android", &["@capacitor/core"]),
    ("@capacitor/ios", &["@capacitor/core"]),
];

/// Every string in a JSON value, keys included (`"plugins": {"x": {}}`).
fn collect_json_strings(j: &Json, out: &mut Vec<String>) {
    match j {
        Json::Str(s) => out.push(s.clone()),
        Json::Arr(v) => v.iter().for_each(|x| collect_json_strings(x, out)),
        Json::Obj(v) => v.iter().for_each(|(k, x)| {
            out.push(k.clone());
            collect_json_strings(x, out)
        }),
        Json::Other => {}
    }
}

/// Does a specifier name something that is not an npm package at all
/// (`bun:test`, `virtual:x`, `https://...`, `data:...`)? `node:` is
/// handled by the built-in check.
fn has_scheme(spec: &str) -> bool {
    match spec.find(':') {
        Some(i) => {
            let head = &spec[..i];
            !head.is_empty()
                && head != "node"
                && !head.contains('/')
                && head
                    .bytes()
                    .all(|c| c.is_ascii_alphanumeric() || c == b'+' || c == b'-' || c == b'.')
        }
        None => false,
    }
}

/// Check one package: `manifest` is its package.json, `files` every file in
/// it (any type; the ones that matter are picked here).
pub fn check_package(
    fs: &dyn Files,
    manifest: &Path,
    files: &[PathBuf],
    opts: &DepOptions,
) -> DepReport {
    let mut rep = DepReport {
        manifest: manifest.to_path_buf(),
        ..DepReport::default()
    };
    let dir = manifest.parent().unwrap_or(Path::new(""));
    let Some(meta) = fs
        .read(manifest)
        .and_then(|b| parse_jsonc(&String::from_utf8_lossy(&b)))
    else {
        rep.invalid = true;
        return rep;
    };
    rep.name = meta.get("name").and_then(|n| n.as_str()).map(String::from);
    let deps = keys(&meta, "dependencies");
    let dev = keys(&meta, "devDependencies");
    let peer = keys(&meta, "peerDependencies");
    let optional = keys(&meta, "optionalDependencies");
    let mut all: Vec<String> = deps.clone();
    for d in &dev {
        if !all.contains(d) {
            all.push(d.clone());
        }
    }
    let declared: BTreeSet<&String> = all.iter().chain(&peer).chain(&optional).collect();
    let imports = meta.get("imports");
    let configs = Configs::new(!opts.depcheck);
    let exts: Vec<String> = super::DEFAULT_EXTS.iter().map(|s| s.to_string()).collect();
    let mut scripts: Vec<String> = Vec::new();
    if let Some(Json::Obj(v)) = meta.get("scripts") {
        scripts = v
            .iter()
            .filter_map(|(_, x)| x.as_str().map(String::from))
            .collect();
    }

    let own = rep.name.clone();
    // Per file, in parallel: the package names it uses.
    let per_file: Vec<Vec<(String, Use)>> = files
        .par_iter()
        .map(|f| {
            let mut out: Vec<(String, Use)> = Vec::new();
            let at = |line: u32| Use {
                file: f.clone(),
                line,
            };
            let read = || fs.read(f).map(|b| String::from_utf8_lossy(&b).into_owned());
            if !opts.depcheck {
                for tool in tools_for_config(f) {
                    if all.iter().any(|d| d == tool) {
                        out.push((tool.to_string(), at(0)));
                    }
                }
            }
            if is_js(f) {
                let Some(src) = read() else { return out };
                let ts = is_ts(f);
                let dts = f
                    .file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.contains(".d.") && ts);
                let mut specs: Vec<(String, u32)> = Vec::new();
                for sp in extract_specifiers(&src, ts, dts) {
                    match sp.form {
                        Form::Import | Form::Require => {
                            for v in inline_webpack(&sp.value) {
                                specs.push((v, sp.line));
                            }
                        }
                        Form::ImportType => {
                            let t = format!("@types/{}", sp.value);
                            if all.contains(&t) {
                                specs.push((t, sp.line));
                            } else {
                                for v in inline_webpack(&sp.value) {
                                    specs.push((v, sp.line));
                                }
                            }
                        }
                        Form::ExportFrom | Form::Call => specs.push((sp.value, sp.line)),
                        // Types need the package too, but depcheck's
                        // default detectors do not look.
                        Form::TypeImport if !opts.depcheck => specs.push((sp.value, sp.line)),
                        Form::TypeImport => {}
                    }
                }
                for (spec, line) in specs {
                    if spec.is_empty() {
                        continue;
                    }
                    if !opts.depcheck && !spec.starts_with('.') && !spec.starts_with('#') {
                        if has_scheme(&spec) {
                            continue;
                        }
                        // A tsconfig alias that lands on a file is local code.
                        if let Resolve::File(_) = resolve_with(fs, &configs, f, &spec, &exts) {
                            continue;
                        }
                    }
                    for s in apply_imports(imports, &spec) {
                        let Some(name) = package_name(&s) else {
                            continue;
                        };
                        // A package importing itself by name (Node's
                        // self-reference) needs no declaration.
                        if !opts.depcheck && own.as_deref() == Some(name.as_str()) {
                            continue;
                        }
                        if name == "." || name == ".." {
                            out.push((format!("\u{0}{name}"), at(line)));
                            continue;
                        }
                        if is_core(&name) {
                            if ts && is_core(&name) && all.contains(&"@types/node".to_string()) {
                                out.push(("@types/node".into(), at(line)));
                            }
                            continue;
                        }
                        if ts {
                            let t = types_name(&name);
                            if all.contains(&t) {
                                out.push((t, at(line)));
                            }
                        }
                        out.push((name, at(line)));
                    }
                }
                if !opts.depcheck {
                    for (s, line) in environment_pragmas(&src) {
                        if all.contains(&s) {
                            out.push((s, at(line)));
                        }
                    }
                }
                if !opts.depcheck && is_config(f) {
                    for (s, line) in config_strings(&src, false) {
                        if all.contains(&s) {
                            out.push((s, at(line)));
                        }
                    }
                }
            } else if is_tsconfig(f) {
                let Some(j) = read().and_then(|s| parse_jsonc(&s)) else {
                    return out;
                };
                let mut found: Vec<String> = Vec::new();
                if let Some(Json::Arr(types)) =
                    j.get("compilerOptions").and_then(|c| c.get("types"))
                {
                    for t in types.iter().filter_map(|x| x.as_str()) {
                        let tp = format!("@types/{t}");
                        if !all.contains(&tp)
                            && (all.iter().any(|d| d == t) || t.contains(['@', '/']))
                        {
                            found.push(t.to_string());
                        } else {
                            found.push(tp);
                        }
                    }
                }
                match j.get("extends") {
                    Some(Json::Str(e)) => found.push(e.clone()),
                    // An array is TypeScript 5's form; depcheck's
                    // require-package-name reads only a string.
                    Some(Json::Arr(v)) if !opts.depcheck => {
                        found.extend(v.iter().filter_map(|x| x.as_str()).map(String::from))
                    }
                    _ => {}
                }
                for s in found {
                    if let Some(n) = package_name(&s) {
                        if n != "." && n != ".." && !is_core(&n) {
                            out.push((n, at(0)));
                        }
                    }
                }
            } else if !opts.depcheck && is_css(f) {
                if let Some(src) = read() {
                    for (s, line) in css_packages(&src) {
                        if all.contains(&s) {
                            out.push((s, at(line)));
                        }
                    }
                }
            } else if !opts.depcheck && is_config(f) {
                let n = f.file_name().and_then(|n| n.to_str()).unwrap_or("");
                let json = n.ends_with(".json") || n.ends_with("rc");
                if let Some(src) = read() {
                    for (s, line) in config_strings(&src, json) {
                        if all.contains(&s) {
                            out.push((s, at(line)));
                        }
                    }
                }
            }
            out
        })
        .collect();
    rep.files = files.len();

    let mut using: BTreeMap<String, Vec<Use>> = BTreeMap::new();
    let mut dots: BTreeSet<String> = BTreeSet::new();
    for list in per_file {
        for (name, u) in list {
            match name.strip_prefix('\u{0}') {
                Some(d) => {
                    dots.insert(d.to_string());
                }
                None => using.entry(name).or_default().push(u),
            }
        }
    }

    // package.json itself: react 17+, and binaries the scripts run.
    let whole = |using: &mut BTreeMap<String, Vec<Use>>, n: &str| {
        using.entry(n.to_string()).or_default().push(Use {
            file: manifest.to_path_buf(),
            line: 0,
        });
    };
    if let Some(r) = meta
        .get("dependencies")
        .and_then(|d| d.get("react"))
        .and_then(|r| r.as_str())
    {
        if coerced_major(r).is_some_and(|m| m >= 17) {
            whole(&mut using, "react");
        }
    }
    let mut cache: HashMap<String, Option<Json>> = HashMap::new();
    let self_ref =
        |d: &str| opts.depcheck && rep.name.as_deref() == Some(d) && meta.get("exports").is_some();
    for d in &all {
        let m = if self_ref(d) {
            &Some(meta.clone())
        } else {
            &*cache
                .entry(d.clone())
                .or_insert_with(|| installed(fs, dir, d))
        };
        let by_install = m.as_ref().is_some_and(|m| {
            installed_bins(m, d)
                .iter()
                .any(|(b, t)| bin_in_scripts(d, b, Some(t), &scripts))
        });
        let by_guess = !opts.depcheck && m.is_none() && guessed_bin_in_scripts(d, &scripts);
        if by_install || by_guess {
            whole(&mut using, d);
        }
    }
    if !opts.depcheck {
        // Known framework peers, then `@types/x` for every used `x` (the
        // compiler reads them whichever file brought `x` in).
        let mut changed = true;
        while changed {
            changed = false;
            for (lead, peers) in KNOWN_PEERS {
                let lead_used =
                    using.contains_key(*lead) && !cache.get(*lead).is_some_and(|m| m.is_some());
                if !lead_used {
                    continue;
                }
                for p in *peers {
                    if all.iter().any(|d| d == p) && !using.contains_key(*p) {
                        whole(&mut using, p);
                        changed = true;
                    }
                }
            }
            let used: Vec<String> = using.keys().cloned().collect();
            for u in used {
                let t = types_name(&u);
                if all.contains(&t) && !using.contains_key(&t) {
                    whole(&mut using, &t);
                    changed = true;
                }
            }
        }
    }
    // A used package's installed peer and optional dependencies.
    let mut dot_meta: HashMap<String, Option<Json>> = HashMap::new();
    let mut used_now: Vec<String> = using.keys().cloned().collect();
    if opts.depcheck {
        used_now.extend(dots.iter().cloned());
    }
    for u in used_now {
        // depcheck resolves a package's own name from inside it, which
        // Node allows when package.json has `exports` (self-reference), and
        // so counts the package's own peer dependencies as used.
        let m = if self_ref(&u) {
            Some(&meta)
        } else if opts.depcheck && (u == "." || u == "..") {
            // Relative imports reach here as "." and "..": depcheck resolves
            // them as folders (this package's entry, or its parent's) and
            // reads the package.json nearest the file they land on.
            let target = if u == "." { Some(dir) } else { dir.parent() };
            dot_meta
                .entry(u.clone())
                .or_insert_with(|| target.and_then(|t| folder_entry_meta(fs, t)))
                .as_ref()
        } else {
            cache
                .entry(u.clone())
                .or_insert_with(|| installed(fs, dir, &u))
                .as_ref()
        };
        let Some(m) = m else { continue };
        for field in ["peerDependencies", "optionalDependencies"] {
            for p in keys(m, field) {
                if all.contains(&p) {
                    using.entry(p).or_default().push(Use {
                        file: manifest.to_path_buf(),
                        line: 0,
                    });
                }
            }
        }
    }
    for v in using.values_mut() {
        v.sort();
        v.dedup();
    }

    rep.unused = deps
        .iter()
        .filter(|d| !using.contains_key(*d))
        .cloned()
        .collect();
    rep.unused_dev = dev
        .iter()
        .filter(|d| !using.contains_key(*d))
        .cloned()
        .collect();
    rep.missing = using
        .iter()
        .filter(|(n, _)| !declared.contains(n))
        .map(|(n, u)| (n.clone(), u.clone()))
        .collect();
    rep.using = using;
    rep
}
