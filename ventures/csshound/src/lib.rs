//! csshound: which CSS rules does a page never use?
//!
//! The decision rules follow PurgeCSS 9.1.0 with its default options
//! (`lib/purgecss.js`: `defaultExtractor`, `shouldKeepSelector`,
//! `isAttributeFound`, `evaluateRule`), so the same CSS and content give the
//! same list of removable selectors:
//!
//! * the content is cut into words with `[A-Za-z0-9_-]+`, and a class, id,
//!   tag or attribute name counts as used when it is one of those words;
//! * a selector is unused when any class, id, tag or attribute in it (outside
//!   pseudo-class arguments) is not found; pseudo-classes, pseudo-elements,
//!   combinators, `*` and `&` never make a selector unused;
//! * selectors inside `:is()` and `:where()` are judged on their own, and a
//!   selector whose `:is()`/`:where()` loses every argument goes too;
//!   selectors inside any other pseudo-class (`:not()`, `:has()`, ...) are
//!   always kept, as is a lone `:is()`/`:where()`/`:has()`/`:not()` at the top;
//! * `[value]`, `[checked]`, `[selected]` and `[open]` are always kept
//!   (script changes them); rules inside `@keyframes` are never judged;
//! * the `purgecss start ignore` / `end ignore`, `purgecss ignore` (next rule)
//!   and `purgecss ignore current` comments are honoured.
//!
//! What PurgeCSS does not do by default, csshound does not do either: unused
//! `@keyframes`, `@font-face` and custom properties are left alone.

pub mod page;
#[cfg(target_arch = "wasm32")]
mod wasm;

use std::collections::HashSet;

/// The words PurgeCSS's default extractor finds in content:
/// `content.match(/[A-Za-z0-9_-]+/g)`.
pub fn words(content: &str) -> HashSet<&str> {
    let b = content.as_bytes();
    let mut out = HashSet::new();
    let mut i = 0;
    while i < b.len() {
        if is_word(b[i]) {
            let s = i;
            while i < b.len() && is_word(b[i]) {
                i += 1;
            }
            out.insert(&content[s..i]);
        } else {
            i += 1;
        }
    }
    out
}

#[inline]
fn is_word(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_' || c == b'-'
}

/// One style rule found in a stylesheet, in document order.
#[derive(Debug, Clone)]
pub struct Rule {
    /// The selector list as written, trimmed.
    pub selector: String,
    /// Byte offset of the rule in the stylesheet.
    pub start: usize,
    /// Bytes of the rule's own text (selector, braces and declarations),
    /// not counting the rules nested in it.
    pub own_bytes: usize,
    /// Directly inside an `@keyframes` (never judged).
    pub in_keyframes: bool,
    /// Kept by a `purgecss ignore` annotation.
    pub ignored: bool,
}

/// Every style rule in `css`, including rules nested in at-rules and in other
/// rules (CSS nesting).
pub fn parse_rules(css: &str) -> Vec<Rule> {
    let mut p = Parser { s: css.as_bytes(), src: css, ignore: false, out: Vec::new() };
    p.block(0, false, false);
    p.out
}

struct Parser<'a> {
    s: &'a [u8],
    src: &'a str,
    ignore: bool,
    out: Vec<Rule>,
}

