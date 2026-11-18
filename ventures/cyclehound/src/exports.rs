//! Unused exports: which names a module exports, which names its importers
//! take, and the exports nobody takes (the job of `ts-unused-exports` and
//! knip's "unused exports" check, done on the same lexer as the cycle check).
//!
//! The rules, all decided per file from its token stream:
//!
//! - `import d, { a, b as c } from "x"` takes `default` and `a` from x.
//! - `import * as ns from "x"`, `import("x")` and `require("x")` take every
//!   export of x (member access on the namespace is not followed).
//! - `import "x"` takes nothing.
//! - `export { a as b } from "x"` exports `b` and, when someone takes `b`,
//!   takes `a` from x; `export * as ns from "x"` exports `ns` and takes all
//!   of x when someone takes `ns`.
//! - `export * from "x"` forwards every name the file is asked for that it
//!   does not export itself (never `default`, as in the language).
//!
//! A name used only inside its own file is still an unused export: the
//! `export` keyword is what is unused.

use super::{clause_from, resolve_with, tokenize, type_only, Files, Graph, Kind, Resolve, Tok};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};

/// What one import statement takes from its target.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Uses {
    /// Named bindings (`default` for a default import).
    Names(Vec<String>),
    /// Everything: a namespace import, `import()`, `require()`.
    All,
    /// `import "x"`: run for its side effects, takes no name.
    SideEffect,
    /// `export { theirs as ours } from "x"`; `theirs` is `*` for
    /// `export * as ours from "x"`.
    ReExport(Vec<(String, String)>),
    /// `export * from "x"`.
    Star,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModImport {
    pub spec: String,
    pub line: u32,
    pub uses: Uses,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Export {
    pub name: String,
    pub line: u32,
}

/// One file's exports and what it takes from other files.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Shape {
    pub imports: Vec<ModImport>,
    pub exports: Vec<Export>,
}

fn ident<'a>(t: &[Tok<'a>], k: usize) -> Option<&'a str> {
    t.get(k).filter(|x| x.kind == Kind::Ident).map(|x| x.text)
}

fn punct(t: &[Tok], k: usize, c: u8) -> bool {
    matches!(t.get(k), Some(x) if x.kind == Kind::Punct(c))
}

/// Split a `{ ... }` clause starting at the `{` at `k` into
/// `(name, alias)` pairs. Returns the pairs and the index after `}`.
fn brace_items(t: &[Tok], k: usize) -> Option<(Vec<(String, String)>, usize)> {
    if !punct(t, k, b'{') {
        return None;
    }
    let mut out = Vec::new();
    let mut item: Vec<&Tok> = Vec::new();
    let mut k = k + 1;
    let flush = |item: &mut Vec<&Tok>, out: &mut Vec<(String, String)>| {
        let mut it: &[&Tok] = item;
        // `type V` inside braces marks one item type-only.
        if it.len() >= 2 && it[0].kind == Kind::Ident && it[0].text == "type" && it[1].text != "as"
        {
            it = &it[1..];
        }
        if let Some(first) = it.first() {
            if matches!(first.kind, Kind::Ident | Kind::Str) {
                let name = first.text.to_string();
                let alias = match (it.get(1), it.get(2)) {
                    (Some(a), Some(b))
                        if a.text == "as" && matches!(b.kind, Kind::Ident | Kind::Str) =>
                    {
                        b.text.to_string()
                    }
                    _ => name.clone(),
                };
                out.push((name, alias));
            }
        }
        item.clear();
    };
    while k < t.len() {
        match t[k].kind {
            Kind::Punct(b'}') => {
                flush(&mut item, &mut out);
                return Some((out, k + 1));
            }
            Kind::Punct(b',') => flush(&mut item, &mut out),
            Kind::Ident | Kind::Str => item.push(&t[k]),
            _ => return None,
        }
        k += 1;
    }
    None
}

/// Binding names in a destructuring pattern starting at `{` or `[` at `k`.
/// Returns them and the index after the closing bracket.
fn pattern_names(t: &[Tok], k: usize, out: &mut Vec<(String, u32)>) -> usize {
    let mut depth = 0i32;
    let mut k = k;
    while k < t.len() {
        let tok = &t[k];
        match tok.kind {
            Kind::Punct(b'{') | Kind::Punct(b'[') | Kind::Punct(b'(') => depth += 1,
            Kind::Punct(b'}') | Kind::Punct(b']') | Kind::Punct(b')') => {
                depth -= 1;
                if depth == 0 {
                    return k + 1;
                }
            }
            Kind::Ident => {
                let prev_ok = k > 0
                    && matches!(
                        t[k - 1].kind,
                        Kind::Punct(b'{')
                            | Kind::Punct(b'[')
                            | Kind::Punct(b',')
                            | Kind::Punct(b':')
                    )
                    || (k > 0 && t[k - 1].kind == Kind::Punct(b'.'));
                // `...rest` reaches here through the dot before it.
                let next_colon = punct(t, k + 1, b':');
                if prev_ok && !next_colon {
                    out.push((tok.text.to_string(), tok.line));
                }
            }
            _ => {}
        }
        k += 1;
    }
    k
}

