//! TypeScript path aliases: `compilerOptions.paths` and `baseUrl` from the
//! nearest `tsconfig.json` (or `jsconfig.json`), following `extends`.
//!
//! The rules are TypeScript's own (the module resolution chapter of the
//! TypeScript handbook, "Path mapping"; `matchPatternOrExact` in the
//! compiler):
//!
//! - a file uses the nearest `tsconfig.json` above it, else the nearest
//!   `jsconfig.json` in the same directory;
//! - `extends` (a relative path, or an array of them, later entries winning)
//!   supplies `compilerOptions` the file does not set itself; each option is
//!   taken whole from the nearest config that sets it;
//! - `baseUrl` is relative to the config that sets it; `paths` targets are
//!   relative to the effective `baseUrl`, or, with none, to the config that
//!   sets `paths` (TypeScript 4.1 and later);
//! - a pattern holds at most one `*`; an exact pattern beats any wildcard
//!   one, and among wildcards the longest prefix wins; its targets are tried
//!   in order and the first that resolves to a file is used;
//! - with `baseUrl` set, a bare specifier no pattern matched is also tried
//!   as `baseUrl/<spec>`.
//!
//! A config is JSON with comments and trailing commas, so it is read with a
//! small tolerant reader rather than a JSON crate.

use super::{normalize, Files};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

// ---------------------------------------------------------------- JSONC

/// The parts of a JSON value a tsconfig needs.
#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Obj(Vec<(String, Json)>),
    Arr(Vec<Json>),
    Str(String),
    /// Numbers, booleans, null.
    Other,
}

impl Json {
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            // The last duplicate wins, as in JSON.parse.
            Json::Obj(v) => v.iter().rev().find(|(k, _)| k == key).map(|(_, v)| v),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Json::Str(s) => Some(s),
            _ => None,
        }
    }
}

struct Reader<'a> {
    b: &'a [u8],
    i: usize,
    depth: usize,
}

impl Reader<'_> {
    /// Skip whitespace and `//` / `/* */` comments.
    fn ws(&mut self) {
        loop {
            while self.i < self.b.len() && self.b[self.i].is_ascii_whitespace() {
                self.i += 1;
            }
            if self.b[self.i..].starts_with(b"//") {
                while self.i < self.b.len() && self.b[self.i] != b'\n' {
                    self.i += 1;
                }
            } else if self.b[self.i..].starts_with(b"/*") {
                match self.b[self.i + 2..].windows(2).position(|w| w == b"*/") {
                    Some(p) => self.i += p + 4,
                    None => self.i = self.b.len(),
                }
            } else {
                return;
            }
        }
    }

    fn string(&mut self) -> Option<String> {
        // At the opening quote.
        self.i += 1;
        let mut out: Vec<u8> = Vec::new();
        while self.i < self.b.len() {
            let c = self.b[self.i];
            self.i += 1;
            match c {
                b'"' => return String::from_utf8(out).ok(),
                b'\\' => {
                    let e = *self.b.get(self.i)?;
                    self.i += 1;
                    let ch = match e {
                        b'n' => '\n',
                        b't' => '\t',
                        b'r' => '\r',
                        b'b' => '\u{8}',
                        b'f' => '\u{c}',
                        b'u' => {
                            let hex = std::str::from_utf8(self.b.get(self.i..self.i + 4)?).ok()?;
                            self.i += 4;
                            let mut cp = u32::from_str_radix(hex, 16).ok()?;
                            // A surrogate pair spells one code point.
                            if (0xD800..0xDC00).contains(&cp)
                                && self.b[self.i..].starts_with(b"\\u")
                            {
                                let lo = std::str::from_utf8(self.b.get(self.i + 2..self.i + 6)?)
                                    .ok()
                                    .and_then(|h| u32::from_str_radix(h, 16).ok())?;
                                if (0xDC00..0xE000).contains(&lo) {
                                    self.i += 6;
                                    cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                                }
                            }
                            char::from_u32(cp).unwrap_or('\u{FFFD}')
                        }
                        other => other as char,
                    };
                    let mut buf = [0u8; 4];
                    out.extend_from_slice(ch.encode_utf8(&mut buf).as_bytes());
                }
                _ => out.push(c),
            }
        }
        None
    }

    fn value(&mut self) -> Option<Json> {
        self.ws();
        // Deep nesting is not a tsconfig; refuse it rather than recurse.
        if self.depth > 64 {
            return None;
        }
        match *self.b.get(self.i)? {
            b'{' => {
                self.i += 1;
                self.depth += 1;
                let mut v = Vec::new();
                loop {
                    self.ws();
                    match *self.b.get(self.i)? {
                        b'}' => {
                            self.i += 1;
                            break;
                        }
                        b',' => self.i += 1,
                        b'"' => {
                            let k = self.string()?;
                            self.ws();
                            if self.b.get(self.i) != Some(&b':') {
                                return None;
                            }
                            self.i += 1;
                            let val = self.value()?;
                            v.push((k, val));
                        }
                        _ => return None,
                    }
                }
                self.depth -= 1;
                Some(Json::Obj(v))
            }
            b'[' => {
                self.i += 1;
                self.depth += 1;
                let mut v = Vec::new();
                loop {
                    self.ws();
                    match *self.b.get(self.i)? {
                        b']' => {
                            self.i += 1;
                            break;
                        }
                        b',' => self.i += 1,
                        _ => v.push(self.value()?),
                    }
                }
                self.depth -= 1;
                Some(Json::Arr(v))
            }
            b'"' => self.string().map(Json::Str),
            _ => {
                let start = self.i;
                while self.i < self.b.len()
                    && !matches!(self.b[self.i], b',' | b'}' | b']' | b'/')
                    && !self.b[self.i].is_ascii_whitespace()
                {
                    self.i += 1;
                }
                (self.i > start).then_some(Json::Other)
            }
        }
    }
}

