//! Turning an HTML page into (CSS, content), the way
//! `tests/bench/purgecss_pages.mjs` does for PurgeCSS:
//!
//! * the CSS is every `<style>` block, then every local stylesheet the page
//!   links with `<link rel="stylesheet" href="...">`;
//! * the content is the page with its `<style>` blocks cut out (otherwise
//!   every selector would find itself), then every local script it loads with
//!   `<script src="...">`.
//!
//! "Local" means a relative path to a file that exists; URLs with a scheme
//! and root-relative paths (`/x.css`) are skipped, since the site root is
//! not known.

use std::fs;
use std::path::{Component, Path, PathBuf};

pub struct Page {
    pub css: String,
    pub content: String,
}

fn find_ci(hay: &[u8], needle: &[u8], from: usize) -> Option<usize> {
    if needle.len() > hay.len() {
        return None;
    }
    (from..=hay.len() - needle.len()).find(|&i| hay[i..i + needle.len()].eq_ignore_ascii_case(needle))
}

fn is_word_byte(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'_'
}

/// The end of the first `</name\s*>` at or after `from` (`name` given as
/// `</name`), and where it starts.
fn find_close(b: &[u8], close_tag: &[u8], from: usize) -> Option<(usize, usize)> {
    let mut j = from;
    while let Some(c) = find_ci(b, close_tag, j) {
        let mut k = c + close_tag.len();
        while k < b.len() && b[k].is_ascii_whitespace() {
            k += 1;
        }
        if k < b.len() && b[k] == b'>' {
            return Some((c, k + 1));
        }
        j = c + 1;
    }
    None
}

/// An open tag `<name\b[^>]*>` at `at`: the index just past its `>`.
fn open_tag_end(b: &[u8], at: usize, name_len: usize) -> Option<usize> {
    let after = at + name_len;
    if after < b.len() && is_word_byte(b[after]) {
        return None;
    }
    b[after..].iter().position(|&c| c == b'>').map(|p| after + p + 1)
}

/// `html` with its `<style>` elements cut out, and their bodies, the way the
/// harness's `/<!--[\s\S]*?-->|<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi`
/// reads a page: a `<style>` inside a comment or a script (a string that
/// builds markup, say) is text, not a style element, as an HTML parser has it.
pub fn split_styles(html: &str) -> (String, Vec<String>) {
    let b = html.as_bytes();
    let mut kept = String::with_capacity(html.len());
    let mut bodies = Vec::new();
    let mut last = 0;
    let mut i = 0;
    while i < b.len() {
        let Some(at) = b[i..].iter().position(|&c| c == b'<').map(|p| i + p) else { break };
        let rest = &b[at..];
        if rest.starts_with(b"<!--") {
            if let Some(p) = find_ci(b, b"-->", at + 4) {
                i = p + 3;
                continue;
            }
        } else if rest.len() >= 7 && rest[..7].eq_ignore_ascii_case(b"<script") {
            if let Some(gt) = open_tag_end(b, at, 7) {
                if let Some((_, end)) = find_close(b, b"</script", gt) {
                    i = end;
                    continue;
                }
            }
        } else if rest.len() >= 6 && rest[..6].eq_ignore_ascii_case(b"<style") {
            if let Some(body_start) = open_tag_end(b, at, 6) {
                if let Some((c, end)) = find_close(b, b"</style", body_start) {
                    kept.push_str(&html[last..at]);
                    bodies.push(html[body_start..c].to_string());
                    last = end;
                    i = end;
                    continue;
                }
            }
        }
        i = at + 1;
    }
    kept.push_str(&html[last..]);
    (kept, bodies)
}

/// Every `<name\b[^>]*>` open tag in `html`.
fn tags<'a>(html: &'a str, name: &str) -> Vec<&'a str> {
    let b = html.as_bytes();
    let open = format!("<{name}");
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(at) = find_ci(b, open.as_bytes(), i) {
        let after = at + open.len();
        if after < b.len() && is_word_byte(b[after]) {
            i = at + 1;
            continue;
        }
        match b[after..].iter().position(|&c| c == b'>') {
            Some(p) => {
                out.push(&html[at..after + p + 1]);
                i = after + p + 1;
            }
            None => break,
        }
    }
    out
}

