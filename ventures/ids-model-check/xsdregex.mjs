// XML Schema 1.0 regular expressions (XSD Part 2, Appendix F), the language an
// IDS <xs:pattern value="..."/> is written in. parseXsdRegex(p) either names
// the first place the text breaks the grammar, or returns a JavaScript source
// with the XSD meaning: the whole value must match; ^ and $ are ordinary
// characters; . is any character but a line feed or carriage return; \d is
// any Unicode decimal digit, \w anything but punctuation, separators and
// "other", \s only space, tab, LF and CR; \i and \c are XML name characters;
// [a-z-[aeiou]] subtracts. It also lists where a regex written for
// JavaScript, Python or .NET would mean something else (portability notes),
// because IDS authors often write those and some checkers accept them.
// Checked against elementpath's translate_pattern (eval/xsd-regex-2026-11-18.md).

const SINGLE = { n: "\n", r: "\r", t: "\t" };
const SINGLE_OK = new Set([..."nrt\\|.?*+(){}-[]^"]);
const MULTI = new Set([..."sSiIcCdDwW"]);
const CATEGORIES = new Set(["L", "Lu", "Ll", "Lt", "Lm", "Lo", "M", "Mn", "Mc", "Me", "N", "Nd", "Nl", "No",
  "P", "Pc", "Pd", "Ps", "Pe", "Pi", "Pf", "Po", "Z", "Zs", "Zl", "Zp", "S", "Sm", "Sc", "Sk", "So",
  "C", "Cc", "Cf", "Co", "Cn"]);

