// IPTC captions, keywords and credits in XMP sidecars, for the cull page.
//
// A photo desk's first job after picking frames is captioning them: who shot
// it, the copyright line, where, and keywords an archive can search. Photo
// Mechanic does this with a "stationery pad" (a template with variables such
// as the capture date); this module does the same into the XMP sidecars the
// cull page already writes, using the IPTC Photo Metadata Standard's XMP
// properties, which Lightroom Classic, Bridge, Capture One, darktable,
// digiKam and ExifTool all read:
//
//   headline      photoshop:Headline         simple text
//   title         dc:title                   Alt (x-default)
//   caption       dc:description             Alt (x-default)
//   keywords      dc:subject                 Bag (merged with keywords already there)
//   creator       dc:creator                 Seq
//   copyright     dc:rights                  Alt (x-default)
//   credit        photoshop:Credit           simple text
//   source        photoshop:Source           simple text
//   location      Iptc4xmpCore:Location      simple text (sublocation)
//   city          photoshop:City             simple text
//   state         photoshop:State            simple text
//   country       photoshop:Country          simple text
//   instructions  photoshop:Instructions     simple text
//
// Two desk features ride on the keywords and text fields:
//
//   * Hierarchical keywords. A keyword typed as "Sport|Ice hockey" (or
//     "Sport > Ice hockey") is a path. Its full path goes into
//     lr:hierarchicalSubject, the Bag Lightroom Classic, Bridge and digiKam
//     use for keyword trees, and every level ("Sport", "Ice hockey") goes
//     into dc:subject, so readers without trees still find each word.
//   * Code replacements, in the style of Photo Mechanic's: a list of
//     "code<TAB>text" lines (or "code=text"), and "\23\" in any field or
//     keyword box becomes the text for code 23 (a team roster, a venue list).
//     Unknown codes stay as typed so a typo shows.
//
// mergeIptc edits a sidecar in place: properties the template leaves empty
// are untouched, keywords are added to the existing bag (no duplicates, case
// ignored), and every other property (develop settings, crops, history) is
// left byte for byte. No dependencies; runs in the browser and in Node.

export const NS = {
  dc: "http://purl.org/dc/elements/1.1/",
  photoshop: "http://ns.adobe.com/photoshop/1.0/",
  Iptc4xmpCore: "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/",
  lr: "http://ns.adobe.com/lightroom/1.0/",
};

/** Field key -> [preferred prefix, namespace key, local name, kind]. */
export const IPTC_FIELDS = {
  headline: ["photoshop", "Headline", "text"],
  title: ["dc", "title", "alt"],
  caption: ["dc", "description", "alt"],
  keywords: ["dc", "subject", "bag"],
  creator: ["dc", "creator", "seq"],
  copyright: ["dc", "rights", "alt"],
  credit: ["photoshop", "Credit", "text"],
  source: ["photoshop", "Source", "text"],
  location: ["Iptc4xmpCore", "Location", "text"],
  city: ["photoshop", "City", "text"],
  state: ["photoshop", "State", "text"],
  country: ["photoshop", "Country", "text"],
  instructions: ["photoshop", "Instructions", "text"],
};

// What mergeIptc and readIptc handle: the form's fields plus the keyword tree.
const XMP_FIELDS = { ...IPTC_FIELDS, hierarchy: ["lr", "hierarchicalSubject", "bag"] };

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function unesc(s) {
  return s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === "#") return String.fromCodePoint(k[1] === "x" ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
    return { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" }[k];
  });
}

// "Sport > Ice hockey", " Sport | Ice  hockey " -> "Sport|Ice hockey"; empty levels dropped.
function normKeyword(raw) {
  return String(raw).split(/\||\s>\s/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean).join("|");
}

/**
 * Keywords from a typed string: split on commas, semicolons or new lines,
 * trimmed, duplicates (case ignored) dropped. A path keeps its levels joined
 * by "|" ("Sport > Ice hockey" -> "Sport|Ice hockey").
 */
export function splitKeywords(s) {
  const out = [], seen = new Set();
  for (const raw of Array.isArray(s) ? s : String(s || "").split(/[,;\n]/)) {
    const k = normKeyword(raw);
    if (k && !seen.has(k.toLowerCase())) { seen.add(k.toLowerCase()); out.push(k); }
  }
  return out;
}

