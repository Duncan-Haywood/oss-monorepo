//! cyclehound: build a JavaScript/TypeScript import graph and find circular
//! dependencies, fast.
//!
//! Three stages, each small enough to test on its own:
//!
//! 1. [`extract_imports`] lexes one file (comments, strings, template
//!    literals with `${}` nesting, and regex literals are skipped properly)
//!    and pattern-matches the token stream for `import ... from "x"`,
//!    `import "x"`, `export ... from "x"`, `import("x")` and `require("x")`.
//! 2. [`build_graph`] resolves relative specifiers against the file system
//!    the way Node and bundlers do for extensionless paths (exact file, then
//!    each extension, then `index.<ext>`), parses every reachable file in
//!    parallel, and follows imports that leave the starting directory.
//! 3. [`strongly_connected`] (Tarjan) and [`cycles`] report every file that
//!    sits on a cycle, grouped by component, with a shortest cycle through
//!    each file so the report is short but nothing on a cycle is missed.

use rayon::prelude::*;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::path::{Component, Path, PathBuf};

// ---------------------------------------------------------------- lexing

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Ident,
    Str,
    Punct(u8),
    /// Numbers, regex literals, template literals: values we never inspect.
    Value,
}

#[derive(Debug, Clone, Copy)]
struct Tok<'a> {
    kind: Kind,
    text: &'a str,
    line: u32,
}

/// How a file refers to another one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ImportKind {
    /// `import x from "y"`, `import "y"`, `export * from "y"`.
    Static,
    /// `import("y")` with a plain string argument.
    Dynamic,
    /// `require("y")`.
    Require,
    /// `import type ... from "y"`, `export type ... from "y"` (TypeScript):
    /// erased before the code runs, so it cannot fail at load time.
    Type,
}

impl ImportKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ImportKind::Static => "static",
            ImportKind::Dynamic => "dynamic",
            ImportKind::Require => "require",
            ImportKind::Type => "type",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Import {
    pub spec: String,
    pub kind: ImportKind,
    pub line: u32,
}

fn is_ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_' || b == b'$' || b >= 0x80 || b == b'#'
}

fn is_ident_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'$' || b >= 0x80
}

/// Keywords after which a `/` starts a regex literal rather than a division.
const REGEX_AFTER: &[&str] = &[
    "return",
    "typeof",
    "instanceof",
    "in",
    "of",
    "new",
    "delete",
    "void",
    "throw",
    "case",
    "do",
    "else",
    "yield",
    "await",
];

fn regex_allowed(prev: Option<&Tok>) -> bool {
    match prev {
        None => true,
        Some(t) => match t.kind {
            Kind::Punct(c) => !matches!(c, b')' | b']'),
            Kind::Ident => REGEX_AFTER.contains(&t.text),
            Kind::Str | Kind::Value => false,
        },
    }
}