// Unicode 3.1 block names XSD 1.0 allows in \p{IsName}, with their ranges.
const BLOCKS = {
  BasicLatin: [0x0, 0x7f], "Latin-1Supplement": [0x80, 0xff], "LatinExtended-A": [0x100, 0x17f],
  "LatinExtended-B": [0x180, 0x24f], IPAExtensions: [0x250, 0x2af], SpacingModifierLetters: [0x2b0, 0x2ff],
  CombiningDiacriticalMarks: [0x300, 0x36f], Greek: [0x370, 0x3ff], Cyrillic: [0x400, 0x4ff],
  Armenian: [0x530, 0x58f], Hebrew: [0x590, 0x5ff], Arabic: [0x600, 0x6ff], Syriac: [0x700, 0x74f],
  Thaana: [0x780, 0x7bf], Devanagari: [0x900, 0x97f], Bengali: [0x980, 0x9ff], Gurmukhi: [0xa00, 0xa7f],
  Gujarati: [0xa80, 0xaff], Oriya: [0xb00, 0xb7f], Tamil: [0xb80, 0xbff], Telugu: [0xc00, 0xc7f],
  Kannada: [0xc80, 0xcff], Malayalam: [0xd00, 0xd7f], Sinhala: [0xd80, 0xdff], Thai: [0xe00, 0xe7f],
  Lao: [0xe80, 0xeff], Tibetan: [0xf00, 0xfff], Myanmar: [0x1000, 0x109f], Georgian: [0x10a0, 0x10ff],
  HangulJamo: [0x1100, 0x11ff], Ethiopic: [0x1200, 0x137f], Cherokee: [0x13a0, 0x13ff],
  UnifiedCanadianAboriginalSyllabics: [0x1400, 0x167f], Ogham: [0x1680, 0x169f], Runic: [0x16a0, 0x16ff],
  Khmer: [0x1780, 0x17ff], Mongolian: [0x1800, 0x18af], LatinExtendedAdditional: [0x1e00, 0x1eff],
  GreekExtended: [0x1f00, 0x1fff], GeneralPunctuation: [0x2000, 0x206f], SuperscriptsandSubscripts: [0x2070, 0x209f],
  CurrencySymbols: [0x20a0, 0x20cf], CombiningMarksforSymbols: [0x20d0, 0x20ff], LetterlikeSymbols: [0x2100, 0x214f],
  NumberForms: [0x2150, 0x218f], Arrows: [0x2190, 0x21ff], MathematicalOperators: [0x2200, 0x22ff],
  MiscellaneousTechnical: [0x2300, 0x23ff], ControlPictures: [0x2400, 0x243f], OpticalCharacterRecognition: [0x2440, 0x245f],
  EnclosedAlphanumerics: [0x2460, 0x24ff], BoxDrawing: [0x2500, 0x257f], BlockElements: [0x2580, 0x259f],
  GeometricShapes: [0x25a0, 0x25ff], MiscellaneousSymbols: [0x2600, 0x26ff], Dingbats: [0x2700, 0x27bf],
  BraillePatterns: [0x2800, 0x28ff], CJKRadicalsSupplement: [0x2e80, 0x2eff], KangxiRadicals: [0x2f00, 0x2fdf],
  IdeographicDescriptionCharacters: [0x2ff0, 0x2fff], CJKSymbolsandPunctuation: [0x3000, 0x303f],
  Hiragana: [0x3040, 0x309f], Katakana: [0x30a0, 0x30ff], Bopomofo: [0x3100, 0x312f],
  HangulCompatibilityJamo: [0x3130, 0x318f], Kanbun: [0x3190, 0x319f], BopomofoExtended: [0x31a0, 0x31bf],
  EnclosedCJKLettersandMonths: [0x3200, 0x32ff], CJKCompatibility: [0x3300, 0x33ff],
  CJKUnifiedIdeographsExtensionA: [0x3400, 0x4dbf], CJKUnifiedIdeographs: [0x4e00, 0x9fff],
  YiSyllables: [0xa000, 0xa48f], YiRadicals: [0xa490, 0xa4cf], HangulSyllables: [0xac00, 0xd7a3],
  PrivateUse: [0xe000, 0xf8ff], CJKCompatibilityIdeographs: [0xf900, 0xfaff],
  AlphabeticPresentationForms: [0xfb00, 0xfb4f], "ArabicPresentationForms-A": [0xfb50, 0xfdff],
  CombiningHalfMarks: [0xfe20, 0xfe2f], CJKCompatibilityForms: [0xfe30, 0xfe4f], SmallFormVariants: [0xfe50, 0xfe6f],
  "ArabicPresentationForms-B": [0xfe70, 0xfefe], Specials: [0xfeff, 0xfeff], HalfwidthandFullwidthForms: [0xff00, 0xffef],
  // Specials is two ranges in Unicode 3.1; the second half is added below.
  OldItalic: [0x10300, 0x1032f], Gothic: [0x10330, 0x1034f], Deseret: [0x10400, 0x1044f],
  ByzantineMusicalSymbols: [0x1d000, 0x1d0ff], MusicalSymbols: [0x1d100, 0x1d1ff],
  MathematicalAlphanumericSymbols: [0x1d400, 0x1d7ff], "CJKUnifiedIdeographsExtensionB": [0x20000, 0x2a6d6],
  CJKCompatibilityIdeographsSupplement: [0x2f800, 0x2fa1f], Tags: [0xe0000, 0xe007f],
};

const hex = (c) => "\\u{" + c.toString(16) + "}";
const NAME_START = "[:A-Z_a-z\\u{c0}-\\u{d6}\\u{d8}-\\u{f6}\\u{f8}-\\u{2ff}\\u{370}-\\u{37d}\\u{37f}-\\u{1fff}\\u{200c}-\\u{200d}\\u{2070}-\\u{218f}\\u{2c00}-\\u{2fef}\\u{3001}-\\u{d7ff}\\u{f900}-\\u{fdcf}\\u{fdf0}-\\u{fffd}\\u{10000}-\\u{effff}]";
const NAME_CHAR = "[\\-.0-9\\u{b7}\\u{300}-\\u{36f}\\u{203f}-\\u{2040}" + NAME_START.slice(1);
const MULTI_JS = {
  s: "[\\u{20}\\t\\n\\r]", S: "[^\\u{20}\\t\\n\\r]", d: "\\p{Nd}", D: "\\P{Nd}",
  w: "[^\\p{P}\\p{Z}\\p{C}]", W: "[\\p{P}\\p{Z}\\p{C}]",
  i: NAME_START, I: "[^" + NAME_START.slice(1), c: NAME_CHAR, C: "[^" + NAME_CHAR.slice(1),
};