impl<'a> Parser<'a> {
    /// Parse the items of a block starting at `i`; returns the index after
    /// the closing brace (or the end). `in_brace` says a `}` ends it.
    fn block(&mut self, mut i: usize, in_brace: bool, keyframes: bool) -> usize {
        let s = self.s;
        let mut next_ignored = false;
        loop {
            while i < s.len() && s[i].is_ascii_whitespace() {
                i += 1;
            }
            if i >= s.len() {
                return i;
            }
            match s[i] {
                b'}' => {
                    if in_brace {
                        return i + 1;
                    }
                    i += 1; // a stray brace at the top level
                }
                b'/' if s.get(i + 1) == Some(&b'*') => {
                    let end = comment_end(s, i);
                    let text = &self.src[i..end];
                    if text.contains("purgecss start ignore") {
                        self.ignore = true;
                    } else if text.contains("purgecss end ignore") {
                        self.ignore = false;
                    } else if text.contains("purgecss ignore") {
                        next_ignored = true;
                    }
                    i = end;
                    continue; // a comment does not reset `next_ignored`
                }
                b'@' => {
                    let mut j = i + 1;
                    while j < s.len() && (is_word(s[j]) || s[j] >= 0x80) {
                        j += 1;
                    }
                    let name = self.src[i + 1..j].to_ascii_lowercase();
                    let stop = scan(s, j, b"{;}");
                    if stop < s.len() && s[stop] == b'{' {
                        i = self.block(stop + 1, true, name.ends_with("keyframes"));
                    } else if stop < s.len() && s[stop] == b';' {
                        i = stop + 1;
                    } else {
                        i = stop;
                    }
                }
                _ => {
                    let stop = scan(s, i, b"{;}");
                    if stop < s.len() && s[stop] == b'{' {
                        let idx = self.out.len();
                        let ignored = self.ignore || next_ignored;
                        self.out.push(Rule {
                            selector: self.src[i..stop].trim().to_string(),
                            start: i,
                            own_bytes: 0,
                            in_keyframes: keyframes,
                            ignored,
                        });
                        let end = self.block(stop + 1, true, false);
                        let nested: usize = {
                            // own text = the whole span minus direct and deeper
                            // nested rules' own text (they were pushed after us)
                            self.out[idx + 1..].iter().map(|r| r.own_bytes).sum()
                        };
                        let r = &mut self.out[idx];
                        r.own_bytes = (end - i).saturating_sub(nested);
                        if !r.ignored && self.src[stop..end].contains("purgecss ignore current") {
                            r.ignored = true;
                        }
                        i = end;
                    } else if stop < s.len() && s[stop] == b';' {
                        i = stop + 1;
                    } else {
                        i = stop; // a last declaration without `;`
                    }
                }
            }
            next_ignored = false;
        }
    }
}

fn comment_end(s: &[u8], i: usize) -> usize {
    let mut j = i + 2;
    while j + 1 < s.len() {
        if s[j] == b'*' && s[j + 1] == b'/' {
            return j + 2;
        }
        j += 1;
    }
    s.len()
}

/// Index of the first byte of `stops` at nesting depth 0 from `i`, skipping
/// strings, escapes, comments and bracketed groups; `s.len()` if none.
fn scan(s: &[u8], mut i: usize, stops: &[u8]) -> usize {
    let mut depth = 0usize;
    while i < s.len() {
        let c = s[i];
        match c {
            b'\\' => {
                i += 2;
                continue;
            }
            b'"' | b'\'' => {
                i = string_end(s, i);
                continue;
            }
            b'/' if s.get(i + 1) == Some(&b'*') => {
                i = comment_end(s, i);
                continue;
            }
            _ if depth == 0 && stops.contains(&c) => return i,
            b'(' | b'[' => depth += 1,
            b')' | b']' => depth = depth.saturating_sub(1),
            _ => {}
        }
        i += 1;
    }
    s.len()
}

fn string_end(s: &[u8], i: usize) -> usize {
    let q = s[i];
    let mut j = i + 1;
    while j < s.len() {
        if s[j] == b'\\' {
            j += 2;
            continue;
        }
        if s[j] == q || s[j] == b'\n' {
            return j + 1;
        }
        j += 1;
    }
    s.len()
}

/// Split at top-level commas.
fn split_list(text: &str) -> Vec<&str> {
    let s = text.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    loop {
        let stop = scan(s, start, b",");
        out.push(&text[start..stop]);
        if stop >= s.len() {
            return out;
        }
        start = stop + 1;
    }
}

#[derive(Debug, PartialEq)]
enum Node<'a> {
    Class(String),
    Id(String),
    Tag(String),
    Attr { name: String, op: Option<String>, value: Option<String> },
    Pseudo { name: String, arg: Option<&'a str> },
    Other,
}