fn tokenize(src: &str) -> Vec<Tok<'_>> {
    let b = src.as_bytes();
    let n = b.len();
    let mut toks: Vec<Tok> = Vec::with_capacity(n / 6);
    let mut i = 0usize;
    let mut line = 1u32;
    // Brace depth, and the depths at which open `${` substitutions resume
    // their template literal when the matching `}` arrives.
    let mut depth = 0u32;
    let mut tmpl: Vec<u32> = Vec::new();

    if b.starts_with(b"#!") {
        while i < n && b[i] != b'\n' {
            i += 1;
        }
    }

    // Scan a template body starting at `i` (just past "`" or the "}" that
    // closes a substitution). Returns true when it stopped at "${".
    let scan_template = |i: &mut usize, line: &mut u32| -> bool {
        while *i < n {
            match b[*i] {
                b'\\' => *i += 2,
                b'\n' => {
                    *line += 1;
                    *i += 1
                }
                b'`' => {
                    *i += 1;
                    return false;
                }
                b'$' if *i + 1 < n && b[*i + 1] == b'{' => {
                    *i += 2;
                    return true;
                }
                _ => *i += 1,
            }
        }
        false
    };

    while i < n {
        let c = b[i];
        match c {
            b'\n' => {
                line += 1;
                i += 1;
            }
            b' ' | b'\t' | b'\r' | 0x0b | 0x0c => i += 1,
            b'/' if i + 1 < n && b[i + 1] == b'/' => {
                while i < n && b[i] != b'\n' {
                    i += 1;
                }
            }
            b'/' if i + 1 < n && b[i + 1] == b'*' => {
                i += 2;
                while i < n && !(b[i] == b'*' && i + 1 < n && b[i + 1] == b'/') {
                    if b[i] == b'\n' {
                        line += 1;
                    }
                    i += 1;
                }
                i = (i + 2).min(n);
            }
            b'/' if regex_allowed(toks.last()) => {
                // A regex literal never spans a line; if no closing slash
                // turns up first, it was a division after all.
                let start = i;
                let mut j = i + 1;
                let mut class = false;
                let mut closed = false;
                while j < n {
                    match b[j] {
                        b'\\' => j += 2,
                        b'\n' => break,
                        b'[' => {
                            class = true;
                            j += 1
                        }
                        b']' => {
                            class = false;
                            j += 1
                        }
                        b'/' if !class => {
                            closed = true;
                            j += 1;
                            break;
                        }
                        _ => j += 1,
                    }
                }
                if closed {
                    while j < n && is_ident_char(b[j]) {
                        j += 1;
                    }
                    let j = j.min(n);
                    toks.push(Tok {
                        kind: Kind::Value,
                        text: &src[start..j],
                        line,
                    });
                    i = j;
                } else {
                    toks.push(Tok {
                        kind: Kind::Punct(b'/'),
                        text: "/",
                        line,
                    });
                    i += 1;
                }
            }
            b'\'' | b'"' => {
                let q = c;
                let start = i + 1;
                let mut j = start;
                while j < n && b[j] != q && b[j] != b'\n' {
                    if b[j] == b'\\' {
                        j += 1;
                    }
                    j += 1;
                }
                let end = j.min(n);
                toks.push(Tok {
                    kind: Kind::Str,
                    text: &src[start..end],
                    line,
                });
                i = (end + 1).min(n);
            }
            b'`' => {
                let l = line;
                i += 1;
                if scan_template(&mut i, &mut line) {
                    tmpl.push(depth);
                }
                toks.push(Tok {
                    kind: Kind::Value,
                    text: "`",
                    line: l,
                });
            }
            b'{' => {
                depth += 1;
                toks.push(Tok {
                    kind: Kind::Punct(c),
                    text: "{",
                    line,
                });
                i += 1;
            }
            b'}' => {
                i += 1;
                if tmpl.last() == Some(&depth) {
                    tmpl.pop();
                    let l = line;
                    if scan_template(&mut i, &mut line) {
                        tmpl.push(depth);
                    }
                    toks.push(Tok {
                        kind: Kind::Value,
                        text: "`",
                        line: l,
                    });
                } else {
                    depth = depth.saturating_sub(1);
                    toks.push(Tok {
                        kind: Kind::Punct(c),
                        text: "}",
                        line,
                    });
                }
            }
            _ if c.is_ascii_digit() || (c == b'.' && i + 1 < n && b[i + 1].is_ascii_digit()) => {
                let start = i;
                while i < n && (is_ident_char(b[i]) || b[i] == b'.') {
                    i += 1;
                }
                toks.push(Tok {
                    kind: Kind::Value,
                    text: &src[start..i],
                    line,
                });
            }
            _ if is_ident_start(c) => {
                let start = i;
                i += 1;
                while i < n && is_ident_char(b[i]) {
                    i += 1;
                }
                // Keep slices on char boundaries for non-ASCII identifiers.
                while i < n && !src.is_char_boundary(i) {
                    i += 1;
                }
                toks.push(Tok {
                    kind: Kind::Ident,
                    text: &src[start..i],
                    line,
                });
            }
            _ => {
                toks.push(Tok {
                    kind: Kind::Punct(c),
                    text: "",
                    line,
                });
                i += 1;
            }
        }
    }
    toks
}

