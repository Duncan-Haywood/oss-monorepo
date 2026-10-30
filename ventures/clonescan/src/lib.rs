//! clonescan: a token-based copy-paste detector.
//!
//! The pipeline is the one jscpd and PMD CPD use, arranged so every stage
//! but the last is embarrassingly parallel:
//!
//! 1. **Tokenize** each file (whitespace and comments dropped, so a copy that
//!    was re-indented or re-commented still matches).
//! 2. **Hash every window** of `min_tokens` consecutive tokens with a
//!    polynomial rolling hash (Rabin-Karp).
//! 3. **Sort** all `(hash, file, position)` triples, so equal windows sit
//!    next to each other. Each window in a group is paired with the group's
//!    first occurrence, after checking the tokens really are equal.
//! 4. **Merge** pairs that sit on the same diagonal (both sides advance by
//!    one token) into maximal clones.
//!
//! Matching is exact on token text by default, so renamed identifiers are not
//! matched (jscpd's default "mild" mode behaves the same way). With
//! `normalize` on, identifiers, strings and numbers are replaced by their
//! kind before hashing, which finds copies whose names or constants changed
//! (the "type-2" clones of the literature).

use rayon::prelude::*;
use std::fmt::Write as _;
#[cfg(feature = "cli")]
use std::path::PathBuf;

/// One token: a hash of its text and the lines it starts and ends on.
#[derive(Clone, Copy, Debug)]
pub struct Token {
    pub hash: u64,
    pub line: u32,
    pub end_line: u32,
}

/// How a language writes comments. Strings are handled for all of them.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CommentStyle {
    /// `//` and `/* */` (JavaScript, TypeScript, C, C++, Java, Go, Rust, C#, ...)
    CLike,
    /// `#` (Python, shell, Ruby, YAML, TOML, ...)
    Hash,
}

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub fn comment_style_for(path: &str) -> CommentStyle {
    let ext = path.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    match ext.as_str() {
        "py" | "pyi" | "sh" | "bash" | "zsh" | "rb" | "yaml" | "yml" | "toml" | "pl" | "r"
        | "cmake" | "tf" | "nix" => CommentStyle::Hash,
        _ => CommentStyle::CLike,
    }
}

