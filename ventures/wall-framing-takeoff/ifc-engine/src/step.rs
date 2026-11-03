//! ISO 10303-21 ("STEP physical file", the text form of IFC) reader.
//!
//! The file is indexed once, without parsing attribute lists: each instance
//! `#id=TYPE(...);` becomes an [`Entity`] holding byte ranges into the input.
//! Attribute lists are parsed on demand with [`Model::args`], so a 500 MB
//! model costs one linear scan plus whatever the caller actually reads.
//!
//! The input is untrusted. Nothing here panics on malformed text: a record
//! that does not parse is skipped and counted, nesting is capped, and string
//! escapes that are not understood are kept verbatim.

use std::collections::HashMap;

/// One instance line, as byte ranges into the source.
#[derive(Clone, Copy, Debug)]
pub struct Entity {
    pub id: u32,
    ty: (u32, u32),
    args: (u32, u32),
}

/// An attribute value.
#[derive(Clone, Debug, PartialEq)]
pub enum Value<'a> {
    /// `$`: unset.
    Null,
    /// `*`: derived in a subtype.
    Derived,
    Int(i64),
    Real(f64),
    /// A string's raw text between the quotes (escapes not yet decoded).
    Str(&'a str),
    /// `.NAME.` without the dots.
    Enum(&'a str),
    Ref(u32),
    List(Vec<Value<'a>>),
    /// `IFCLENGTHMEASURE(2.5)`: a typed value in a select.
    Typed(&'a str, Box<Value<'a>>),
    /// `"0123"`: binary.
    Binary(&'a str),
}

impl<'a> Value<'a> {
    pub fn as_ref(&self) -> Option<u32> {
        if let Value::Ref(r) = self { Some(*r) } else { None }
    }
    /// Integers and reals as f64; a typed measure unwraps to its number.
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Real(v) => Some(*v),
            Value::Int(v) => Some(*v as f64),
            Value::Typed(_, v) => v.as_f64(),
            _ => None,
        }
    }
    pub fn as_list(&self) -> Option<&[Value<'a>]> {
        if let Value::List(v) = self { Some(v) } else { None }
    }
    pub fn as_enum(&self) -> Option<&'a str> {
        if let Value::Enum(v) = self { Some(v) } else { None }
    }
    /// A decoded string (see [`decode_string`]).
    pub fn as_str(&self) -> Option<String> {
        match self {
            Value::Str(s) => Some(decode_string(s)),
            Value::Typed(_, v) => v.as_str(),
            _ => None,
        }
    }
    /// The numbers of a list (coordinates, direction ratios).
    pub fn as_f64_list(&self) -> Vec<f64> {
        self.as_list().map(|l| l.iter().filter_map(|v| v.as_f64()).collect()).unwrap_or_default()
    }
}

/// An indexed file.
pub struct Model<'a> {
    src: &'a str,
    ents: Vec<Entity>,
    by_id: HashMap<u32, u32>,
    by_type: HashMap<&'a str, Vec<u32>>,
    pub schema: String,
    /// Records in the DATA section that could not be read (skipped).
    pub skipped: usize,
    /// Instance ids that appeared more than once (the first is kept).
    pub duplicates: usize,
}

const MAX_DEPTH: usize = 64;