/// After `import` or `export`, walk an import/export clause (`a`,
/// `{ b as c, "d" as e }`, `* as f`, `type`) and return the index of the
/// specifier string after `from`, if the clause ends in one.
fn clause_from(t: &[Tok], mut k: usize) -> Option<usize> {
    let mut braces = 0i32;
    let limit = (k + 4000).min(t.len());
    while k < limit {
        let tok = &t[k];
        match tok.kind {
            Kind::Ident if tok.text == "from" && braces == 0 => {
                if k + 1 < t.len() && t[k + 1].kind == Kind::Str {
                    return Some(k + 1);
                }
                // `import from from "x"`: a binding named from.
            }
            Kind::Ident => {}
            Kind::Str if braces > 0 => {}
            Kind::Punct(b'{') => braces += 1,
            Kind::Punct(b'}') => {
                braces -= 1;
                if braces < 0 {
                    return None;
                }
                if braces == 0 {
                    // After a closing brace only `from` can follow.
                    return match t.get(k + 1) {
                        Some(n) if n.kind == Kind::Ident && n.text == "from" => {
                            match t.get(k + 2) {
                                Some(s) if s.kind == Kind::Str => Some(k + 2),
                                _ => None,
                            }
                        }
                        _ => None,
                    };
                }
            }
            Kind::Punct(b',') | Kind::Punct(b'*') => {}
            _ => return None,
        }
        k += 1;
    }
    None
}

/// `type` right after `import`/`export` marks a type-only clause, unless it
/// is itself the binding (`import type from "x"`, `import type, {a} from`).
fn type_only(t: &[Tok], k: usize) -> bool {
    match (t.get(k), t.get(k + 1)) {
        (Some(a), Some(b)) if a.kind == Kind::Ident && a.text == "type" => match b.kind {
            Kind::Punct(b'{') | Kind::Punct(b'*') => true,
            Kind::Ident => {
                b.text != "from"
                    || matches!(t.get(k + 2), Some(c) if c.kind == Kind::Ident && c.text == "from")
            }
            _ => false,
        },
        _ => false,
    }
}

/// Every module specifier one source file refers to, in source order.
pub fn extract_imports(src: &str) -> Vec<Import> {
    let t = tokenize(src);
    let mut out = Vec::new();
    let is = |k: usize, kind: Kind| t.get(k).map(|x| x.kind == kind).unwrap_or(false);
    for (j, tok) in t.iter().enumerate() {
        if tok.kind != Kind::Ident {
            continue;
        }
        // `obj.import(...)`, `x.require("y")` are someone else's methods.
        if j > 0 && t[j - 1].kind == Kind::Punct(b'.') {
            continue;
        }
        match tok.text {
            "import" => {
                if is(j + 1, Kind::Punct(b'('))
                    && is(j + 2, Kind::Str)
                    && (is(j + 3, Kind::Punct(b')')) || is(j + 3, Kind::Punct(b',')))
                {
                    out.push(Import {
                        spec: t[j + 2].text.to_string(),
                        kind: ImportKind::Dynamic,
                        line: tok.line,
                    });
                } else if is(j + 1, Kind::Str) {
                    out.push(Import {
                        spec: t[j + 1].text.to_string(),
                        kind: ImportKind::Static,
                        line: tok.line,
                    });
                } else if matches!(
                    t.get(j + 1).map(|x| x.kind),
                    Some(Kind::Ident) | Some(Kind::Punct(b'{')) | Some(Kind::Punct(b'*'))
                ) {
                    if let Some(s) = clause_from(&t, j + 1) {
                        let kind = if type_only(&t, j + 1) {
                            ImportKind::Type
                        } else {
                            ImportKind::Static
                        };
                        out.push(Import {
                            spec: t[s].text.to_string(),
                            kind,
                            line: tok.line,
                        });
                    }
                }
            }
            "export" => {
                let next = t.get(j + 1);
                let opens = match next {
                    Some(x) => {
                        matches!(x.kind, Kind::Punct(b'{') | Kind::Punct(b'*'))
                            || (x.kind == Kind::Ident && x.text == "type")
                    }
                    None => false,
                };
                if opens {
                    if let Some(s) = clause_from(&t, j + 1) {
                        let kind = if type_only(&t, j + 1) {
                            ImportKind::Type
                        } else {
                            ImportKind::Static
                        };
                        out.push(Import {
                            spec: t[s].text.to_string(),
                            kind,
                            line: tok.line,
                        });
                    }
                }
            }
            "require"
                if is(j + 1, Kind::Punct(b'('))
                    && is(j + 2, Kind::Str)
                    && is(j + 3, Kind::Punct(b')')) =>
            {
                out.push(Import {
                    spec: t[j + 2].text.to_string(),
                    kind: ImportKind::Require,
                    line: tok.line,
                });
            }
            _ => {}
        }
    }
    out
}