const STATEMENT_START: &[&str] = &[
    "export", "import", "const", "let", "var", "function", "class", "if", "for", "while", "return",
    "throw", "try", "switch", "async",
];

/// `const a = 1, { b } = o, c;` after `const`/`let`/`var` at `k`.
fn declarators(t: &[Tok], k: usize, out: &mut Vec<(String, u32)>) {
    let mut k = k;
    loop {
        match t.get(k) {
            Some(x) if x.kind == Kind::Ident => {
                out.push((x.text.to_string(), x.line));
                k += 1;
            }
            Some(x) if matches!(x.kind, Kind::Punct(b'{') | Kind::Punct(b'[')) => {
                k = pattern_names(t, k, out);
            }
            _ => return,
        }
        // Skip the initializer to a top-level `,` (another declarator) or
        // the end of the statement.
        let mut depth = 0i32;
        let limit = (k + 20000).min(t.len());
        let start = k;
        loop {
            if k >= limit {
                return;
            }
            let tok = &t[k];
            match tok.kind {
                Kind::Punct(b'(') | Kind::Punct(b'[') | Kind::Punct(b'{') => depth += 1,
                Kind::Punct(b')') | Kind::Punct(b']') | Kind::Punct(b'}') => {
                    depth -= 1;
                    if depth < 0 {
                        return;
                    }
                }
                Kind::Punct(b';') if depth == 0 => return,
                Kind::Punct(b',') if depth == 0 => {
                    k += 1;
                    break;
                }
                Kind::Ident
                    if depth == 0
                        && k > start
                        && STATEMENT_START.contains(&tok.text)
                        && t[k - 1].kind != Kind::Punct(b'.')
                        && !matches!(t[k - 1].kind, Kind::Punct(b'=') | Kind::Punct(b'(')) =>
                {
                    // A new statement after automatic semicolon insertion.
                    return;
                }
                _ => {}
            }
            k += 1;
        }
    }
}

/// The exports of `export ...` at token `j` (local declarations and
/// re-export clauses), and the import record of a re-export.
fn parse_export(t: &[Tok], j: usize, sh: &mut Shape) {
    let line = t[j].line;
    let mut k = j + 1;
    let Some(next) = t.get(k) else { return };
    // `export * from`, `export * as ns from`, `export { ... } [from]`, and
    // their `type` forms.
    let opens = punct(t, k, b'{')
        || punct(t, k, b'*')
        || (ident(t, k) == Some("type") && (punct(t, k + 1, b'{') || punct(t, k + 1, b'*')));
    if opens {
        let typ = type_only(t, k);
        if typ {
            k += 1;
        }
        let spec = clause_from(t, k);
        if punct(t, k, b'*') {
            let Some(s) = spec else { return };
            let mut uses = Uses::Star;
            if ident(t, k + 1) == Some("as") {
                if let Some(ns) = t
                    .get(k + 2)
                    .filter(|x| matches!(x.kind, Kind::Ident | Kind::Str))
                {
                    sh.exports.push(Export {
                        name: ns.text.to_string(),
                        line: ns.line,
                    });
                    uses = Uses::ReExport(vec![("*".into(), ns.text.to_string())]);
                }
            }
            sh.imports.push(ModImport {
                spec: t[s].text.to_string(),
                line,
                uses,
            });
            return;
        }
        let Some((items, _)) = brace_items(t, k) else {
            return;
        };
        for (_, alias) in &items {
            sh.exports.push(Export {
                name: alias.clone(),
                line,
            });
        }
        if let Some(s) = spec {
            sh.imports.push(ModImport {
                spec: t[s].text.to_string(),
                line,
                uses: Uses::ReExport(items),
            });
        }
        return;
    }
    let _ = next;
    // Modifiers that come before the declaration keyword.
    while let Some(w) = ident(t, k) {
        if matches!(w, "declare" | "async" | "abstract") {
            k += 1;
        } else {
            break;
        }
    }
    let mut names: Vec<(String, u32)> = Vec::new();
    match ident(t, k) {
        Some("default") => names.push(("default".into(), t[k].line)),
        Some("function") => {
            k += 1;
            if punct(t, k, b'*') {
                k += 1;
            }
            if let Some(n) = ident(t, k) {
                names.push((n.into(), t[k].line));
            }
        }
        Some("class" | "interface" | "enum" | "namespace" | "module") => {
            if let Some(n) = ident(t, k + 1) {
                names.push((n.into(), t[k + 1].line));
            }
        }
        Some("type") => {
            if let Some(n) = ident(t, k + 1) {
                names.push((n.into(), t[k + 1].line));
            }
        }
        Some("const") if ident(t, k + 1) == Some("enum") => {
            if let Some(n) = ident(t, k + 2) {
                names.push((n.into(), t[k + 2].line));
            }
        }
        Some("const" | "let" | "var" | "using") => declarators(t, k + 1, &mut names),
        // TypeScript `export import A = B.C`.
        Some("import") => {
            if let Some(n) = ident(t, k + 1) {
                if punct(t, k + 2, b'=') {
                    names.push((n.into(), t[k + 1].line));
                }
            }
        }
        _ => {}
    }
    for (name, line) in names {
        sh.exports.push(Export { name, line });
    }
}