/// Read a CSS identifier from `i`, unescaping it; returns (value, end).
fn ident(text: &str, mut i: usize) -> (String, usize) {
    let s = text.as_bytes();
    let mut v = String::new();
    while i < s.len() {
        let c = s[i];
        if c == b'\\' {
            let (ch, n) = unescape(text, i);
            if let Some(ch) = ch {
                v.push(ch);
            }
            i = n;
        } else if is_word(c) || c >= 0x80 || c == b'%' {
            let ch_len = utf8_len(c);
            v.push_str(&text[i..(i + ch_len).min(s.len())]);
            i += ch_len;
        } else {
            break;
        }
    }
    (v, i)
}

fn utf8_len(c: u8) -> usize {
    match c {
        0xF0..=0xFF => 4,
        0xE0..=0xEF => 3,
        0xC0..=0xDF => 2,
        _ => 1,
    }
}

/// A CSS escape at `i` (`\` + 1-6 hex digits + one optional space, or `\` +
/// one character); returns the character and the index after the escape.
fn unescape(text: &str, i: usize) -> (Option<char>, usize) {
    let s = text.as_bytes();
    let mut j = i + 1;
    let mut n = 0u32;
    let mut digits = 0;
    while j < s.len() && digits < 6 && s[j].is_ascii_hexdigit() {
        n = n * 16 + (s[j] as char).to_digit(16).unwrap();
        j += 1;
        digits += 1;
    }
    if digits > 0 {
        if j < s.len() && (s[j] == b' ' || s[j] == b'\t' || s[j] == b'\n') {
            j += 1;
        }
        return (char::from_u32(n).or(Some('\u{FFFD}')), j);
    }
    if j >= s.len() {
        return (None, j);
    }
    let len = utf8_len(s[j]);
    let ch = text[j..(j + len).min(s.len())].chars().next();
    (ch, j + len)
}

/// The nodes of one complex selector (no commas at top level).
fn parse_selector(text: &str) -> Vec<Node<'_>> {
    let s = text.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < s.len() {
        let c = s[i];
        match c {
            b' ' | b'\t' | b'\n' | b'\r' | b'\x0c' | b'>' | b'+' | b'~' => {
                while i < s.len() && matches!(s[i], b' ' | b'\t' | b'\n' | b'\r' | b'\x0c' | b'>' | b'+' | b'~') {
                    i += 1;
                }
                out.push(Node::Other); // combinator
            }
            b'/' if s.get(i + 1) == Some(&b'*') => i = comment_end(s, i),
            b'.' => {
                let (v, n) = ident(text, i + 1);
                out.push(Node::Class(v));
                i = n.max(i + 1);
            }
            b'#' => {
                let (v, n) = ident(text, i + 1);
                out.push(Node::Id(v));
                i = n.max(i + 1);
            }
            b'[' => {
                let end = scan(s, i + 1, b"]");
                out.push(parse_attr(&text[i + 1..end.min(s.len())]));
                i = end + 1;
            }
            b':' => {
                let mut j = i + 1;
                if s.get(j) == Some(&b':') {
                    j += 1;
                }
                let (v, n) = ident(text, j);
                let name = format!("{}{}", &text[i..j], v).to_ascii_lowercase();
                let mut arg = None;
                let mut k = n.max(j);
                if s.get(k) == Some(&b'(') {
                    let end = scan(s, k + 1, b")");
                    arg = Some(&text[k + 1..end.min(s.len())]);
                    k = end + 1;
                }
                out.push(Node::Pseudo { name, arg });
                i = k;
            }
            b'*' | b'&' | b'|' => {
                out.push(Node::Other);
                i += 1;
            }
            _ => {
                let (v, n) = ident(text, i);
                if n == i {
                    i += 1; // a character we do not model
                } else {
                    // `ns|tag`: the tag is what follows the bar
                    if s.get(n) == Some(&b'|') && s.get(n + 1) != Some(&b'=') {
                        i = n;
                        continue;
                    }
                    out.push(Node::Tag(v));
                    i = n;
                }
            }
        }
    }
    out
}