// ---------------------------------------------------------------- resolving

/// Default extensions read and tried when a specifier has none (madge's
/// defaults are `js` only; this reads the module types a repository mixes).
pub const DEFAULT_EXTS: &[&str] = &["js", "mjs", "cjs", "jsx", "ts", "mts", "cts", "tsx"];

#[derive(Debug, Clone)]
pub struct Options {
    /// Extensions to read, and to try in order on extensionless specifiers.
    pub exts: Vec<String>,
    /// Which import kinds become edges.
    pub kinds: BTreeSet<ImportKind>,
    /// Follow resolved imports into files outside the starting directories.
    pub follow_outside: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            exts: DEFAULT_EXTS.iter().map(|s| s.to_string()).collect(),
            kinds: [
                ImportKind::Static,
                ImportKind::Dynamic,
                ImportKind::Require,
                ImportKind::Type,
            ]
            .into_iter()
            .collect(),
            follow_outside: true,
        }
    }
}

/// Lexically clean a path: drop `.`, fold `..` into its parent.
pub fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::CurDir => {}
            Component::ParentDir => {
                if !out.pop() {
                    out.push("..");
                }
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}

fn has_ext(p: &Path, exts: &[String]) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| exts.iter().any(|x| x == e))
        .unwrap_or(false)
}

fn is_module(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| DEFAULT_EXTS.contains(&e))
        .unwrap_or(false)
}

/// Where the files come from: the disk for the CLI, a map of uploaded files
/// for the browser build.
pub trait Files: Sync {
    fn is_file(&self, p: &Path) -> bool;
    fn read(&self, p: &Path) -> Option<Vec<u8>>;
}

/// The real file system.
pub struct Disk;

impl Files for Disk {
    fn is_file(&self, p: &Path) -> bool {
        p.is_file()
    }
    fn read(&self, p: &Path) -> Option<Vec<u8>> {
        std::fs::read(p).ok()
    }
}

/// Files held in memory, keyed by normalized path.
#[derive(Default)]
pub struct Memory(pub HashMap<PathBuf, Vec<u8>>);

impl Files for Memory {
    fn is_file(&self, p: &Path) -> bool {
        self.0.contains_key(p)
    }
    fn read(&self, p: &Path) -> Option<Vec<u8>> {
        self.0.get(p).cloned()
    }
}

/// Resolve a relative specifier from the file `from` on disk. Bare
/// specifiers (packages, `node:` builtins) return `Resolve::External`.
pub fn resolve(from: &Path, spec: &str, exts: &[String]) -> Resolve {
    resolve_in(&Disk, from, spec, exts)
}