/// `const { a, b: c } = await import("x")` takes `a` and `b`. Returns the
/// keys when the dynamic import at `j` is destructured that way (a rest
/// element or a computed key means anything may be taken).
fn destructured(t: &[Tok], j: usize) -> Option<Vec<String>> {
    if j < 4 || ident(t, j - 1) != Some("await") || !punct(t, j - 2, b'=') || !punct(t, j - 3, b'}')
    {
        return None;
    }
    // Walk back to the matching `{`.
    let mut depth = 0i32;
    let mut k = j - 3;
    loop {
        match t[k].kind {
            Kind::Punct(b'}') => depth += 1,
            Kind::Punct(b'{') => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
            }
            _ => {}
        }
        if k == 0 {
            return None;
        }
        k -= 1;
    }
    if !matches!(ident(t, k.wrapping_sub(1)), Some("const" | "let" | "var")) {
        return None;
    }
    let mut keys = Vec::new();
    let mut depth = 0i32;
    for q in k..j - 3 {
        match t[q].kind {
            Kind::Punct(b'.') | Kind::Punct(b'[') if depth == 1 => return None,
            Kind::Punct(b'{') | Kind::Punct(b'[') | Kind::Punct(b'(') => depth += 1,
            Kind::Punct(b'}') | Kind::Punct(b']') | Kind::Punct(b')') => depth -= 1,
            Kind::Ident | Kind::Str
                if depth == 1 && matches!(t[q - 1].kind, Kind::Punct(b'{') | Kind::Punct(b',')) =>
            {
                keys.push(t[q].text.to_string())
            }
            _ => {}
        }
    }
    Some(keys)
}

/// Parse `import ...` at token `j`.
fn parse_import(t: &[Tok], j: usize, sh: &mut Shape) {
    let line = t[j].line;
    // import("x")
    if punct(t, j + 1, b'(') {
        if matches!(t.get(j + 2), Some(x) if x.kind == Kind::Str)
            && (punct(t, j + 3, b')') || punct(t, j + 3, b','))
        {
            sh.imports.push(ModImport {
                spec: t[j + 2].text.to_string(),
                line,
                uses: destructured(t, j).map(Uses::Names).unwrap_or(Uses::All),
            });
        }
        return;
    }
    // import "x"
    if matches!(t.get(j + 1), Some(x) if x.kind == Kind::Str) {
        sh.imports.push(ModImport {
            spec: t[j + 1].text.to_string(),
            line,
            uses: Uses::SideEffect,
        });
        return;
    }
    let mut k = j + 1;
    let Some(s) = clause_from(t, k) else { return };
    if type_only(t, k) {
        k += 1;
    }
    let mut names = Vec::new();
    let mut all = false;
    while k < s - 1 {
        match t[k].kind {
            Kind::Punct(b'*') => {
                all = true;
                k += 1;
            }
            Kind::Punct(b'{') => match brace_items(t, k) {
                Some((items, after)) => {
                    names.extend(items.into_iter().map(|(n, _)| n));
                    k = after;
                }
                None => return,
            },
            Kind::Ident if t[k].text == "as" => k += 2,
            Kind::Ident => {
                names.push("default".to_string());
                k += 1;
            }
            _ => k += 1,
        }
    }
    sh.imports.push(ModImport {
        spec: t[s].text.to_string(),
        line,
        uses: if all { Uses::All } else { Uses::Names(names) },
    });
}