fn parse_attr(inner: &str) -> Node<'static> {
    let s = inner.as_bytes();
    let mut i = 0;
    while i < s.len() && s[i].is_ascii_whitespace() {
        i += 1;
    }
    let (mut name, mut n) = ident(inner, i);
    if s.get(n) == Some(&b'|') && s.get(n + 1) != Some(&b'=') {
        let (v, m) = ident(inner, n + 1);
        name = v;
        n = m;
    }
    let mut i = n;
    while i < s.len() && s[i].is_ascii_whitespace() {
        i += 1;
    }
    let op_start = i;
    while i < s.len() && matches!(s[i], b'~' | b'|' | b'^' | b'$' | b'*' | b'=') {
        i += 1;
    }
    if i == op_start {
        return Node::Attr { name, op: None, value: None };
    }
    let op = inner[op_start..i].to_string();
    while i < s.len() && s[i].is_ascii_whitespace() {
        i += 1;
    }
    let value = if i < s.len() && (s[i] == b'"' || s[i] == b'\'') {
        let q = s[i];
        let mut v = String::new();
        let mut j = i + 1;
        while j < s.len() && s[j] != q {
            if s[j] == b'\\' {
                let (ch, m) = unescape(inner, j);
                if let Some(ch) = ch {
                    v.push(ch);
                }
                j = m;
            } else {
                let l = utf8_len(s[j]);
                v.push_str(&inner[j..(j + l).min(s.len())]);
                j += l;
            }
        }
        v
    } else {
        let mut j = i;
        let mut v = String::new();
        while j < s.len() && !s[j].is_ascii_whitespace() {
            if s[j] == b'\\' {
                let (ch, m) = unescape(inner, j);
                if let Some(ch) = ch {
                    v.push(ch);
                }
                j = m;
            } else {
                let l = utf8_len(s[j]);
                v.push_str(&inner[j..(j + l).min(s.len())]);
                j += l;
            }
        }
        v
    };
    Node::Attr { name, op: Some(op), value: Some(value) }
}

const DYNAMIC_ATTRIBUTES: [&str; 4] = ["value", "checked", "selected", "open"];

/// Judges selectors against the words of the content.
pub struct Judge<'w> {
    words: &'w HashSet<&'w str>,
    safelist: &'w HashSet<String>,
    /// Name prefixes the content builds names from at run time
    /// (`dynamic_prefixes`); empty in PurgeCSS mode.
    prefixes: Vec<&'w str>,
    /// Selectors PurgeCSS would report as rejected, in the order met.
    pub rejected: Vec<String>,
}

struct Verdict {
    kept: bool,
    deep_empty: bool,
}

impl<'w> Judge<'w> {
    pub fn new(words: &'w HashSet<&'w str>, safelist: &'w HashSet<String>) -> Self {
        Judge { words, safelist, prefixes: Vec::new(), rejected: Vec::new() }
    }

    /// Also count a class or id as used when it starts with one of `prefixes`.
    pub fn with_prefixes(mut self, prefixes: Vec<&'w str>) -> Self {
        self.prefixes = prefixes;
        self
    }

    /// Judge a rule's selector list; true when the whole rule goes.
    pub fn rule_is_dead(&mut self, selector_list: &str) -> bool {
        let mut any_left = false;
        for sel in split_list(selector_list) {
            let v = self.selector(sel, None, false, true);
            if v.kept && !v.deep_empty {
                any_left = true;
            }
        }
        !any_left
    }

    fn list(&mut self, text: &str, parent: &str, inside_not: bool) -> (usize, bool) {
        let mut kept = 0;
        let mut deep_empty = false;
        for sel in split_list(text) {
            let v = self.selector(sel, Some(parent), inside_not, false);
            if v.kept {
                kept += 1;
                deep_empty |= v.deep_empty;
            }
        }
        (kept, deep_empty)
    }

    fn selector(&mut self, raw: &str, parent: Option<&str>, inside_not: bool, at_root: bool) -> Verdict {
        let text = raw.trim();
        let nodes = parse_selector(text);
        let kept = self.keep(text, &nodes, parent, inside_not, at_root);
        if !kept {
            self.rejected.push(text.to_string());
        }
        // PurgeCSS walks into a selector's pseudo-class arguments whether or
        // not the selector itself was removed.
        let mut deep_empty = false;
        for node in &nodes {
            if let Node::Pseudo { name, arg: Some(arg) } = node {
                let is_or_where = name == ":is" || name == ":where";
                let (k, d) = self.list(arg, name, inside_not || name == ":not");
                if (is_or_where && k == 0) || d {
                    deep_empty = true;
                }
            }
        }
        Verdict { kept, deep_empty }
    }