function blockJs(name) {
  const r = BLOCKS[name];
  if (!r) return null;
  const s = hex(r[0]) + "-" + hex(r[1]);
  return name === "Specials" ? "[" + s + "\\u{fff0}-\\u{fffd}]" : "[" + s + "]";
}

class Fail extends Error {
  constructor(at, message) { super(message); this.at = at; }
}

// Returns { ok: true, source, notes } or { ok: false, at, error, notes }.
// source is for new RegExp(source, "v"), already anchored.
export function parseXsdRegex(p) {
  const cps = [...String(p)];
  let i = 0;
  const notes = portabilityNotes(p);
  const escNotes = new Set();
  const peek = () => cps[i];
  const fail = (m) => { throw new Fail(i, m); };

  function regExp() {
    const branches = [branch()];
    while (peek() === "|") { i++; branches.push(branch()); }
    return branches.join("|");
  }
  function branch() {
    let out = "";
    while (i < cps.length && peek() !== "|" && peek() !== ")") out += piece();
    return out;
  }
  function piece() {
    const a = atom();
    const q = quantifier();
    return q ? "(?:" + a + ")" + q : a;
  }
  function quantifier() {
    const c = peek();
    if (c === "?" || c === "*" || c === "+") {
      i++;
      if (peek() === "?" || peek() === "+") fail(`"${c}${peek()}" (a lazy or possessive quantifier) is not XSD; write "${c}"`);
      return c;
    }
    if (c !== "{") return "";
    const start = i;
    i++;
    const num = () => { let s = ""; while (/[0-9]/.test(peek() || "")) s += cps[i++]; return s; };
    const lo = num();
    if (!lo) { i = start; fail(`a quantifier needs a lower bound: write "{0,${cps.slice(start + 2, cps.indexOf("}", start)).join("")}}" for "{,n}", or "\\{" for a literal brace`); }
    let hi = lo, open = false;
    if (peek() === ",") { i++; hi = num(); open = !hi; }
    if (peek() !== "}") fail(`quantifier "${cps.slice(start, i + 1).join("")}" is not closed with "}"`);
    i++;
    if (!open && Number(hi) < Number(lo)) { i = start; fail(`quantifier {${lo},${hi}}: the upper bound is below the lower`); }
    if (peek() === "?" || peek() === "+") fail(`a lazy or possessive quantifier is not XSD`);
    const comma = cps.slice(start, i).includes(",");
    return "{" + Number(lo) + (comma ? "," + (open ? "" : Number(hi)) : "") + "}";
  }
  function atom() {
    const c = peek();
    if (c === "(") {
      i++;
      if (peek() === "?") fail(`"(?" (a non-capturing group, lookaround or flag) is not XSD; write a plain "(...)"`);
      const inner = regExp();
      if (peek() !== ")") fail(`group opened at character ${cps.lastIndexOf("(", i) + 1} is not closed`);
      i++;
      return "(?:" + inner + ")";
    }
    if (c === ")") fail(`")" with no "(" before it`);
    if (c === "[") return charClassExpr();
    if (c === "]") fail(`"]" with no "[" before it; write "\\]"`);
    if (c === ".") { i++; return "[^\\n\\r]"; }
    if (c === "?" || c === "*" || c === "+") fail(`"${c}" has nothing before it to repeat`);
    if (c === "{") {
      fail(`"{" outside a quantifier; write "\\{"`);
    }
    // A lone "}" is an ordinary character in XSD 1.0 (Appendix F, Char) and to
    // elementpath; a lone "{" is not, to elementpath.
    if (c === "\\") return charClassEsc(false);
    i++;
    return lit(c);
  }
  function lit(c) {
    return /[0-9A-Za-z]/.test(c) ? c : hex(c.codePointAt(0));
  }
  // An escape. In a class, returns { js, single } with single = the code point
  // for a single-character escape (usable as a range end).
  function charClassEsc(inClass) {
    const start = i;
    i++;
    const e = peek();
    if (e === undefined) fail(`the pattern ends with a lone "\\"`);
    i++;
    if (SINGLE_OK.has(e)) {
      const cp = (SINGLE[e] || e).codePointAt(0);
      return inClass ? { js: hex(cp), single: cp } : hex(cp);
    }
    if (MULTI.has(e)) return inClass ? { js: MULTI_JS[e] } : MULTI_JS[e];
    if (e === "p" || e === "P") {
      if (peek() !== "{") fail(`"\\${e}" needs a property in braces, such as \\${e}{L} or \\${e}{IsBasicLatin}`);
      const close = cps.indexOf("}", i);
      if (close < 0) fail(`"\\${e}{" is not closed`);
      const name = cps.slice(i + 1, close).join("");
      let js;
      if (CATEGORIES.has(name)) js = (e === "p" ? "\\p{" : "\\P{") + "General_Category=" + name + "}";
      else if (name.startsWith("Is") && blockJs(name.slice(2))) {
        const b = blockJs(name.slice(2));
        js = e === "p" ? b : "[^" + b.slice(1);
      } else { i = start; fail(`\\${e}{${name}} is not an XSD category or block (categories: L, Lu, Nd, P ...; blocks: IsBasicLatin, IsGreek ...)`); }
      i = close + 1;
      return inClass ? { js } : js;
    }
    if (/[!-\/:-@\[-`{-~]/.test(e)) {
      // XSD 1.0 escapes only the characters in SINGLE_OK; XSD 1.1 and XPath add
      // "$". elementpath (IfcTester) and most regex engines read any other
      // escaped punctuation as the character itself, and buildingSMART's own
      // test files write "\/", so it is read that way, with a note.
      escNotes.add(e);
      const cp = e.codePointAt(0);
      return inClass ? { js: hex(cp), single: cp } : hex(cp);
    }
    i = start;
    if (/[1-9]/.test(e)) fail(`"\\${e}" (a back-reference) is not XSD`);
    if (e === "x" || e === "u") fail(`"\\${e}" (a hex escape) is not XSD; write the character itself, or &#x...; in the XML`);
    if (/[bBAZz]/.test(e)) fail(`"\\${e}" (${/[bB]/.test(e) ? "a word boundary" : "an anchor"}) is not XSD; a pattern already matches the whole value`);
    fail(`"\\${e}" is not an XSD escape`);
  }
  function charClassExpr() {
    const open = i;
    i++;
    let neg = false;
    if (peek() === "^") { neg = true; i++; }
    const items = [];
    let first = true;
    let sub = null;
    for (;;) {
      const c = peek();
      if (c === undefined) { i = open; fail(`"[" is not closed with "]"`); }
      if (c === "]") {
        if (first) fail(`an empty character class "[]" is not XSD; write "\\[" and "\\]" for the brackets`);
        i++;
        break;
      }
      if (c === "[") fail(`"[" inside a character class; write "\\[" (or "-[...]" at the end to subtract a class)`);
      if (c === "-") {
        if (cps[i + 1] === "[") {
          if (first) fail(`a subtraction "-[...]" needs characters before it`);
          i++;
          sub = charClassExpr();
          if (peek() !== "]") fail(`a subtraction "-[...]" must end the class`);
          i++;
          break;
        }
        // A literal "-" only first or last in the class (XSD 1.0 errata).
        if (!first && cps[i + 1] !== "]") fail(`"-" in the middle of a character class; write "\\-"`);
        i++;
        items.push(hex(0x2d));
        first = false;
        continue;
      }
      let lo, loJs;
      if (c === "\\") {
        const e = charClassEsc(true);
        if (e.single === undefined) { items.push(e.js); first = false; checkNoRangeAfterMulti(); continue; }
        lo = e.single; loJs = e.js;
      } else { i++; lo = c.codePointAt(0); loJs = hex(lo); }
      if (peek() === "-" && cps[i + 1] !== "]" && cps[i + 1] !== "[") {
        i++;
        let hi;
        const d = peek();
        if (d === "\\") {
          const e = charClassEsc(true);
          if (e.single === undefined) fail(`a range cannot end in a multi-character escape`);
          hi = e.single;
        } else if (d === "[" ) { fail(`"[" inside a character class; write "\\["`); }
        else { i++; hi = d.codePointAt(0); }
        if (hi < lo) fail(`range ${String.fromCodePoint(lo)}-${String.fromCodePoint(hi)} runs backwards`);
        items.push(hex(lo) + "-" + hex(hi));
      } else items.push(loJs);
      first = false;
    }
    let js = "[" + (neg ? "^" : "") + items.join("") + "]";
    if (sub) js = "[" + js + "--" + sub + "]";
    return js;
  }
  function checkNoRangeAfterMulti() {
    if (peek() === "-" && cps[i + 1] !== "]" && cps[i + 1] !== "[") fail(`a range cannot start at a multi-character escape; write "\\-" for a dash`);
  }

  try {
    const body = regExp();
    if (i < cps.length) fail(`")" with no "(" before it`);
    if (escNotes.size) notes.push({
      code: "pattern-escape",
      message: `${[...escNotes].map((c) => '"\\' + c + '"').join(", ")} ${escNotes.size > 1 ? "are" : "is"} not an XSD 1.0 escape; IfcTester and most regex engines read ${escNotes.size > 1 ? "them" : "it"} as the plain character, but a strict schema validator may refuse the pattern`,
      fix: "drop the backslash",
    });
    return { ok: true, source: "^(?:" + body + ")$", notes };
  } catch (e) {
    if (!(e instanceof Fail)) throw e;
    return { ok: false, at: e.at, error: e.message, notes };
  }
}

// The XSD regex compiled for JavaScript, or null when the text is not XSD.
export function compileXsdRegex(p) {
  const r = parseXsdRegex(p);
  if (!r.ok) return null;
  try { return new RegExp(r.source, "v"); } catch { return null; }
}

// Where the same text means something else in the regex dialects IDS authors
// usually know (JavaScript, Python, .NET), so checkers built on them disagree
// with XSD and with each other. Each note: { code, message, fix }.
export function portabilityNotes(p) {
  const notes = [];
  const s = String(p);
  // An unescaped ^ outside a class, or $ anywhere unescaped.
  let inClass = false, caret = false, dollar = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\") { k++; continue; }
    if (inClass) { if (c === "]") inClass = false; continue; }
    if (c === "[") { inClass = true; if (s[k + 1] === "^") k++; continue; }
    if (c === "^") caret = true;
    if (c === "$") dollar = true;
  }
  if (caret || dollar) {
    const both = caret && dollar;
    notes.push({
      code: "pattern-anchor",
      message: `${both ? '"^" and "$" are ordinary characters' : (caret ? '"^"' : '"$"') + " is an ordinary character"} in an XSD pattern (a pattern always matches the whole value, so it needs no anchors); IfcTester and this checker look for ${both ? "those characters" : "that character"} in the value, so this matches almost nothing, while checkers built on JavaScript or .NET regex read ${both ? "them" : "it"} as anchors`,
      fix: "drop the anchors",
    });
  }
  // A bare \w or \s outside [...]: elementpath, which IfcTester uses, turns
  // it into Python's \w (letters, digits, underscore) or \s (any Unicode
  // space), not the XSD set; inside [...] it uses the XSD set
  // (eval/word-class-2026-11-18.md).
  const bare = bareEscapes(s);
  if (bare.has("w") || bare.has("W")) {
    notes.push({
      code: "pattern-word-class",
      message: `"\\w" in XSD is any character that is not punctuation, a separator or a control character, so it takes "+", "€" and "°" as well as letters and digits, but not "_" (a connector punctuation mark); IfcTester reads it as letters, digits and underscore, so "Wall+" or "90°" passes here and fails there, and "W_01" fails here and passes there; write [\\p{L}\\p{Nd}_] for letters, digits and underscore, or [^\\p{P}\\p{Z}\\p{C}] for the XSD set, and every checker agrees (the page's repair and cli.mjs --fix --word-class letters|xsd write either)`,
      fix: null,
    });
  }
  if (bare.has("s") || bare.has("S")) {
    notes.push({
      code: "pattern-space-class",
      message: `"\\s" in XSD is a space, tab, line feed or carriage return only; IfcTester reads it as any Unicode space, so a value with a no-break space (common in text pasted from a spreadsheet or a word processor) passes there and fails here; write [\\s] for the XSD set or [\\s\\p{Z}] for any space, and every checker agrees (the page's repair and cli.mjs --fix --word-class xsd|letters write either)`,
      fix: null,
    });
  }
  return notes;
}

// The letters of the class escapes written outside [...] ("w", "s", "S", ...).
// Classes nest only through subtraction, "-[" inside a class.
function bareEscapes(s) {
  const out = new Set();
  let depth = 0;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\") { if (depth === 0 && s[k + 1]) out.add(s[k + 1]); k++; continue; }
    if (c === "[" && (depth === 0 || s[k - 1] === "-")) depth++;
    else if (c === "]" && depth > 0) depth--;
  }
  return out;
}

// A bare \w, \W, \s or \S (outside [...]) spelled out as a character class
// that every reader takes the same way, or null when the pattern has none (or
// the result would not parse). Which meaning to keep is a person's choice, so
// neither is part of repairXsdRegex:
//   "xsd":     what the IDS standard says, kept exactly:
//              \w -> [^\p{P}\p{Z}\p{C}], \s -> [\s] (elementpath reads \s
//              inside [...] as XSD's space, tab, LF, CR);
//   "letters": close to how IfcTester reads them today: \w -> [\p{L}\p{Nd}_]
//              (Python's \w also takes other numerals such as "²" and "Ⅳ"),
//              \s -> [\s\p{Z}] (any space; Python's also takes \f, \v and
//              four control characters).
// \W and \S become the negated class. (eval/word-class-2026-11-18.md)
export const WORD_CLASS = {
  xsd: { w: "[^\\p{P}\\p{Z}\\p{C}]", W: "[\\p{P}\\p{Z}\\p{C}]", s: "[\\s]", S: "[^\\s]" },
  letters: { w: "[\\p{L}\\p{Nd}_]", W: "[^\\p{L}\\p{Nd}_]", s: "[\\s\\p{Z}]", S: "[^\\s\\p{Z}]" },
};
export function spellWordClass(p, reading) {
  const sub = WORD_CLASS[reading];
  if (!sub) throw new Error(`reading must be ${Object.keys(WORD_CLASS).join(" or ")}`);
  const s = String(p);
  let out = "", depth = 0, changed = false;
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\") {
      const e = s[k + 1] ?? "";
      if (depth === 0 && sub[e]) { out += sub[e]; changed = true; }
      else out += c + e;
      k++;
      continue;
    }
    if (c === "[" && (depth === 0 || s[k - 1] === "-")) depth++;
    else if (c === "]" && depth > 0) depth--;
    out += c;
  }
  if (!changed) return null;
  return parseXsdRegex(out).ok ? out : null;
}

// A mechanical repair for the common non-XSD spellings, or null when there is
// none: anchors dropped (only where they open or close the whole pattern or a
// top-level branch), "(?:" to "(", "\/" to "/", "{,n}" to "{0,n}". The result
// is only offered if it parses as XSD.
export function repairXsdRegex(p) {
  let s = String(p);
  const before = s;
  s = s.replace(/\(\?:/g, "(");
  s = s.replace(/(^|[^\\])\\([!"#%&',/:;<=>@_`~ ])/g, "$1$2");
  s = s.replace(/\{,(\d+)\}/g, "{0,$1}");
  // Anchors on each top-level branch.
  s = splitTop(s).map((b) => b.replace(/^\^/, "").replace(/(^|[^\\])\$$/, "$1")).join("|");
  if (s === before) return null;
  return parseXsdRegex(s).ok ? s : null;
}

function splitTop(s) {
  const out = [];
  let depth = 0, inClass = false, cur = "";
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === "\\") { cur += c + (s[k + 1] ?? ""); k++; continue; }
    if (inClass) { if (c === "]") inClass = false; cur += c; continue; }
    if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "|" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