/**
 * Typed keywords (paths allowed) as the two XMP bags: `subject`, every level
 * of every keyword once (dc:subject), and `hierarchy`, the full paths of the
 * keywords that have more than one level (lr:hierarchicalSubject).
 */
export function keywordBags(keywords) {
  const subject = [], hierarchy = [];
  for (const k of splitKeywords(keywords)) {
    const levels = k.split("|");
    subject.push(...levels);
    if (levels.length > 1) hierarchy.push(k);
  }
  return { subject: splitKeywords(subject), hierarchy };
}

// ---------------------------------------------------------------- code replacements

/**
 * A code list from text: one "code<TAB>text" (or "code=text") per line;
 * blank lines and lines starting with # are skipped. Codes match with case
 * ignored. Returns a Map of lower-cased code -> text.
 */
export function parseCodes(text) {
  const codes = new Map();
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = /^\s*([^\t=\\]+?)\s*(?:\t|=)\s*(.*?)\s*$/.exec(line);
    if (m && m[1]) codes.set(m[1].toLowerCase(), m[2]);
  }
  return codes;
}

/** "\\23\\ scores" -> "Jane Roe scores" with code 23 -> "Jane Roe". Unknown codes stay as typed. */
export function expandCodes(s, codes) {
  if (!codes || !codes.size) return String(s ?? "");
  return String(s ?? "").replace(/\\([^\\\s]+)\\/g, (m, c) => (codes.has(c.toLowerCase()) ? codes.get(c.toLowerCase()) : m));
}

// ---------------------------------------------------------------- template variables

const z2 = (n) => String(n).padStart(2, "0");
// "NIKON D300", not "NIKON CORPORATION NIKON D300" (the cull page's rule).
function cameraName(m) {
  if (!m.model) return m.make || "";
  const brand = (m.make || "").split(/[\s,]/)[0];
  return brand && m.model.toLowerCase().startsWith(brand.toLowerCase()) ? m.model : `${m.make || ""} ${m.model}`.trim();
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The values a template can use for one frame. `frame` is the cull page's
 * item: { name, meta: { captured "YYYY:MM:DD HH:MM:SS", make, model, lens,
 * iso, fNumber, exposureTime, focalLength } }, plus `seq` (1-based position).
 */
export function frameVars(frame = {}) {
  const m = frame.meta || {};
  const name = frame.name || "";
  const dot = name.lastIndexOf(".");
  const v = {
    file: name,
    stem: dot > 0 ? name.slice(0, dot) : name,
    camera: cameraName(m),
    lens: m.lens || "",
    iso: m.iso != null ? String(m.iso) : "",
    aperture: m.fNumber ? `f/${+Number(m.fNumber).toFixed(1)}` : "",
    shutter: m.exposureTime ? (m.exposureTime >= 1 ? `${+Number(m.exposureTime).toFixed(1)} s` : `1/${Math.round(1 / m.exposureTime)} s`) : "",
    focal: m.focalLength ? `${Math.round(m.focalLength)} mm` : "",
    seq: frame.seq != null ? String(frame.seq) : "",
    date: "", year: "", month: "", monthname: "", day: "", time: "",
  };
  const c = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(m.captured || "");
  if (c) {
    Object.assign(v, { date: `${c[1]}-${c[2]}-${c[3]}`, year: c[1], month: c[2], day: String(+c[3]), time: `${c[4]}:${c[5]}:${c[6]}` });
    v.monthname = MONTHS[+c[2] - 1] || "";
  }
  return v;
}

export const TEMPLATE_VARS = ["file", "stem", "date", "year", "month", "monthname", "day", "time", "camera", "lens", "iso", "aperture", "shutter", "focal", "seq"];

/** "{year} Jane Doe" -> "2026 Jane Doe". Unknown {names} stay as typed, so a typo shows in the output instead of vanishing. */
export function expandTemplate(s, vars) {
  return String(s || "").replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k.toLowerCase()) ? vars[k.toLowerCase()] : m));
}

/**
 * The resolved IPTC fields for one frame: the template's text fields with
 * variables filled in, its keywords plus the frame's own (`frame.keywords`).
 * Empty fields are left out, so mergeIptc leaves them alone.
 */