/// Exports and imports-with-names of one source file.
pub fn extract_shape(src: &str) -> Shape {
    let t = tokenize(src);
    let mut sh = Shape::default();
    for (j, tok) in t.iter().enumerate() {
        if tok.kind != Kind::Ident || (j > 0 && t[j - 1].kind == Kind::Punct(b'.')) {
            continue;
        }
        match tok.text {
            "import" => parse_import(&t, j, &mut sh),
            "export" => parse_export(&t, j, &mut sh),
            "require"
                if punct(&t, j + 1, b'(')
                    && matches!(t.get(j + 2), Some(x) if x.kind == Kind::Str)
                    && punct(&t, j + 3, b')') =>
            {
                sh.imports.push(ModImport {
                    spec: t[j + 2].text.to_string(),
                    line: tok.line,
                    uses: Uses::All,
                })
            }
            _ => {}
        }
    }
    // One entry per name (a re-export clause and an overload list can name
    // it twice); keep the first line.
    let mut seen = HashSet::new();
    sh.exports.retain(|e| seen.insert(e.name.clone()));
    sh
}

/// An export nobody takes.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct Unused {
    pub file: usize,
    pub line: u32,
    pub name: String,
}

#[derive(Default)]
struct Taken {
    all: bool,
    names: HashSet<String>,
}

/// The exports of `g`'s first `among` files (the starting set) that no file
/// in the graph takes. Files nothing imports are skipped unless
/// `include_entries`: their exports are what an outside caller (a page, a
/// package user, a test runner) reaches for, which the graph cannot see.
pub fn unused_exports(
    fs: &dyn Files,
    g: &Graph,
    among: usize,
    exts: &[String],
    include_entries: bool,
) -> Vec<Unused> {
    let n = g.files.len();
    let index: HashMap<&std::path::Path, usize> = g
        .files
        .iter()
        .enumerate()
        .map(|(i, p)| (p.as_path(), i))
        .collect();
    // Parse every file again for names, and resolve each import to a node.
    let shapes: Vec<(Shape, Vec<Option<usize>>)> = g
        .files
        .par_iter()
        .map(|p| {
            let Some(bytes) = fs.read(p) else {
                return (Shape::default(), Vec::new());
            };
            let sh = extract_shape(&String::from_utf8_lossy(&bytes));
            let to = sh
                .imports
                .iter()
                .map(|im| match resolve_with(fs, &g.configs, p, &im.spec, exts) {
                    Resolve::File(q) => index.get(q.as_path()).copied(),
                    _ => None,
                })
                .collect();
            (sh, to)
        })
        .collect();
    let own: Vec<HashSet<&str>> = shapes
        .iter()
        .map(|(sh, _)| sh.exports.iter().map(|e| e.name.as_str()).collect())
        .collect();

    let mut taken: Vec<Taken> = (0..n).map(|_| Taken::default()).collect();
    let mut imported = vec![false; n];
    // Work list of (file, Some(name) | None for everything).
    let mut work: Vec<(usize, Option<String>)> = Vec::new();
    for (sh, to) in &shapes {
        for (im, &t) in sh.imports.iter().zip(to) {
            let Some(t) = t else { continue };
            imported[t] = true;
            match &im.uses {
                Uses::All => work.push((t, None)),
                Uses::Names(v) => work.extend(v.iter().map(|x| (t, Some(x.clone())))),
                _ => {}
            }
        }
    }
    while let Some((f, name)) = work.pop() {
        let tk = &mut taken[f];
        if tk.all {
            continue;
        }
        match &name {
            None => tk.all = true,
            Some(x) => {
                if !tk.names.insert(x.clone()) {
                    continue;
                }
            }
        }
        // Pass the request on through this file's re-exports.
        let (sh, to) = &shapes[f];
        for (im, &t) in sh.imports.iter().zip(to) {
            let Some(t) = t else { continue };
            match &im.uses {
                Uses::ReExport(pairs) => {
                    for (theirs, ours) in pairs {
                        if name.is_none() || name.as_deref() == Some(ours.as_str()) {
                            work.push((
                                t,
                                if theirs == "*" {
                                    None
                                } else {
                                    Some(theirs.clone())
                                },
                            ));
                        }
                    }
                }
                Uses::Star => match &name {
                    None => work.push((t, None)),
                    Some(x) if x != "default" && !own[f].contains(x.as_str()) => {
                        work.push((t, Some(x.clone())))
                    }
                    _ => {}
                },
                _ => {}
            }
        }
    }

    let mut out = Vec::new();
    for f in 0..among.min(n) {
        if taken[f].all || (!imported[f] && !include_entries) {
            continue;
        }
        for e in &shapes[f].0.exports {
            if !taken[f].names.contains(&e.name) {
                out.push(Unused {
                    file: f,
                    line: e.line,
                    name: e.name.clone(),
                });
            }
        }
    }
    out.sort_by(|a, b| {
        g.files[a.file]
            .cmp(&g.files[b.file])
            .then(a.line.cmp(&b.line))
            .then(a.name.cmp(&b.name))
    });
    out
}