/// Read JSON with comments and trailing commas (tsconfig's dialect). None
/// when the text is not that.
pub fn parse_jsonc(src: &str) -> Option<Json> {
    let src = src.strip_prefix('\u{feff}').unwrap_or(src);
    let mut r = Reader {
        b: src.as_bytes(),
        i: 0,
        depth: 0,
    };
    let v = r.value()?;
    r.ws();
    (r.i == r.b.len()).then_some(v)
}

// ---------------------------------------------------------------- configs

/// The alias settings in effect for the files under one config.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PathMap {
    /// The resolved `baseUrl`, if any config in the chain sets one.
    pub base_url: Option<PathBuf>,
    /// The directory `paths` targets are relative to.
    pub paths_base: PathBuf,
    /// Pattern, then its targets in order.
    pub paths: Patterns,
}

/// `paths` patterns, each with its targets in order.
type Patterns = Vec<(String, Vec<String>)>;

/// What one config file sets, before `extends` is merged in.
#[derive(Default, Clone)]
struct Own {
    base_url: Option<PathBuf>,
    paths: Option<(PathBuf, Patterns)>,
}

fn read_own(fs: &dyn Files, file: &Path, seen: &mut Vec<PathBuf>) -> Option<Own> {
    if seen.contains(&file.to_path_buf()) || seen.len() > 16 {
        return None; // an extends loop, or a chain no project needs
    }
    seen.push(file.to_path_buf());
    let src = fs.read(file)?;
    let json = parse_jsonc(&String::from_utf8_lossy(&src))?;
    let dir = file.parent().unwrap_or(Path::new("")).to_path_buf();

    // Parents first, later array entries overriding earlier ones.
    let mut merged = Own::default();
    let parents: Vec<&str> = match json.get("extends") {
        Some(Json::Str(s)) => vec![s.as_str()],
        Some(Json::Arr(v)) => v.iter().filter_map(|x| x.as_str()).collect(),
        _ => Vec::new(),
    };
    for p in parents {
        // A package (`@tsconfig/node18`) lives in node_modules; its
        // settings carry no project aliases, so it is not read.
        if !(p.starts_with("./") || p.starts_with("../") || p.starts_with('/')) {
            continue;
        }
        let mut f = normalize(&dir.join(p));
        if !fs.is_file(&f) && !p.ends_with(".json") {
            f = PathBuf::from(format!("{}.json", f.display()));
        }
        if let Some(o) = read_own(fs, &f, seen) {
            if o.base_url.is_some() {
                merged.base_url = o.base_url;
            }
            if o.paths.is_some() {
                merged.paths = o.paths;
            }
        }
    }

    let co = json.get("compilerOptions");
    if let Some(b) = co.and_then(|c| c.get("baseUrl")).and_then(|b| b.as_str()) {
        merged.base_url = Some(normalize(&dir.join(b)));
    }
    if let Some(Json::Obj(v)) = co.and_then(|c| c.get("paths")) {
        let list = v
            .iter()
            .filter(|(k, _)| k.matches('*').count() <= 1)
            .map(|(k, t)| {
                let targets = match t {
                    Json::Arr(a) => a
                        .iter()
                        .filter_map(|x| x.as_str().map(String::from))
                        .collect(),
                    Json::Str(s) => vec![s.clone()],
                    _ => Vec::new(),
                };
                (k.clone(), targets)
            })
            .collect();
        merged.paths = Some((dir, list));
    }
    Some(merged)
}