impl<'a> Model<'a> {
    /// Index a file. Fails only when the text is not a STEP file at all.
    pub fn parse(src: &'a str) -> Result<Model<'a>, String> {
        let head = &src[..src.len().min(512)];
        if !head.trim_start_matches('\u{feff}').trim_start().starts_with("ISO-10303-21") {
            return Err("not an ISO-10303-21 (STEP) file: it should start with ISO-10303-21; IFCZIP and ifcXML are not read".into());
        }
        let b = src.as_bytes();
        let schema = find_schema(src).unwrap_or_default();
        let start = find_data(b).ok_or("no DATA; section")?;
        let mut m = Model { src, ents: Vec::new(), by_id: HashMap::new(), by_type: HashMap::new(), schema, skipped: 0, duplicates: 0 };
        let mut i = start;
        let n = b.len();
        while i < n {
            // skip whitespace and comments between records
            match b[i] {
                b' ' | b'\t' | b'\r' | b'\n' => { i += 1; continue; }
                b'/' if i + 1 < n && b[i + 1] == b'*' => { i = skip_comment(b, i); continue; }
                b'#' => {}
                _ => {
                    // ENDSEC; or junk: jump to the next ';' outside strings
                    if b[i..].starts_with(b"ENDSEC") { break; }
                    i = skip_statement(b, i);
                    m.skipped += 1;
                    continue;
                }
            }
            match read_record(b, i) {
                Some((id, ty, args, next)) => {
                    let ty_s = &src[ty.0..ty.1];
                    let idx = m.ents.len() as u32;
                    if let std::collections::hash_map::Entry::Vacant(e) = m.by_id.entry(id) {
                        e.insert(idx);
                        m.ents.push(Entity { id, ty: (ty.0 as u32, ty.1 as u32), args: (args.0 as u32, args.1 as u32) });
                        m.by_type.entry(ty_s).or_default().push(idx);
                    } else {
                        m.duplicates += 1;
                    }
                    i = next;
                }
                None => { i = skip_statement(b, i); m.skipped += 1; }
            }
        }
        Ok(m)
    }

    pub fn len(&self) -> usize { self.ents.len() }
    pub fn is_empty(&self) -> bool { self.ents.is_empty() }

    fn ent(&self, id: u32) -> Option<&Entity> { self.by_id.get(&id).map(|&k| &self.ents[k as usize]) }

    /// The upper-case type name of an instance.
    pub fn type_of(&self, id: u32) -> Option<&'a str> {
        self.ent(id).map(|e| &self.src[e.ty.0 as usize..e.ty.1 as usize])
    }

    pub fn is(&self, id: u32, ty: &str) -> bool { self.type_of(id) == Some(ty) }

    /// Parse the attribute list of an instance. `None` when the id is unknown
    /// or the list does not parse.
    pub fn args(&self, id: u32) -> Option<Vec<Value<'a>>> {
        let e = self.ent(id)?;
        let s = &self.src[e.args.0 as usize..e.args.1 as usize];
        match parse_value(s.as_bytes(), s, 0, 0) {
            Some((Value::List(v), _)) => Some(v),
            _ => None,
        }
    }

    /// Ids of every instance of the given upper-case type, in file order.
    pub fn of_type(&self, ty: &str) -> Vec<u32> {
        self.by_type.get(ty).map(|v| v.iter().map(|&k| self.ents[k as usize].id).collect()).unwrap_or_default()
    }

    /// Number of instances of a type.
    pub fn count(&self, ty: &str) -> usize { self.by_type.get(ty).map_or(0, |v| v.len()) }
}

fn find_schema(src: &str) -> Option<String> {
    let k = src.find("FILE_SCHEMA")?;
    let rest = &src[k..src.len().min(k + 200)];
    let a = rest.find('\'')? + 1;
    let z = rest[a..].find('\'')? + a;
    Some(rest[a..z].to_string())
}

fn find_data(b: &[u8]) -> Option<usize> {
    // "DATA;" at the start of a statement, outside a string
    let mut i = 0;
    let n = b.len();
    while i + 5 <= n {
        match b[i] {
            b'\'' => { i = skip_string(b, i); }
            b'/' if i + 1 < n && b[i + 1] == b'*' => { i = skip_comment(b, i); }
            b'D' if b[i..].starts_with(b"DATA") => {
                let mut j = i + 4;
                // IFC files may name the data section: DATA('name',(...));
                while j < n && (b[j] == b' ' || b[j] == b'\r' || b[j] == b'\n' || b[j] == b'\t') { j += 1; }
                if j < n && b[j] == b';' { return Some(j + 1); }
                if j < n && b[j] == b'(' { return Some(skip_statement(b, j)); }
                i += 4;
            }
            _ => i += 1,
        }
    }
    None
}