export function frameIptc(template = {}, frame = {}) {
  const vars = frameVars(frame);
  const codes = template.codes instanceof Map ? template.codes : parseCodes(template.codes);
  // Codes first, so a code's text may itself use {variables}.
  const fill = (s) => expandTemplate(expandCodes(s, codes), vars);
  const out = {};
  for (const k of Object.keys(IPTC_FIELDS)) {
    if (k === "keywords") continue;
    const v = fill(template[k]).trim();
    if (v) out[k] = v;
  }
  const own = (frame.keywords || []).map((k) => fill(k)).join(",");
  const kw = splitKeywords([...splitKeywords(fill(Array.isArray(template.keywords) ? template.keywords.join(",") : template.keywords)), ...splitKeywords(own)]);
  if (kw.length) {
    const { subject, hierarchy } = keywordBags(kw);
    out.keywords = subject;
    if (hierarchy.length) out.hierarchy = hierarchy;
  }
  return out;
}

// ---------------------------------------------------------------- reading

// The prefix `text` binds to namespace `uri`, or null.
function prefixFor(text, uri) {
  const m = new RegExp(`xmlns:([\\w.-]+)\\s*=\\s*["']${reEsc(uri)}["']`).exec(text);
  return m ? m[1] : null;
}

// Where property p:name is, as an attribute, an element with content, or empty.
function findProp(text, p, name) {
  const q = `${reEsc(p)}:${name}`;
  let m = new RegExp(`\\s${q}\\s*=\\s*(["'])([^"']*)\\1`).exec(text);
  if (m) return { index: m.index, length: m[0].length, form: "attr", inner: m[2] };
  m = new RegExp(`<${q}(\\s[^>]*)?/>`).exec(text);
  if (m) return { index: m.index, length: m[0].length, form: "empty", inner: "" };
  m = new RegExp(`<${q}(\\s[^>]*)?>([\\s\\S]*?)</${q}\\s*>`).exec(text);
  if (m) return { index: m.index, length: m[0].length, form: "elem", inner: m[2] };
  return null;
}

function liValues(inner) {
  const out = [];
  const re = /<([\w.-]+):li\b([^>]*)(?:\/>|>([\s\S]*?)<\/\1:li\s*>)/g;
  let m;
  while ((m = re.exec(inner))) out.push({ lang: (/xml:lang\s*=\s*["']([^"']*)["']/.exec(m[2]) || [])[1] || "", value: unesc((m[3] || "").trim()) });
  return out;
}

/** The IPTC fields an XMP packet or sidecar carries (only those present), e.g. to load a template from a captioned file. */
export function readIptc(text) {
  if (typeof text !== "string" || !/<x:xmpmeta\b|<rdf:RDF\b|<x:xapmeta\b/.test(text)) return null;
  const out = {};
  for (const [key, [nsKey, name, kind]] of Object.entries(XMP_FIELDS)) {
    const p = prefixFor(text, NS[nsKey]);
    if (!p) continue;
    const f = findProp(text, p, name);
    if (!f) continue;
    if (kind === "text") { const v = unesc(f.inner.trim()); if (v) out[key] = v; continue; }
    const lis = f.form === "attr" ? [{ lang: "", value: unesc(f.inner) }] : liValues(f.inner);
    if (kind === "alt") {
      const pick = lis.find((l) => l.lang === "x-default") || lis[0];
      if (pick && pick.value) out[key] = pick.value;
    } else {
      const vals = lis.map((l) => l.value).filter(Boolean);
      if (vals.length) out[key] = kind === "bag" ? vals : vals.join("; ");
    }
  }
  if (out.hierarchy) {
    // As a template: the paths, then the flat keywords no path already names.
    const paths = splitKeywords(out.hierarchy);
    const named = new Set(paths.flatMap((p) => p.split("|")).map((x) => x.toLowerCase()));
    const kw = splitKeywords([...paths, ...(out.keywords || []).filter((k) => !named.has(k.toLowerCase()))]);
    delete out.hierarchy;
    out.keywords = kw;
  }
  return out;
}

// ---------------------------------------------------------------- writing

function elementFor(p, name, kind, value, indent) {
  const i = indent, i2 = indent + " ", i3 = indent + "  ";
  if (kind === "text") return `${i}<${p}:${name}>${esc(value)}</${p}:${name}>`;
  if (kind === "alt") return `${i}<${p}:${name}>\n${i2}<rdf:Alt>\n${i3}<rdf:li xml:lang="x-default">${esc(value)}</rdf:li>\n${i2}</rdf:Alt>\n${i}</${p}:${name}>`;
  const tag = kind === "bag" ? "Bag" : "Seq";
  const vals = kind === "bag" ? value : splitCreators(value);
  return `${i}<${p}:${name}>\n${i2}<rdf:${tag}>\n${vals.map((v) => `${i3}<rdf:li>${esc(v)}</rdf:li>`).join("\n")}\n${i2}</rdf:${tag}>\n${i}</${p}:${name}>`;
}