/// Read one config file and everything it extends into a [`PathMap`]. None
/// when it sets neither `paths` nor `baseUrl`, or cannot be read.
pub fn load(fs: &dyn Files, file: &Path) -> Option<PathMap> {
    let own = read_own(fs, file, &mut Vec::new())?;
    if own.base_url.is_none() && own.paths.is_none() {
        return None;
    }
    let (pdir, paths) = own.paths.unwrap_or_default();
    Some(PathMap {
        paths_base: own.base_url.clone().unwrap_or(pdir),
        base_url: own.base_url,
        paths,
    })
}

/// Where a bare specifier may live under a [`PathMap`].
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Lookup {
    /// Files to try, in TypeScript's order.
    pub tries: Vec<PathBuf>,
    /// A `paths` pattern with a real prefix matched and none of its targets
    /// points into `node_modules`: if no try resolves, the alias is broken
    /// (TypeScript reports it), not a package.
    pub strict: bool,
}

fn in_node_modules(p: &Path) -> bool {
    p.components().any(|c| c.as_os_str() == "node_modules")
}

impl PathMap {
    /// The pattern TypeScript picks for `spec`: an exact one, else the
    /// wildcard with the longest prefix. Returns its targets and the text
    /// the `*` matched.
    fn pick(&self, spec: &str) -> Option<(&str, &[String], String)> {
        let mut best: Option<(&str, &[String], String)> = None;
        let mut best_len = 0;
        for (pat, targets) in &self.paths {
            match pat.split_once('*') {
                None if pat == spec => return Some((pat, targets, String::new())),
                None => {}
                Some((pre, suf)) => {
                    let fits = spec.len() >= pre.len() + suf.len()
                        && spec.starts_with(pre)
                        && spec.ends_with(suf);
                    if fits && (best.is_none() || pre.len() > best_len) {
                        best_len = pre.len();
                        best = Some((
                            pat,
                            targets,
                            spec[pre.len()..spec.len() - suf.len()].to_string(),
                        ));
                    }
                }
            }
        }
        best
    }

    /// The files a bare specifier may be, in the order TypeScript tries
    /// them. Targets in `node_modules` and `.d.ts` declarations are left
    /// out: they describe packages, not project source.
    pub fn lookup(&self, spec: &str) -> Lookup {
        let mut out = Lookup::default();
        if let Some((pat, targets, star)) = self.pick(spec) {
            let mut any_package = false;
            for t in targets {
                let p = normalize(&self.paths_base.join(t.replacen('*', &star, 1)));
                if in_node_modules(&p) || t.ends_with(".d.ts") {
                    any_package = true;
                    continue;
                }
                out.tries.push(p);
            }
            out.strict = !pat.starts_with('*') && !any_package;
        }
        if let Some(b) = &self.base_url {
            out.tries.push(normalize(&b.join(spec)));
        }
        out
    }
}

/// Finds and caches the config in effect for each directory. Shared across
/// the parallel resolve, so it locks; each directory is looked up once.
#[derive(Debug, Default)]
pub struct Configs {
    enabled: bool,
    by_dir: Mutex<HashMap<PathBuf, Option<Arc<PathMap>>>>,
}

impl Configs {
    pub fn new(enabled: bool) -> Self {
        Configs {
            enabled,
            by_dir: Mutex::new(HashMap::new()),
        }
    }

    /// The alias map for a file at `from`, if one applies.
    pub fn for_file(&self, fs: &dyn Files, from: &Path) -> Option<Arc<PathMap>> {
        if !self.enabled {
            return None;
        }
        self.for_dir(fs, from.parent().unwrap_or(Path::new("")))
    }

    fn for_dir(&self, fs: &dyn Files, dir: &Path) -> Option<Arc<PathMap>> {
        if let Some(hit) = self.by_dir.lock().unwrap().get(dir) {
            return hit.clone();
        }
        let found = if fs.is_file(&dir.join("tsconfig.json")) {
            // The nearest tsconfig decides, even when it sets no aliases.
            load(fs, &dir.join("tsconfig.json")).map(Arc::new)
        } else if fs.is_file(&dir.join("jsconfig.json")) {
            load(fs, &dir.join("jsconfig.json")).map(Arc::new)
        } else {
            match dir.parent() {
                // Lexical parents only: a path given as `src` stops at `.`.
                Some(p) if dir != Path::new("") && !dir.ends_with("..") => self.for_dir(fs, p),
                _ => None,
            }
        };
        self.by_dir
            .lock()
            .unwrap()
            .insert(dir.to_path_buf(), found.clone());
        found
    }
}