fn skip_comment(b: &[u8], i: usize) -> usize {
    let mut j = i + 2;
    while j + 1 < b.len() {
        if b[j] == b'*' && b[j + 1] == b'/' { return j + 2; }
        j += 1;
    }
    b.len()
}

/// From an opening quote, the index just past the closing one ('' is a quote).
fn skip_string(b: &[u8], i: usize) -> usize {
    let mut j = i + 1;
    while j < b.len() {
        if b[j] == b'\'' {
            if j + 1 < b.len() && b[j + 1] == b'\'' { j += 2; continue; }
            return j + 1;
        }
        j += 1;
    }
    b.len()
}

fn skip_statement(b: &[u8], i: usize) -> usize {
    let mut j = i;
    while j < b.len() {
        match b[j] {
            b'\'' => j = skip_string(b, j),
            b'/' if j + 1 < b.len() && b[j + 1] == b'*' => j = skip_comment(b, j),
            b';' => return j + 1,
            _ => j += 1,
        }
    }
    b.len()
}

/// `#id = TYPE ( ... ) ;` starting at `#`. Returns id, type range, the
/// argument range (including the outer parentheses) and the next index.
fn read_record(b: &[u8], i: usize) -> Option<(u32, (usize, usize), (usize, usize), usize)> {
    let n = b.len();
    let mut j = i + 1;
    let d0 = j;
    while j < n && b[j].is_ascii_digit() { j += 1; }
    if j == d0 || j - d0 > 9 { return None; }
    let id: u32 = std::str::from_utf8(&b[d0..j]).ok()?.parse().ok()?;
    j = skip_ws(b, j);
    if j >= n || b[j] != b'=' { return None; }
    j = skip_ws(b, j + 1);
    let t0 = j;
    while j < n && (b[j].is_ascii_uppercase() || b[j].is_ascii_digit() || b[j] == b'_') { j += 1; }
    if j == t0 { return None; } // complex instances "(A()B())" are not read
    let t1 = j;
    j = skip_ws(b, j);
    if j >= n || b[j] != b'(' { return None; }
    let a0 = j;
    let mut depth = 0usize;
    while j < n {
        match b[j] {
            b'\'' => { j = skip_string(b, j); continue; }
            b'"' => { j += 1; while j < n && b[j] != b'"' { j += 1; } j += 1; continue; }
            b'/' if j + 1 < n && b[j + 1] == b'*' => { j = skip_comment(b, j); continue; }
            b'(' => depth += 1,
            b')' => { depth -= 1; if depth == 0 { j += 1; break; } }
            b';' => return None, // ';' inside an unclosed list: broken record
            _ => {}
        }
        j += 1;
    }
    if depth != 0 { return None; }
    let a1 = j;
    j = skip_ws(b, j);
    if j >= n || b[j] != b';' { return None; }
    Some((id, (t0, t1), (a0, a1), j + 1))
}

fn skip_ws(b: &[u8], mut j: usize) -> usize {
    while j < b.len() {
        match b[j] {
            b' ' | b'\t' | b'\r' | b'\n' => j += 1,
            b'/' if j + 1 < b.len() && b[j + 1] == b'*' => j = skip_comment(b, j),
            _ => break,
        }
    }
    j
}