    fn keep(&self, text: &str, nodes: &[Node], parent: Option<&str>, inside_not: bool, at_root: bool) -> bool {
        if let Some(p) = parent {
            if p != ":is" && p != ":where" {
                return true;
            }
            if inside_not {
                return true;
            }
        }
        if at_root && nodes.len() == 1 && matches!(nodes[0], Node::Pseudo { .. }) {
            let low = text.to_ascii_lowercase();
            if [":where", ":is", ":has", ":not"].iter().any(|p| low.contains(p)) {
                return true;
            }
        }
        for node in nodes {
            let found = match node {
                Node::Class(v) | Node::Id(v) => {
                    self.safelist.contains(v)
                        || self.words.contains(v.as_str())
                        || self.prefixes.iter().any(|p| v.len() > p.len() && v.starts_with(p))
                }
                Node::Tag(v) => self.safelist.contains(v) || self.words.contains(v.as_str()),
                Node::Attr { name, op, value } => {
                    if self.safelist.contains(name) || DYNAMIC_ATTRIBUTES.contains(&name.as_str()) {
                        true
                    } else {
                        self.attr_found(name, op.as_deref(), value.as_deref())
                    }
                }
                _ => true,
            };
            if !found {
                return false;
            }
        }
        true
    }

    fn attr_found(&self, name: &str, op: Option<&str>, value: Option<&str>) -> bool {
        if !self.words.contains(name) {
            return false;
        }
        let (Some(op), Some(value)) = (op, value) else { return true };
        match op {
            "=" => self.words.contains(value),
            "$=" => self.words.iter().any(|w| w.ends_with(value)),
            "^=" | "|=" => self.words.iter().any(|w| w.starts_with(value)),
            "~=" | "*=" => value
                .trim()
                .split(' ')
                .all(|part| self.words.iter().any(|w| w.contains(part))),
            _ => true,
        }
    }
}

/// What csshound found in one stylesheet.
#[derive(Debug, Default, Clone)]
pub struct Report {
    pub css_bytes: usize,
    pub rules: usize,
    pub dead_rules: usize,
    /// Bytes of the rules that would go entirely.
    pub dead_bytes: usize,
    /// Unique rejected selectors, sorted.
    pub rejected: Vec<String>,
    /// (byte offset, selector list) of each rule that would go entirely.
    pub dead: Vec<(usize, String)>,
}