#[inline]
fn fnv1a(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for &b in bytes {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    // Never 0, so a zero can't make the rolling hash ignore a token.
    h | 1
}

#[inline]
fn is_ident_start(b: u8) -> bool {
    b.is_ascii_alphabetic() || b == b'_' || b == b'$' || b >= 0x80
}

#[inline]
fn is_ident_char(b: u8) -> bool {
    is_ident_start(b) || b.is_ascii_digit()
}

/// Split source text into tokens. Whitespace and comments are skipped.
///
/// The lexer is deliberately language-agnostic: it knows identifiers,
/// numbers, quoted strings (including Python triple quotes and JavaScript
/// template literals with `${}`), comments, and treats every other byte as
/// a one-byte punctuation token. It never fails: malformed input still
/// produces tokens, and an unterminated `'` or `"` string stops at the end
/// of its line. Regex literals are lexed as punctuation and identifiers;
/// both copies of a pasted regex lex the same way, so they still match.
pub fn tokenize(src: &[u8], style: CommentStyle) -> Vec<Token> {
    tokenize_with(src, style, false)
}

/// Words kept as themselves in normalised mode, so `if (a) {` does not match
/// `for (a) {`. One list for every language the generic lexer reads; a word
/// that is a keyword in one language and a name in another stays a keyword,
/// which only makes matching stricter, never looser.
const KEYWORDS: &[&str] = &[
    "abstract",
    "and",
    "as",
    "async",
    "await",
    "begin",
    "bool",
    "boolean",
    "break",
    "case",
    "catch",
    "char",
    "class",
    "const",
    "continue",
    "def",
    "default",
    "defer",
    "del",
    "do",
    "double",
    "elif",
    "else",
    "elsif",
    "end",
    "enum",
    "except",
    "export",
    "extends",
    "false",
    "fi",
    "final",
    "finally",
    "float",
    "fn",
    "for",
    "foreach",
    "from",
    "fun",
    "func",
    "function",
    "go",
    "if",
    "impl",
    "implements",
    "import",
    "in",
    "instanceof",
    "int",
    "interface",
    "is",
    "lambda",
    "let",
    "long",
    "loop",
    "match",
    "mod",
    "mut",
    "namespace",
    "new",
    "nil",
    "none",
    "not",
    "null",
    "or",
    "pass",
    "private",
    "protected",
    "pub",
    "public",
    "raise",
    "rescue",
    "return",
    "self",
    "short",
    "static",
    "string",
    "struct",
    "super",
    "switch",
    "then",
    "this",
    "throw",
    "throws",
    "trait",
    "true",
    "try",
    "type",
    "typeof",
    "undefined",
    "unless",
    "until",
    "use",
    "val",
    "var",
    "void",
    "when",
    "where",
    "while",
    "with",
    "yield",
];

fn is_keyword(word: &[u8]) -> bool {
    std::str::from_utf8(word).is_ok_and(|w| {
        KEYWORDS
            .binary_search(&w.to_ascii_lowercase().as_str())
            .is_ok()
    })
}

/// Like [`tokenize`]; with `normalize`, every identifier that is not a
/// keyword hashes as one placeholder, every string and template literal as
/// another, and every number as a third.
pub fn tokenize_with(src: &[u8], style: CommentStyle, normalize: bool) -> Vec<Token> {
    let mut out = Vec::with_capacity(src.len() / 4);
    let n = src.len();
    let mut i = 0usize;
    let mut line: u32 = 1;
    while i < n {
        let b = src[i];
        if b == b'\n' {
            line += 1;
            i += 1;
            continue;
        }
        if b.is_ascii_whitespace() {
            i += 1;
            continue;
        }
        // Comments.
        if style == CommentStyle::CLike && b == b'/' && i + 1 < n {
            if src[i + 1] == b'/' {
                while i < n && src[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if src[i + 1] == b'*' {
                i += 2;
                while i < n && !(src[i] == b'*' && i + 1 < n && src[i + 1] == b'/') {
                    if src[i] == b'\n' {
                        line += 1;
                    }
                    i += 1;
                }
                i = (i + 2).min(n);
                continue;
            }
        }
        if style == CommentStyle::Hash && b == b'#' {
            while i < n && src[i] != b'\n' {
                i += 1;
            }
            continue;
        }
        let start = i;
        let start_line = line;
        let mut kind = 0u8; // 0 punctuation, 1 identifier, 2 number, 3 string
        if is_ident_start(b) {
            kind = 1;
            while i < n && is_ident_char(src[i]) {
                i += 1;
            }
        } else if b.is_ascii_digit() {
            kind = 2;
            while i < n && (src[i].is_ascii_alphanumeric() || src[i] == b'.' || src[i] == b'_') {
                i += 1;
            }
        } else if b == b'`' {
            kind = 3;
            i = scan_template(src, i + 1, &mut line);
        } else if (b == b'"' || b == b'\'')
            && style == CommentStyle::Hash
            && i + 2 < n
            && src[i + 1] == b
            && src[i + 2] == b
        {
            // Python triple-quoted string.
            kind = 3;
            i += 3;
            while i < n && !(src[i] == b && i + 2 < n && src[i + 1] == b && src[i + 2] == b) {
                if src[i] == b'\\' {
                    i += 1;
                } else if src[i] == b'\n' {
                    line += 1;
                }
                i += 1;
            }
            i = (i + 3).min(n);
        } else if b == b'"' || b == b'\'' {
            kind = 3;
            i += 1;
            while i < n && src[i] != b && src[i] != b'\n' {
                if src[i] == b'\\' && i + 1 < n && src[i + 1] != b'\n' {
                    i += 1;
                }
                i += 1;
            }
            if i < n && src[i] == b {
                i += 1;
            }
        } else {
            i += 1;
        }
        let i_end = i.min(n);
        let text = &src[start..i_end];
        let hash = match kind {
            1 if normalize && !is_keyword(text) => fnv1a(b"\0id"),
            2 if normalize => fnv1a(b"\0num"),
            3 if normalize => fnv1a(b"\0str"),
            _ => fnv1a(text),
        };
        out.push(Token {
            hash,
            line: start_line,
            end_line: line,
        });
        i = i_end;
    }
    out
}

/// Scan a template literal body starting just after the opening backtick.
/// Returns the index just past the closing backtick (or `n`).
fn scan_template(src: &[u8], mut i: usize, line: &mut u32) -> usize {
    let n = src.len();
    while i < n {
        match src[i] {
            b'\\' => i += 2,
            b'`' => return i + 1,
            b'\n' => {
                *line += 1;
                i += 1;
            }
            b'$' if i + 1 < n && src[i + 1] == b'{' => {
                i += 2;
                let mut depth = 1usize;
                while i < n && depth > 0 {
                    match src[i] {
                        b'{' => depth += 1,
                        b'}' => depth -= 1,
                        b'`' => {
                            i = scan_template(src, i + 1, line);
                            continue;
                        }
                        b'\n' => *line += 1,
                        _ => {}
                    }
                    i += 1;
                }
            }
            _ => i += 1,
        }
    }
    n
}

/// A tokenized source file.
pub struct SourceFile {
    pub path: String,
    pub lines: u32,
    pub tokens: Vec<Token>,
}

impl SourceFile {
    pub fn from_bytes(path: impl Into<String>, src: &[u8]) -> Self {
        Self::from_bytes_with(path, src, false)
    }

    /// As [`from_bytes`](Self::from_bytes), optionally normalising tokens
    /// (see [`tokenize_with`]).
    pub fn from_bytes_with(path: impl Into<String>, src: &[u8], normalize: bool) -> Self {
        let path = path.into();
        let style = comment_style_for(&path);
        let lines = src.iter().filter(|&&b| b == b'\n').count() as u32
            + u32::from(!src.is_empty() && *src.last().unwrap() != b'\n');
        SourceFile {
            tokens: tokenize_with(src, style, normalize),
            lines,
            path,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Options {
    /// Smallest clone, in tokens. jscpd's default is 50.
    pub min_tokens: usize,
    /// Smallest clone, in lines (checked on both sides). jscpd's default is 5.
    pub min_lines: u32,
    /// Tokens were normalised when the files were read (report only: set
    /// the same flag on `WalkOptions` or `SourceFile::from_bytes_with`).
    pub normalize: bool,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            min_tokens: 50,
            min_lines: 5,
            normalize: false,
        }
    }
}

/// One side of a clone: a token range `[start, end)` in a file.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Span {
    pub file: u32,
    pub start: u32,
    pub end: u32,
}

/// A duplicated block. `first` is the earlier occurrence (by path order),
/// `second` the copy.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Clone_ {
    pub first: Span,
    pub second: Span,
}

impl Clone_ {
    pub fn tokens(&self) -> u32 {
        self.second.end - self.second.start
    }
}

const BASE: u64 = 0x100_0000_01b3;

/// Find clones across `files`. Results are deterministic for a given file
/// order: sorted by the copy's file and position.
pub fn detect(files: &[SourceFile], opts: Options) -> Vec<Clone_> {
    let w = opts.min_tokens.max(1);
    // BASE^(w-1), to remove the outgoing token from the rolling hash.
    let mut pow = 1u64;
    for _ in 1..w {
        pow = pow.wrapping_mul(BASE);
    }

    // Stage 2: hash every window.
    let mut entries: Vec<(u64, u32, u32)> = files
        .par_iter()
        .enumerate()
        .flat_map_iter(|(fi, f)| {
            let t = &f.tokens;
            let mut v = Vec::with_capacity(t.len().saturating_sub(w - 1));
            if t.len() >= w {
                let mut h = 0u64;
                for tok in &t[..w] {
                    h = h.wrapping_mul(BASE).wrapping_add(tok.hash);
                }
                v.push((h, fi as u32, 0u32));
                for p in 1..=(t.len() - w) {
                    h = h
                        .wrapping_sub(t[p - 1].hash.wrapping_mul(pow))
                        .wrapping_mul(BASE)
                        .wrapping_add(t[p + w - 1].hash);
                    v.push((h, fi as u32, p as u32));
                }
            }
            v.into_iter()
        })
        .collect();

    // Stage 3: sort so equal windows are adjacent, then pair each window
    // with its group's first occurrence.
    entries.par_sort_unstable();
    let mut bounds = Vec::new();
    let mut s = 0;
    for i in 1..=entries.len() {
        if i == entries.len() || entries[i].0 != entries[s].0 {
            if i - s >= 2 {
                bounds.push((s, i));
            }
            s = i;
        }
    }
    let same = |a: (u32, u32), b: (u32, u32)| {
        let ta = &files[a.0 as usize].tokens[a.1 as usize..a.1 as usize + w];
        let tb = &files[b.0 as usize].tokens[b.1 as usize..b.1 as usize + w];
        ta.iter().zip(tb).all(|(x, y)| x.hash == y.hash)
    };
    let mut pairs: Vec<(u32, u32, u32, u32)> = bounds
        .par_iter()
        .flat_map_iter(|&(s, e)| {
            let g = &entries[s..e];
            let (_, fa, pa) = g[0];
            g[1..]
                .iter()
                .filter(move |&&(_, fb, pb)| {
                    !(fa == fb && (pb - pa) < w as u32) && same((fa, pa), (fb, pb))
                })
                .map(move |&(_, fb, pb)| (fb, fa, pb, pa))
                .collect::<Vec<_>>()
                .into_iter()
        })
        .collect();
    drop(entries);

    // Stage 4: merge runs on the same diagonal into maximal clones.
    pairs.par_sort_unstable_by_key(|&(fb, fa, pb, pa)| (fb, fa, pb as i64 - pa as i64, pb));
    let mut clones = Vec::new();
    let mut i = 0;
    while i < pairs.len() {
        let (fb, fa, pb0, pa0) = pairs[i];
        let mut j = i;
        while j + 1 < pairs.len() {
            let (nfb, nfa, npb, npa) = pairs[j + 1];
            let (_, _, cpb, cpa) = pairs[j];
            if nfb == fb && nfa == fa && npb == cpb + 1 && npa == cpa + 1 {
                j += 1;
            } else {
                break;
            }
        }
        let len = (pairs[j].2 - pb0) + w as u32;
        let c = Clone_ {
            first: Span {
                file: fa,
                start: pa0,
                end: pa0 + len,
            },
            second: Span {
                file: fb,
                start: pb0,
                end: pb0 + len,
            },
        };
        // A same-file run can overlap itself (a block repeated back to back):
        // every window in it still has a copy at least `w` tokens earlier, so
        // it is kept, as PMD CPD does.
        if span_lines(files, c.first) >= opts.min_lines
            && span_lines(files, c.second) >= opts.min_lines
        {
            clones.push(c);
        }
        i = j + 1;
    }
    clones.sort_by_key(|c| (c.second.file, c.second.start, c.first.file, c.first.start));
    clones
}

/// First and last line a token span covers.
pub fn span_line_range(files: &[SourceFile], s: Span) -> (u32, u32) {
    let t = &files[s.file as usize].tokens;
    (t[s.start as usize].line, t[s.end as usize - 1].end_line)
}

pub fn span_lines(files: &[SourceFile], s: Span) -> u32 {
    let (a, b) = span_line_range(files, s);
    b - a + 1
}

#[derive(Debug, Default, Clone, Copy)]
pub struct Stats {
    pub files: usize,
    pub lines: u64,
    pub tokens: u64,
    pub clones: usize,
    /// Lines inside at least one copy (the `second` side), each counted once.
    pub duplicated_lines: u64,
    /// Tokens inside at least one copy, each counted once.
    pub duplicated_tokens: u64,
}

impl Stats {
    pub fn duplicated_percent(&self) -> f64 {
        if self.lines == 0 {
            0.0
        } else {
            100.0 * self.duplicated_lines as f64 / self.lines as f64
        }
    }
}

/// Totals, with duplicated lines and tokens counted as a union so a block
/// copied ten times is not counted as ten times its size per copy.
pub fn stats(files: &[SourceFile], clones: &[Clone_]) -> Stats {
    let mut by_file: Vec<Vec<Span>> = vec![Vec::new(); files.len()];
    for c in clones {
        by_file[c.second.file as usize].push(c.second);
    }
    let (dl, dt) = by_file
        .par_iter()
        .enumerate()
        .map(|(fi, spans)| {
            if spans.is_empty() {
                return (0u64, 0u64);
            }
            let f = &files[fi];
            let mut lines = vec![false; f.lines as usize + 2];
            let mut toks = vec![false; f.tokens.len()];
            for s in spans {
                let (a, b) = span_line_range(files, *s);
                for l in a..=b {
                    if let Some(x) = lines.get_mut(l as usize) {
                        *x = true;
                    }
                }
                for t in &mut toks[s.start as usize..s.end as usize] {
                    *t = true;
                }
            }
            (
                lines.iter().filter(|&&x| x).count() as u64,
                toks.iter().filter(|&&x| x).count() as u64,
            )
        })
        .reduce(|| (0, 0), |a, b| (a.0 + b.0, a.1 + b.1));
    Stats {
        files: files.len(),
        lines: files.iter().map(|f| f.lines as u64).sum(),
        tokens: files.iter().map(|f| f.tokens.len() as u64).sum(),
        clones: clones.len(),
        duplicated_lines: dl,
        duplicated_tokens: dt,
    }
}

/// Which files to read.
#[cfg(feature = "cli")]
#[derive(Clone, Debug)]
pub struct WalkOptions {
    pub extensions: Vec<String>,
    /// Skip files larger than this many bytes (jscpd's default is 100 KB).
    pub max_size: u64,
    /// Skip files with more lines than this (jscpd's default is 1000).
    pub max_lines: u32,
    pub respect_gitignore: bool,
    pub ignore_dirs: Vec<String>,
    /// Hash identifiers, strings and numbers by kind (finds renamed copies).
    pub normalize: bool,
}

#[cfg(feature = "cli")]
pub const DEFAULT_EXTENSIONS: &[&str] = &[
    "js", "mjs", "cjs", "jsx", "ts", "tsx", "mts", "cts", "py", "rs", "go", "java", "kt", "c", "h",
    "cc", "cpp", "hpp", "cs", "rb", "php", "swift", "scala", "sh", "css", "scss",
];

#[cfg(feature = "cli")]
impl Default for WalkOptions {
    fn default() -> Self {
        WalkOptions {
            extensions: DEFAULT_EXTENSIONS.iter().map(|s| s.to_string()).collect(),
            max_size: 100 * 1024,
            max_lines: 1000,
            respect_gitignore: true,
            ignore_dirs: vec!["node_modules".into(), ".git".into(), "target".into()],
            normalize: false,
        }
    }
}

#[cfg(feature = "cli")]
/// Walk `roots`, read and tokenize matching files in parallel. Files come
/// back sorted by path so results are reproducible.
pub fn load(roots: &[PathBuf], w: &WalkOptions) -> Vec<SourceFile> {
    let mut paths: Vec<PathBuf> = Vec::new();
    for root in roots {
        if root.is_file() {
            paths.push(root.clone());
            continue;
        }
        let mut b = ignore::WalkBuilder::new(root);
        b.git_ignore(w.respect_gitignore)
            .git_exclude(w.respect_gitignore)
            .git_global(false)
            .ignore(w.respect_gitignore)
            .hidden(true)
            .parents(w.respect_gitignore);
        let dirs = w.ignore_dirs.clone();
        b.filter_entry(move |e| {
            !(e.file_type().is_some_and(|t| t.is_dir())
                && dirs.iter().any(|d| e.file_name() == d.as_str()))
        });
        for e in b.build().flatten() {
            if !e.file_type().is_some_and(|t| t.is_file()) {
                continue;
            }
            let p = e.path();
            let ok = p
                .extension()
                .and_then(|x| x.to_str())
                .is_some_and(|x| w.extensions.iter().any(|want| want.eq_ignore_ascii_case(x)));
            if ok {
                paths.push(p.to_path_buf());
            }
        }
    }
    paths.sort();
    paths.dedup();
    let mut files = paths
        .par_iter()
        .filter_map(|p| {
            let meta = std::fs::metadata(p).ok()?;
            if meta.len() > w.max_size {
                return None;
            }
            let src = std::fs::read(p).ok()?;
            let f =
                SourceFile::from_bytes_with(p.to_string_lossy().into_owned(), &src, w.normalize);
            (f.lines <= w.max_lines).then_some(f)
        })
        .collect::<Vec<_>>();
    // Order by the path string, as the browser build does, so "first" and
    // "second" mean the same in both (component order differs: `a-b/x` vs `a/b`).
    files.sort_by(|a, b| a.path.cmp(&b.path));
    files
}

fn json_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", c as u32);
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

fn json_span(out: &mut String, files: &[SourceFile], s: Span) {
    let (a, b) = span_line_range(files, s);
    out.push_str("{\"file\":");
    json_str(out, &files[s.file as usize].path);
    let _ = write!(out, ",\"start_line\":{a},\"end_line\":{b}}}");
}

/// The JSON report the CLI prints with `--json` and the browser build returns.
pub fn json_report(
    files: &[SourceFile],
    clones: &[Clone_],
    st: &Stats,
    opts: Options,
    secs: f64,
) -> String {
    let mut o = String::new();
    let _ = write!(
        o,
        "{{\"statistics\":{{\"files\":{},\"lines\":{},\"tokens\":{},\"clones\":{},\"duplicated_lines\":{},\"duplicated_tokens\":{},\"duplicated_percent\":{:.4},\"seconds\":{:.3}}},\"options\":{{\"min_tokens\":{},\"min_lines\":{},\"normalize\":{}}},\"clones\":[",
        st.files, st.lines, st.tokens, st.clones, st.duplicated_lines, st.duplicated_tokens,
        st.duplicated_percent(), secs, opts.min_tokens, opts.min_lines, opts.normalize
    );
    for (i, c) in clones.iter().enumerate() {
        if i > 0 {
            o.push(',');
        }
        let _ = write!(
            o,
            "{{\"tokens\":{},\"lines\":{},\"first\":",
            c.tokens(),
            span_lines(files, c.second)
        );
        json_span(&mut o, files, c.first);
        o.push_str(",\"second\":");
        json_span(&mut o, files, c.second);
        o.push('}');
    }
    o.push_str("]}");
    o
}