/// [`resolve`] against any [`Files`].
pub fn resolve_in(fs: &dyn Files, from: &Path, spec: &str, exts: &[String]) -> Resolve {
    if !(spec.starts_with("./") || spec.starts_with("../") || spec == "." || spec == "..") {
        return Resolve::External;
    }
    let spec = spec.split(['?', '#']).next().unwrap_or(spec);
    // The wanted extensions first, then every other module type, the way a
    // resolver finds "./x" whatever the reader was asked to scan.
    let mut tries: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
    for e in DEFAULT_EXTS {
        if !tries.contains(e) {
            tries.push(e);
        }
    }
    let exts = &tries;
    let base = normalize(&from.parent().unwrap_or(Path::new("")).join(spec));
    if fs.is_file(&base) {
        return Resolve::File(base);
    }
    let s = base.as_os_str().to_string_lossy();
    for e in exts {
        let p = PathBuf::from(format!("{s}.{e}"));
        if fs.is_file(&p) {
            return Resolve::File(p);
        }
    }
    // TypeScript's convention: "./x.js" written for a file that is x.ts.
    if let Some(stem) = s.strip_suffix(".js").or_else(|| s.strip_suffix(".mjs")) {
        for e in ["ts", "tsx", "mts"] {
            let p = PathBuf::from(format!("{stem}.{e}"));
            if fs.is_file(&p) {
                return Resolve::File(p);
            }
        }
    }
    for e in exts {
        let p = base.join(format!("index.{e}"));
        if fs.is_file(&p) {
            return Resolve::File(p);
        }
    }
    Resolve::Missing
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolve {
    File(PathBuf),
    External,
    Missing,
}

/// One edge as written in the source.
#[derive(Debug, Clone)]
pub struct Edge {
    pub to: usize,
    pub kind: ImportKind,
    pub line: u32,
}

/// A relative import that points at no file.
#[derive(Debug, Clone)]
pub struct Unresolved {
    pub from: usize,
    pub spec: String,
    pub line: u32,
}

#[derive(Debug, Default)]
pub struct Graph {
    /// Every node's path, as found on disk (normalized, not canonicalized).
    pub files: Vec<PathBuf>,
    /// Outgoing edges per node, deduplicated by target, sorted by target path.
    pub edges: Vec<Vec<Edge>>,
    pub unresolved: Vec<Unresolved>,
    /// Files that could not be read (not UTF-8, permissions).
    pub unreadable: Vec<PathBuf>,
}

impl Graph {
    pub fn edge_count(&self) -> usize {
        self.edges.iter().map(|e| e.len()).sum()
    }
}

/// One parsed file: its id, and each import with where it resolved (None
/// when the file could not be read).
type Parsed = (usize, Option<Vec<(Import, Resolve)>>);

/// Build the graph from a starting set of files (already filtered to the
/// wanted extensions). Imports that resolve to readable source outside the
/// set are added and parsed too, when `opts.follow_outside` holds.
pub fn build_graph(start: Vec<PathBuf>, opts: &Options) -> Graph {
    build_graph_in(&Disk, start, opts)
}

/// [`build_graph`] against any [`Files`].
pub fn build_graph_in(fs: &dyn Files, start: Vec<PathBuf>, opts: &Options) -> Graph {
    let mut index: HashMap<PathBuf, usize> = HashMap::new();
    let mut g = Graph::default();
    let mut frontier: Vec<usize> = Vec::new();
    for p in start {
        let p = normalize(&p);
        if !index.contains_key(&p) {
            index.insert(p.clone(), g.files.len());
            frontier.push(g.files.len());
            g.files.push(p);
            g.edges.push(Vec::new());
        }
    }
    let mut unreadable: HashSet<usize> = HashSet::new();
    while !frontier.is_empty() {
        // Parse and resolve in parallel; merge serially.
        let parsed: Vec<Parsed> = frontier
            .par_iter()
            .map(|&id| {
                let path = &g.files[id];
                match fs.read(path) {
                    Some(bytes) => {
                        let src = String::from_utf8_lossy(&bytes);
                        let r = extract_imports(&src)
                            .into_iter()
                            .filter(|im| opts.kinds.contains(&im.kind))
                            .map(|im| {
                                let r = resolve_in(fs, path, &im.spec, &opts.exts);
                                (im, r)
                            })
                            .collect();
                        (id, Some(r))
                    }
                    None => (id, None),
                }
            })
            .collect();
        let mut next = Vec::new();
        for (id, res) in parsed {
            let Some(list) = res else {
                unreadable.insert(id);
                continue;
            };
            let mut seen: HashMap<usize, usize> = HashMap::new();
            for (im, r) in list {
                match r {
                    Resolve::External => {}
                    Resolve::Missing => g.unresolved.push(Unresolved {
                        from: id,
                        spec: im.spec,
                        line: im.line,
                    }),
                    Resolve::File(p) => {
                        let to = match index.get(&p) {
                            Some(&to) => to,
                            None => {
                                // Not in the starting set: a file outside the
                                // directory, or one with an extension we do
                                // not read (json, css). Any JavaScript or
                                // TypeScript module named explicitly becomes
                                // a node, as madge does; json and css do not.
                                if !opts.follow_outside
                                    || !(has_ext(&p, &opts.exts) || is_module(&p))
                                {
                                    continue;
                                }
                                let to = g.files.len();
                                index.insert(p.clone(), to);
                                g.files.push(p);
                                g.edges.push(Vec::new());
                                next.push(to);
                                to
                            }
                        };
                        match seen.get(&to) {
                            // Keep the strongest kind for a repeated target:
                            // a static import beats a dynamic one.
                            Some(&k) => {
                                if im.kind < g.edges[id][k].kind {
                                    g.edges[id][k].kind = im.kind;
                                    g.edges[id][k].line = im.line;
                                }
                            }
                            None => {
                                seen.insert(to, g.edges[id].len());
                                g.edges[id].push(Edge {
                                    to,
                                    kind: im.kind,
                                    line: im.line,
                                });
                            }
                        }
                    }
                }
            }
        }
        frontier = next;
    }
    let files = &g.files;
    for e in g.edges.iter_mut() {
        e.sort_by(|a, b| files[a.to].cmp(&files[b.to]));
    }
    let mut un: Vec<usize> = unreadable.into_iter().collect();
    un.sort();
    g.unreadable = un.into_iter().map(|i| g.files[i].clone()).collect();
    g
}

// ---------------------------------------------------------------- cycles

/// Tarjan's strongly connected components, iterative. Returns only the
/// components that contain a cycle (two or more nodes, or a self-import),
/// each sorted by path, the list sorted by its first path.
pub fn strongly_connected(g: &Graph) -> Vec<Vec<usize>> {
    let n = g.files.len();
    const UNSEEN: usize = usize::MAX;
    let mut idx = vec![UNSEEN; n];
    let mut low = vec![0usize; n];
    let mut on_stack = vec![false; n];
    let mut stack: Vec<usize> = Vec::new();
    let mut counter = 0usize;
    let mut out: Vec<Vec<usize>> = Vec::new();
    // Call stack of (node, next edge position).
    let mut call: Vec<(usize, usize)> = Vec::new();
    for root in 0..n {
        if idx[root] != UNSEEN {
            continue;
        }
        call.push((root, 0));
        idx[root] = counter;
        low[root] = counter;
        counter += 1;
        stack.push(root);
        on_stack[root] = true;
        while let Some(&mut (v, ref mut pos)) = call.last_mut() {
            if *pos < g.edges[v].len() {
                let w = g.edges[v][*pos].to;
                *pos += 1;
                if idx[w] == UNSEEN {
                    idx[w] = counter;
                    low[w] = counter;
                    counter += 1;
                    stack.push(w);
                    on_stack[w] = true;
                    call.push((w, 0));
                } else if on_stack[w] {
                    low[v] = low[v].min(idx[w]);
                }
            } else {
                call.pop();
                if let Some(&(parent, _)) = call.last() {
                    low[parent] = low[parent].min(low[v]);
                }
                if low[v] == idx[v] {
                    let mut comp = Vec::new();
                    loop {
                        let w = stack.pop().unwrap();
                        on_stack[w] = false;
                        comp.push(w);
                        if w == v {
                            break;
                        }
                    }
                    let self_loop = comp.len() == 1 && g.edges[v].iter().any(|e| e.to == v);
                    if comp.len() > 1 || self_loop {
                        comp.sort_by(|a, b| g.files[*a].cmp(&g.files[*b]));
                        out.push(comp);
                    }
                }
            }
        }
    }
    out.sort_by(|a, b| g.files[a[0]].cmp(&g.files[b[0]]));
    out
}

/// A shortest cycle through `start` that stays inside `comp` (BFS).
fn shortest_cycle(g: &Graph, comp: &HashSet<usize>, start: usize) -> Option<Vec<usize>> {
    let mut prev: HashMap<usize, usize> = HashMap::new();
    let mut q = VecDeque::new();
    q.push_back(start);
    while let Some(v) = q.pop_front() {
        for e in &g.edges[v] {
            let w = e.to;
            if !comp.contains(&w) {
                continue;
            }
            if w == start {
                let mut path = vec![v];
                let mut x = v;
                while x != start {
                    x = prev[&x];
                    path.push(x);
                }
                path.reverse();
                return Some(path);
            }
            if let std::collections::hash_map::Entry::Vacant(slot) = prev.entry(w) {
                slot.insert(v);
                q.push_back(w);
            }
        }
    }
    None
}

/// Rotate a cycle so it starts at its smallest path, for deduplication.
fn canonical(g: &Graph, c: &[usize]) -> Vec<usize> {
    let (pos, _) = c
        .iter()
        .enumerate()
        .min_by(|a, b| g.files[*a.1].cmp(&g.files[*b.1]))
        .unwrap();
    c[pos..].iter().chain(c[..pos].iter()).copied().collect()
}

/// For each component, a shortest cycle through each of its files,
/// duplicates removed: every file on a cycle appears in at least one listed
/// cycle, and each listed cycle is as short as a cycle through it can be.
pub fn cycles(g: &Graph, comps: &[Vec<usize>]) -> Vec<Vec<Vec<usize>>> {
    comps
        .iter()
        .map(|comp| {
            let set: HashSet<usize> = comp.iter().copied().collect();
            let mut seen: BTreeSet<Vec<usize>> = BTreeSet::new();
            let mut list = Vec::new();
            for &v in comp {
                if let Some(c) = shortest_cycle(g, &set, v) {
                    let c = canonical(g, &c);
                    if seen.insert(c.clone()) {
                        list.push(c);
                    }
                }
            }
            list.sort_by(|a, b| {
                a.len().cmp(&b.len()).then_with(|| {
                    a.iter()
                        .map(|i| &g.files[*i])
                        .cmp(b.iter().map(|i| &g.files[*i]))
                })
            });
            list
        })
        .collect()
}

/// Files no other file imports (madge's `--orphans`), among `among`.
pub fn orphans(g: &Graph, among: usize) -> Vec<usize> {
    let mut imported = vec![false; g.files.len()];
    for es in &g.edges {
        for e in es {
            if e.to != usize::MAX {
                imported[e.to] = true;
            }
        }
    }
    let mut out: Vec<usize> = (0..among.min(g.files.len()))
        .filter(|&i| !imported[i])
        .collect();
    out.sort_by(|a, b| g.files[*a].cmp(&g.files[*b]));
    out
}

/// Express `p` relative to `base` (both normalized), `../` where needed.
pub fn relative(p: &Path, base: &Path) -> String {
    let pc: Vec<Component> = p.components().collect();
    let bc: Vec<Component> = base
        .components()
        .filter(|c| *c != Component::CurDir)
        .collect();
    let pc: Vec<Component> = pc.into_iter().filter(|c| *c != Component::CurDir).collect();
    let common = pc.iter().zip(bc.iter()).take_while(|(a, b)| a == b).count();
    let mut out = PathBuf::new();
    for _ in common..bc.len() {
        out.push("..");
    }
    for c in &pc[common..] {
        out.push(c.as_os_str());
    }
    out.to_string_lossy().replace('\\', "/")
}

/// madge-style adjacency: `{ "file": ["dep", ...] }`, keys and lists sorted.
pub fn adjacency(g: &Graph, base: &Path) -> BTreeMap<String, Vec<String>> {
    let mut m = BTreeMap::new();
    for (i, f) in g.files.iter().enumerate() {
        let mut deps: Vec<String> = g.edges[i]
            .iter()
            .map(|e| relative(&g.files[e.to], base))
            .collect();
        deps.sort();
        m.insert(relative(f, base), deps);
    }
    m
}

/// Minimal JSON string escaping.
pub fn json_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for ch in s.chars() {
        match ch {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

/// The JSON report `cyclehound --json` prints, and the browser build returns:
/// totals, every circular component (its files, a shortest cycle through each
/// file, and the edges inside it with line numbers and kinds), and every
/// relative import that resolves to nothing.
pub fn cycles_json(
    g: &Graph,
    comps: &[Vec<usize>],
    cyc: &[Vec<Vec<usize>>],
    base: &Path,
) -> String {
    let rel = |i: usize| json_str(&relative(&g.files[i], base));
    let mut s = format!(
        "{{\n  \"files\": {},\n  \"edges\": {},\n  \"components\": [",
        g.files.len(),
        g.edge_count()
    );
    for (ci, comp) in comps.iter().enumerate() {
        let files: Vec<String> = comp.iter().map(|&i| rel(i)).collect();
        let set: HashSet<usize> = comp.iter().copied().collect();
        let mut edges = Vec::new();
        for &v in comp {
            for e in &g.edges[v] {
                if set.contains(&e.to) {
                    edges.push(format!(
                        "{{\"from\": {}, \"to\": {}, \"line\": {}, \"kind\": \"{}\"}}",
                        rel(v),
                        rel(e.to),
                        e.line,
                        e.kind.as_str()
                    ));
                }
            }
        }
        let cs: Vec<String> = cyc[ci]
            .iter()
            .map(|c| {
                format!(
                    "[{}]",
                    c.iter().map(|&i| rel(i)).collect::<Vec<_>>().join(", ")
                )
            })
            .collect();
        s.push_str(&format!(
            "{}\n    {{\"files\": [{}],\n     \"cycles\": [{}],\n     \"edges\": [{}]}}",
            if ci > 0 { "," } else { "" },
            files.join(", "),
            cs.join(", "),
            edges.join(", ")
        ));
    }
    s.push_str(if comps.is_empty() { "],\n" } else { "\n  ],\n" });
    let mut un: Vec<(String, u32, &str)> = g
        .unresolved
        .iter()
        .map(|u| (relative(&g.files[u.from], base), u.line, u.spec.as_str()))
        .collect();
    un.sort();
    let un: Vec<String> = un
        .iter()
        .map(|(f, l, sp)| {
            format!(
                "{{\"file\": {}, \"line\": {}, \"spec\": {}}}",
                json_str(f),
                l,
                json_str(sp)
            )
        })
        .collect();
    s.push_str(&format!("  \"unresolved\": [{}]\n}}", un.join(", ")));
    s
}

#[cfg(target_arch = "wasm32")]
pub mod wasm;