/// Name prefixes that content glues to a value at run time: the word right
/// before a template hole (`cls-${x}`) or right before a closing quote that
/// a `+` follows (`"cls-" + x`), when it ends in `-` or `_`. A class such as
/// `.cls-Star` is then possibly used even though `cls-Star` is never written
/// out. PurgeCSS has no such rule; its docs ask authors to write class names
/// in full instead.
pub fn dynamic_prefixes(content: &str) -> Vec<&str> {
    let b = content.as_bytes();
    let mut out: Vec<&str> = Vec::new();
    let mut push = |end: usize| {
        let mut s = end;
        while s > 0 && is_word(b[s - 1]) {
            s -= 1;
        }
        // at least two characters before the joining `-` or `_`
        if end >= s + 3 && (b[end - 1] == b'-' || b[end - 1] == b'_') {
            out.push(&content[s..end]);
        }
    };
    let mut i = 0;
    while i + 1 < b.len() {
        if b[i] == b'$' && b[i + 1] == b'{' {
            push(i);
        } else if b[i] == b'"' || b[i] == b'\'' || b[i] == b'`' {
            let mut j = i + 1;
            while j < b.len() && (b[j] == b' ' || b[j] == b'\t') {
                j += 1;
            }
            if j < b.len() && b[j] == b'+' && b.get(j + 1) != Some(&b'+') {
                push(i);
            }
        }
        i += 1;
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// How to judge: PurgeCSS's rules exactly, or with csshound's extras.
#[derive(Debug, Default, Clone)]
pub struct Options {
    pub safelist: HashSet<String>,
    /// Keep classes and ids that start with a prefix from `dynamic_prefixes`.
    pub dynamic_prefixes: bool,
}

/// Judge every rule of `css` against `content` with PurgeCSS's rules exactly.
pub fn analyse(css: &str, content: &str, safelist: &HashSet<String>) -> Report {
    analyse_with(css, content, &Options { safelist: safelist.clone(), dynamic_prefixes: false })
}

/// Judge every rule of `css` against `content`.
pub fn analyse_with(css: &str, content: &str, opts: &Options) -> Report {
    let w = words(content);
    let prefixes = if opts.dynamic_prefixes { dynamic_prefixes(content) } else { Vec::new() };
    let mut judge = Judge::new(&w, &opts.safelist).with_prefixes(prefixes);
    let mut rep = Report { css_bytes: css.len(), ..Default::default() };
    for rule in parse_rules(css) {
        if rule.in_keyframes || rule.ignored {
            continue;
        }
        rep.rules += 1;
        if judge.rule_is_dead(&rule.selector) {
            rep.dead_rules += 1;
            rep.dead_bytes += rule.own_bytes;
            rep.dead.push((rule.start, rule.selector.clone()));
        }
    }
    let mut seen = HashSet::new();
    let mut rejected: Vec<String> = judge.rejected.into_iter().filter(|s| seen.insert(s.clone())).collect();
    rejected.sort();
    rep.rejected = rejected;
    rep
}

/// A JSON string literal.
pub fn json_str(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
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

/// The report as one JSON object, named `page`: what `--json` prints per page.
pub fn report_json(page: &str, r: &Report, with_dead: bool) -> String {
    let rejected: Vec<String> = r.rejected.iter().map(|s| json_str(s)).collect();
    let mut out = format!(
        "{{\"page\":{},\"css_bytes\":{},\"rules\":{},\"dead_rules\":{},\"dead_bytes\":{},\"rejected\":[{}]",
        json_str(page),
        r.css_bytes,
        r.rules,
        r.dead_rules,
        r.dead_bytes,
        rejected.join(",")
    );
    if with_dead {
        let dead: Vec<String> = r
            .dead
            .iter()
            .map(|(off, sel)| format!("{{\"offset\":{off},\"selector\":{}}}", json_str(sel)))
            .collect();
        out.push_str(&format!(",\"dead\":[{}]", dead.join(",")));
    }
    out.push('}');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_escapes() {
        assert_eq!(json_str("a\"b\\c\n"), "\"a\\\"b\\\\c\\n\"");
    }

    fn rej(css: &str, content: &str) -> Vec<String> {
        analyse(css, content, &HashSet::new()).rejected
    }

    #[test]
    fn words_match_the_default_extractor() {
        let w = words("<div class=\"a-b c_d\">x:y</div>");
        for t in ["div", "class", "a-b", "c_d", "x", "y"] {
            assert!(w.contains(t), "{t}");
        }
        assert!(!w.contains("x:y"));
    }

    #[test]
    fn nested_and_at_rules() {
        let css = "@media (max-width:600px){.a{color:red}.b{x:y}} .c{ .d{x:y} &:hover{x:y} }";
        assert_eq!(rej(css, "a c"), vec![".b", ".d"]);
    }

    #[test]
    fn prefixes_from_templates_and_concatenation() {
        let js = "`<td class=\"cls-${x}\">` + 'tier-' + t + \"a-\" + b; x = \"no-\"; y = `${a}`";
        assert_eq!(dynamic_prefixes(js), vec!["cls-", "tier-"]);
        let o = Options { dynamic_prefixes: true, ..Default::default() };
        let r = analyse_with(".cls-Star{} .cls-{} .other{}", js, &o);
        assert_eq!(r.rejected, vec![".other"]); // `cls-` itself is a word
    }

    #[test]
    fn own_bytes_exclude_nested() {
        let css = ".c{x:y; .d{x:y}}";
        let r = parse_rules(css);
        assert_eq!(r[0].own_bytes + r[1].own_bytes, css.len());
        assert_eq!(r[1].own_bytes, ".d{x:y}".len());
    }
}