// "Jane Doe; John Roe" -> two creators (IPTC's By-line is a list).
function splitCreators(s) { return String(s).split(";").map((x) => x.trim()).filter(Boolean); }

/**
 * `text` (an XMP sidecar) with the IPTC `fields` written in. Returns null
 * when there is no rdf:Description to write into. Text fields replace what
 * is there; keywords are added to the existing dc:subject bag; fields not in
 * `fields` are untouched.
 */
export function mergeIptc(text, fields = {}) {
  if (typeof text !== "string") return null;
  const d = /<([\w.-]+):Description\b/.exec(text);
  if (!d || !/<x:xmpmeta\b|<rdf:RDF\b/.test(text)) return null;
  const rdf = d[1];
  let out = text;
  const keys = Object.keys(XMP_FIELDS).filter((k) => (XMP_FIELDS[k][2] === "bag" ? fields[k] && fields[k].length : fields[k]));
  if (!keys.length) return out;

  // Open the Description (a self-closing one gets a closing tag) so elements can go inside.
  const openEnd = () => {
    const start = out.search(new RegExp(`<${reEsc(rdf)}:Description\\b`));
    let j = start, quote = "";
    for (; j < out.length; j++) {
      const ch = out[j];
      if (quote) { if (ch === quote) quote = ""; } else if (ch === '"' || ch === "'") quote = ch; else if (ch === ">") break;
    }
    if (out[j - 1] === "/") {
      out = `${out.slice(0, j - 1).replace(/\s+$/, "")}>\n  </${rdf}:Description>${out.slice(j + 1)}`;
      return openEnd();
    }
    return { start, end: j + 1 };
  };
  const bind = (nsKey) => {
    let p = prefixFor(out, NS[nsKey]);
    if (p) return p;
    p = nsKey;
    let n = 1;
    while (new RegExp(`xmlns:${reEsc(p)}\\s*=`).test(out)) p = `${nsKey}${++n}`;
    const at = openEnd().start + `<${rdf}:Description`.length;
    out = `${out.slice(0, at)}\n    xmlns:${p}="${NS[nsKey]}"${out.slice(at)}`;
    return p;
  };

  for (const key of keys) {
    const [nsKey, name, kind] = XMP_FIELDS[key];
    const p = bind(nsKey);
    const f = findProp(out, p, name);
    let value = fields[key];
    if (kind === "bag" && f) {
      const have = f.form === "attr" ? [unesc(f.inner)] : liValues(f.inner).map((l) => l.value);
      // Existing entries are kept as written; new ones added unless already there (case ignored).
      const seen = new Set();
      value = [...have, ...value].filter((v) => v && !seen.has(v.toLowerCase()) && seen.add(v.toLowerCase()));
    }
    if (kind === "alt" && f && f.form === "elem") {
      // Keep other languages; replace x-default (or the only entry).
      const lis = liValues(f.inner);
      const others = lis.filter((l) => l.lang && l.lang !== "x-default");
      if (others.length) {
        const i = "  ";
        const items = [`<rdf:li xml:lang="x-default">${esc(value)}</rdf:li>`, ...others.map((l) => `<rdf:li xml:lang="${esc(l.lang)}">${esc(l.value)}</rdf:li>`)];
        const el = `<${p}:${name}>\n${i}   <rdf:Alt>\n${items.map((x) => `${i}    ${x}`).join("\n")}\n${i}   </rdf:Alt>\n${i}  </${p}:${name}>`;
        out = out.slice(0, f.index) + el + out.slice(f.index + f.length);
        continue;
      }
    }
    if (f && f.form === "attr" && kind === "text") {
      out = `${out.slice(0, f.index)} ${p}:${name}="${esc(value)}"${out.slice(f.index + f.length)}`;
      continue;
    }
    if (f) out = out.slice(0, f.index) + out.slice(f.index + f.length); // replaced by an element below
    const { end } = openEnd();
    out = `${out.slice(0, end)}\n${elementFor(p, name, kind, value, "   ")}${out.slice(end)}`;
  }
  return out;
}