/// Parse one value at `i`. Returns it and the index after it.
fn parse_value<'a>(b: &[u8], s: &'a str, i: usize, depth: usize) -> Option<(Value<'a>, usize)> {
    if depth > MAX_DEPTH { return None; }
    let n = b.len();
    let i = skip_ws(b, i);
    if i >= n { return None; }
    match b[i] {
        b'(' => {
            let mut out = Vec::new();
            let mut j = skip_ws(b, i + 1);
            if j < n && b[j] == b')' { return Some((Value::List(out), j + 1)); }
            loop {
                let (v, k) = parse_value(b, s, j, depth + 1)?;
                out.push(v);
                j = skip_ws(b, k);
                if j >= n { return None; }
                match b[j] {
                    b',' => j += 1,
                    b')' => return Some((Value::List(out), j + 1)),
                    _ => return None,
                }
            }
        }
        b'\'' => {
            let z = skip_string(b, i);
            if z > n || z < i + 2 { return None; }
            Some((Value::Str(&s[i + 1..z - 1]), z))
        }
        b'"' => {
            let mut j = i + 1;
            while j < n && b[j] != b'"' { j += 1; }
            if j >= n { return None; }
            Some((Value::Binary(&s[i + 1..j]), j + 1))
        }
        b'$' => Some((Value::Null, i + 1)),
        b'*' => Some((Value::Derived, i + 1)),
        b'#' => {
            let mut j = i + 1;
            while j < n && b[j].is_ascii_digit() { j += 1; }
            let id = s[i + 1..j].parse().ok()?;
            Some((Value::Ref(id), j))
        }
        b'.' if i + 1 < n && (b[i + 1].is_ascii_alphabetic() || b[i + 1] == b'_') => {
            let mut j = i + 1;
            while j < n && b[j] != b'.' { j += 1; }
            if j >= n { return None; }
            Some((Value::Enum(&s[i + 1..j]), j + 1))
        }
        c if c == b'-' || c == b'+' || c == b'.' || c.is_ascii_digit() => {
            let mut j = i + 1;
            while j < n && (b[j].is_ascii_digit() || matches!(b[j], b'.' | b'e' | b'E' | b'-' | b'+')) { j += 1; }
            let t = &s[i..j];
            if !t.contains(['.', 'e', 'E']) {
                if let Ok(v) = t.parse::<i64>() { return Some((Value::Int(v), j)); }
            }
            t.parse::<f64>().ok().filter(|v| v.is_finite()).map(|v| (Value::Real(v), j))
        }
        c if c.is_ascii_uppercase() => {
            let mut j = i;
            while j < n && (b[j].is_ascii_uppercase() || b[j].is_ascii_digit() || b[j] == b'_') { j += 1; }
            let name = &s[i..j];
            let k = skip_ws(b, j);
            if k < n && b[k] == b'(' {
                let (inner, z) = parse_value(b, s, k, depth + 1)?;
                // IFCLABEL('x') wraps one value; keep a single value unwrapped
                let v = match inner {
                    Value::List(mut l) if l.len() == 1 => l.pop().unwrap_or(Value::Null),
                    other => other,
                };
                Some((Value::Typed(name, Box::new(v)), z))
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Decode a STEP string: `''` to `'`, `\\` to `\`, `\X2\hhhh...\X0\` (UTF-16),
/// `\X4\hhhhhhhh...\X0\`, `\X\hh` (ISO 8859-1) and `\S\c` (high half). Other
/// escapes are kept as written.
pub fn decode_string(raw: &str) -> String {
    let b = raw.as_bytes();
    let mut out = String::with_capacity(raw.len());
    let mut i = 0;
    let hex = |s: &[u8]| -> Option<u32> { u32::from_str_radix(std::str::from_utf8(s).ok()?, 16).ok() };
    while i < b.len() {
        if b[i] == b'\'' && i + 1 < b.len() && b[i + 1] == b'\'' { out.push('\''); i += 2; continue; }
        if b[i] == b'\\' {
            if b[i..].starts_with(b"\\\\") { out.push('\\'); i += 2; continue; }
            if b[i..].starts_with(b"\\X2\\") || b[i..].starts_with(b"\\X4\\") {
                let w = if b[i + 2] == b'2' { 4 } else { 8 };
                if let Some(end) = raw[i + 4..].find("\\X0\\") {
                    let h = &b[i + 4..i + 4 + end];
                    if h.len().is_multiple_of(w) {
                        let units: Option<Vec<u32>> = h.chunks(w).map(hex).collect();
                        if let Some(units) = units {
                            if w == 4 {
                                let u16s: Vec<u16> = units.iter().map(|&u| u as u16).collect();
                                out.push_str(&String::from_utf16_lossy(&u16s));
                            } else {
                                for u in units { out.push(char::from_u32(u).unwrap_or('\u{fffd}')); }
                            }
                            i += 4 + end + 4;
                            continue;
                        }
                    }
                }
            }
            if b[i..].starts_with(b"\\X\\") && i + 5 <= b.len() {
                if let Some(c) = hex(&b[i + 3..i + 5]).and_then(char::from_u32) { out.push(c); i += 5; continue; }
            }
            if b[i..].starts_with(b"\\S\\") && i + 4 <= b.len() {
                if let Some(c) = char::from_u32(b[i + 3] as u32 + 128) { out.push(c); i += 4; continue; }
            }
        }
        // copy one UTF-8 character
        let ch = raw[i..].chars().next().unwrap_or('\u{fffd}');
        out.push(ch);
        i += ch.len_utf8().max(1);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const F: &str = "ISO-10303-21;\nHEADER;FILE_SCHEMA(('IFC2X3'));ENDSEC;\nDATA;\n#1=IFCCARTESIANPOINT((0.,1.5,-2.E-1));\n/* note; with a semicolon */\n#2 = IFCLABELLED('it''s; fine',$,*,.T.,#1,(#1,#3),IFCLENGTHMEASURE(2.5),\"0F\");\n#3=IFCBROKEN((1,2;\n#4=IFCOK(());\nENDSEC;END-ISO-10303-21;";

    #[test]
    fn indexes_and_parses() {
        let m = Model::parse(F).unwrap();
        assert_eq!(m.schema, "IFC2X3");
        assert_eq!(m.len(), 3);
        assert_eq!(m.skipped, 1);
        assert_eq!(m.args(1).unwrap()[0].as_f64_list(), vec![0.0, 1.5, -0.2]);
        let a = m.args(2).unwrap();
        assert_eq!(a[0].as_str().unwrap(), "it's; fine");
        assert_eq!(a[1], Value::Null);
        assert_eq!(a[2], Value::Derived);
        assert_eq!(a[3].as_enum(), Some("T"));
        assert_eq!(a[4].as_ref(), Some(1));
        assert_eq!(a[5].as_list().unwrap().len(), 2);
        assert_eq!(a[6].as_f64(), Some(2.5));
        assert_eq!(a[7], Value::Binary("0F"));
        assert_eq!(m.args(4).unwrap()[0], Value::List(vec![]));
        assert_eq!(m.of_type("IFCOK"), vec![4]);
    }

    #[test]
    fn decodes_escapes() {
        assert_eq!(decode_string("Begane grond \\X2\\00E9\\X0\\"), "Begane grond é");
        assert_eq!(decode_string("\\X\\E9t\\X\\E9"), "été");
        assert_eq!(decode_string("a\\\\b''c"), "a\\b'c");
        assert_eq!(decode_string("\\X2\\zz\\X0\\"), "\\X2\\zz\\X0\\");
    }

    #[test]
    fn rejects_non_step_and_survives_garbage() {
        assert!(Model::parse("hello").is_err());
        let deep = format!("ISO-10303-21;DATA;#1=X({}{});ENDSEC;", "(".repeat(5000), ")".repeat(5000));
        let m = Model::parse(&deep).unwrap();
        assert!(m.args(1).is_none());
        let cut = "ISO-10303-21;DATA;#1=IFCX('unterminated";
        assert_eq!(Model::parse(cut).unwrap().len(), 0);
    }
}