/// The first `\sname\s*=\s*value` in a tag, as the harness's regex reads it.
pub fn attr(tag: &str, name: &str) -> Option<String> {
    let b = tag.as_bytes();
    let n = name.len();
    let mut i = 0;
    while i + n < b.len() {
        if b[i].is_ascii_whitespace() && b[i + 1..].len() >= n && b[i + 1..i + 1 + n].eq_ignore_ascii_case(name.as_bytes()) {
            let mut j = i + 1 + n;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < b.len() && b[j] == b'=' {
                j += 1;
                while j < b.len() && b[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < b.len() && (b[j] == b'"' || b[j] == b'\'') {
                    let q = b[j];
                    if let Some(e) = b[j + 1..].iter().position(|&c| c == q) {
                        return Some(tag[j + 1..j + 1 + e].to_string());
                    }
                } else {
                    let s = j;
                    while j < b.len() && !b[j].is_ascii_whitespace() && b[j] != b'>' {
                        j += 1;
                    }
                    if j > s {
                        return Some(tag[s..j].to_string());
                    }
                }
            }
        }
        i += 1;
    }
    None
}

/// A reference resolved to an existing local file next to the page.
pub fn local_path(dir: &Path, reference: &str) -> Option<PathBuf> {
    let r = reference.as_bytes();
    if r.first() == Some(&b'/') {
        return None;
    }
    if let Some(colon) = reference.find(':') {
        let scheme = &r[..colon];
        if !scheme.is_empty()
            && scheme[0].is_ascii_alphabetic()
            && scheme.iter().all(|c| c.is_ascii_alphanumeric() || b"+.-".contains(c))
        {
            return None;
        }
    }
    let clean = reference.split(['?', '#']).next().unwrap_or("");
    if clean.is_empty() {
        return None;
    }
    let mut p = PathBuf::new();
    for c in dir.join(clean).components() {
        match c {
            Component::ParentDir => {
                p.pop();
            }
            Component::CurDir => {}
            other => p.push(other),
        }
    }
    if p.is_file() {
        Some(p)
    } else {
        None
    }
}

fn read_lossy(p: &Path) -> String {
    fs::read(p).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default()
}

/// Relative module specifiers in a script: `from "./x"`, `import "./x"`,
/// `import("./x")`. A lexer would be stricter; this reads the three shapes
/// and only takes specifiers that start with `./` or `../`.
pub fn relative_imports(js: &str) -> Vec<&str> {
    let b = js.as_bytes();
    let mut out = Vec::new();
    for kw in ["from", "import"] {
        let mut i = 0;
        while let Some(p) = js[i..].find(kw) {
            let at = i + p;
            i = at + kw.len();
            if at > 0 && (b[at - 1].is_ascii_alphanumeric() || b[at - 1] == b'_' || b[at - 1] == b'$' || b[at - 1] == b'.') {
                continue;
            }
            let mut j = i;
            while j < b.len() && b[j].is_ascii_whitespace() {
                j += 1;
            }
            if kw == "import" && j < b.len() && b[j] == b'(' {
                j += 1;
                while j < b.len() && b[j].is_ascii_whitespace() {
                    j += 1;
                }
            }
            if j < b.len() && (b[j] == b'"' || b[j] == b'\'' || b[j] == b'`') {
                let q = b[j];
                if let Some(e) = b[j + 1..].iter().position(|&c| c == q || c == b'\n') {
                    let spec = &js[j + 1..j + 1 + e];
                    if (spec.starts_with("./") || spec.starts_with("../")) && !spec.contains("${") {
                        out.push(spec);
                    }
                }
            }
        }
    }
    out
}

/// Prepare one HTML file, without following imports (the input PurgeCSS gets
/// from `tests/bench/purgecss_pages.mjs`).
pub fn prepare(file: &Path) -> std::io::Result<Page> {
    prepare_with(file, false)
}

/// Prepare one HTML file; with `follow_imports`, the content also takes every
/// local module the page's scripts import, transitively.
pub fn prepare_with(file: &Path, follow_imports: bool) -> std::io::Result<Page> {
    let html = String::from_utf8_lossy(&fs::read(file)?).into_owned();
    let dir = file.parent().unwrap_or(Path::new("."));
    let (content, mut css) = split_styles(&html);
    for tag in tags(&content, "link") {
        let (Some(rel), Some(href)) = (attr(tag, "rel"), attr(tag, "href")) else { continue };
        if !rel.to_ascii_lowercase().split_ascii_whitespace().any(|r| r == "stylesheet") {
            continue;
        }
        if let Some(p) = local_path(dir, &href) {
            css.push(read_lossy(&p));
        }
    }
    let mut parts = vec![content.clone()];
    let mut queue: Vec<(PathBuf, String)> = Vec::new();
    for tag in tags(&content, "script") {
        if let Some(src) = attr(tag, "src") {
            if let Some(p) = local_path(dir, &src) {
                let js = read_lossy(&p);
                parts.push(js.clone());
                queue.push((p, js));
            }
        }
    }
    if follow_imports {
        let mut seen: std::collections::HashSet<PathBuf> = queue.iter().map(|(p, _)| p.clone()).collect();
        // inline module scripts import relative to the page
        queue.push((file.to_path_buf(), content.clone()));
        while let Some((from, js)) = queue.pop() {
            let base = from.parent().unwrap_or(Path::new("."));
            for spec in relative_imports(&js) {
                if let Some(p) = local_path(base, spec) {
                    if seen.insert(p.clone()) {
                        let text = read_lossy(&p);
                        parts.push(text.clone());
                        queue.push((p, text));
                    }
                }
            }
        }
    }
    Ok(Page { css: css.join("\n"), content: parts.join("\n") })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn styles_are_cut_out() {
        let (kept, bodies) = split_styles("<p><STYLE media=x>.a{}</style ><styles></styles><style>.b{}</style>");
        assert_eq!(bodies, vec![".a{}", ".b{}"]);
        assert_eq!(kept, "<p><styles></styles>");
    }

    #[test]
    fn style_text_in_scripts_and_comments_is_not_css() {
        let page = "<script>const t = `<style>.x{}</style>`;</script><!-- <style>.y{}</style> --><style>.z{}</style>";
        let (kept, bodies) = split_styles(page);
        assert_eq!(bodies, vec![".z{}"]);
        assert!(kept.contains(".x{}") && kept.contains(".y{}"));
        // an unclosed script or comment hides nothing
        let (_, bodies) = split_styles("<!-- <style>.a{}</style><script><style>.b{}</style>");
        assert_eq!(bodies, vec![".a{}", ".b{}"]);
    }

    #[test]
    fn attributes_like_the_harness() {
        assert_eq!(attr("<link rel=stylesheet href='a.css'>", "href").as_deref(), Some("a.css"));
        assert_eq!(attr("<link data-href=x href=\"b.css\">", "href").as_deref(), Some("b.css"));
        assert_eq!(attr("<script defer>", "src"), None);
    }

    #[test]
    fn imports_are_read() {
        let js = "import a from './a.mjs';\nexport { b } from \"../b.js\"; import('./c.mjs'); import x from 'pkg'; transform('./no')";
        assert_eq!(relative_imports(js), vec!["./a.mjs", "../b.js", "./c.mjs"]);
    }

    #[test]
    fn remote_references_are_skipped() {
        let d = Path::new(".");
        assert!(local_path(d, "https://x/y.css").is_none());
        assert!(local_path(d, "/root.css").is_none());
        assert!(local_path(d, "data:text/css,").is_none());
    }
}
