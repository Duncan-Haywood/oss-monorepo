// Structure and value checks for a Polish KSeF FA(3) invoice, read from the
// Ministry of Finance schema (schemat_FA(3)_v1-0E.xsd) by build-fa3-schema.mjs.
// The XSD is the first gate KSeF applies; a file that fails it is refused before
// any business rule.
//   PL-012 an element the schema does not allow here, or one too many
//   PL-013 elements out of sequence, or content the schema's model cannot place
//   PL-014 a required element missing
//   PL-015 a value outside its length / pattern / range / digits / code list
//   PL-016 a required attribute missing or a fixed one with another value
//   PL-017 the XML is not well formed (a cut-off file, a mismatched tag)
// Messages name the element and the reason and never echo the value.
import schema from "./fa3-xsd-data.mjs";
import { wellFormed } from "./fatturapa-xsd.mjs";

const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

const regexCache = new Map();
const xsdRegex = (source) => {
  let re = regexCache.get(source);
  if (!re) regexCache.set(source, (re = new RegExp(`^(?:${source})$`, "u")));
  return re;
};

// A simple type's facets, folded down its derivation chain: the nearest definition wins
// for a limit, every level's patterns must hold (a level's own alternatives are OR-ed).
const foldCache = new Map();
function fold(type) {
  if (foldCache.has(type)) return foldCache.get(type);
  const def = schema.simple[type];
  let r;
  if (!def) r = { base: type, patterns: [] };
  else {
    const up = fold(def.base);
    const { pattern, ...own } = def;
    r = { ...up, ...own, base: up.base, patterns: pattern ? [...up.patterns, pattern] : up.patterns };
  }
  foldCache.set(type, r);
  return r;
}

const COLLAPSE = new Set(["token", "decimal", "integer", "nonNegativeInteger", "byte", "int", "long", "date", "dateTime", "boolean", "gYear"]);

function valueProblem(type, raw) {
  const t = fold(type);
  const ws = t.whiteSpace ?? (COLLAPSE.has(t.base) ? "collapse" : t.base === "normalizedString" ? "replace" : "preserve");
  const value = ws === "collapse" ? raw.trim().replace(/\s+/g, " ") : ws === "replace" ? raw.replace(/[\t\r\n]/g, " ") : raw;
  const chars = [...value].length;
  if (t.length !== undefined && chars !== t.length) return `must be exactly ${t.length} characters`;
  if (t.minLength !== undefined && chars < t.minLength) return chars ? `must be at least ${t.minLength} characters` : "is empty";
  if (t.maxLength !== undefined && chars > t.maxLength) return `is longer than ${t.maxLength} characters`;
  const whole = ["integer", "nonNegativeInteger", "byte", "int", "long"].includes(t.base);
  if (whole && !/^[+-]?\d+$/.test(value)) return "is not a whole number";
  if (t.base === "nonNegativeInteger" && value.startsWith("-")) return "must not be negative";
  if (t.base === "decimal" && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return "is not a number";
  if (t.base === "date" && !(/^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10))))) return "is not a YYYY-MM-DD date";
  if (t.base === "dateTime" && !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10))))) return "is not a date and time (YYYY-MM-DDThh:mm:ss)";
  if (t.base === "gYear" && !/^-?\d{4,}(Z|[+-]\d{2}:\d{2})?$/.test(value)) return "is not a year";
  if (t.base === "boolean" && !["true", "false", "1", "0"].includes(value)) return "is not true or false";
  if (t.base === "decimal" || whole) {
    const digits = value.replace(/^[+-]/, "").replace(".", "");
    const frac = (value.split(".")[1] ?? "").replace(/0+$/, "");
    if (t.totalDigits !== undefined && digits.replace(/^0+(?=\d)/, "").length > t.totalDigits) return `has more than ${t.totalDigits} digits`;
    if (t.fractionDigits !== undefined && frac.length > t.fractionDigits) return `has more than ${t.fractionDigits} decimal places`;
    const n = Number(value);
    if (t.minInclusive !== undefined && n < t.minInclusive) return `is below ${t.minInclusive}`;
    if (t.maxInclusive !== undefined && n > t.maxInclusive) return `is above ${t.maxInclusive}`;
    if (t.minExclusive !== undefined && n <= t.minExclusive) return `must be above ${t.minExclusive}`;
    if (t.maxExclusive !== undefined && n >= t.maxExclusive) return `must be below ${t.maxExclusive}`;
  }
  if (t.base === "date" && typeof t.minInclusive === "string" && value.slice(0, 10) < t.minInclusive) return `is before ${t.minInclusive}`;
  if (t.base === "date" && typeof t.maxInclusive === "string" && value.slice(0, 10) > t.maxInclusive) return `is after ${t.maxInclusive}`;
  if (t.base === "gYear" && (Number(value.slice(0, 4)) < (t.minInclusive ?? -Infinity) || Number(value.slice(0, 4)) > (t.maxInclusive ?? Infinity))) return "is outside the years the schema allows";
  if (!t.patterns.every((alts) => alts.some((p) => xsdRegex(p).test(value)))) return "does not match the format the schema requires";
  if (t.enum && !t.enum.includes(value)) return t.enum.length <= 16 ? `is not one of ${t.enum.join(", ")}` : "is not in the schema's code list";
  return "";
}

// Content-model matching. ends(p, pos) is the set of child positions reachable after
// one occurrence of particle p; rep() applies its occurrence counts. `need` records,
// per position, the element names the model tried and did not find (for diagnosis).
function matcher(model, kids) {
  const need = new Map();
  let far = 0;
  const memo = new Map();
  const ids = new Map();
  const ends = (p, pos) => {
    if (p.k === "e") {
      if (kids[pos] && kids[pos].name === p.name) { far = Math.max(far, pos + 1); return new Set([pos + 1]); }
      if (!need.has(pos)) need.set(pos, new Set());
      need.get(pos).add(p.name);
      return new Set();
    }
    if (p.k === "c") return new Set(p.items.flatMap((it) => [...rep(it, pos)]));
    let cur = new Set([pos]);
    for (const it of p.items) {
      const next = new Set();
      for (const q of cur) for (const r of rep(it, q)) next.add(r);
      cur = next;
    }
    return cur;
  };
  const rep = (p, pos) => {
    if (!ids.has(p)) ids.set(p, ids.size);
    const key = `${ids.get(p)}:${pos}`;
    if (memo.has(key)) return memo.get(key);
    const out = new Set();
    let layer = new Set([pos]);
    if (p.min === 0) out.add(pos);
    for (let count = 1; layer.size && (p.max < 0 || count <= p.max) && count <= kids.length + p.min + 1; count++) {
      const next = new Set();
      for (const q of layer) for (const r of ends(p, q)) next.add(r);
      if (count >= p.min) next.forEach((r) => out.add(r));
      layer = next;
    }
    memo.set(key, out);
    return out;
  };
  const ok = rep(model, 0).has(kids.length);
  return { ok, far, need };
}

const infoCache = new Map();
/** Element names a complex type allows, their child types, and how often each may occur. */
function info(typeName) {
  let i = infoCache.get(typeName);
  if (i) return i;
  const types = new Map();
  const max = new Map();
  const required = (p, forced, present, out) => {
    if (!p) return;
    if (p.k === "e") { if (p.min > 0 && forced) out.add(p.name); return; }
    if (p.k === "c") return;
    const wanted = forced && p.min > 0 || p.items.some((it) => mentions(it, present));
    p.items.forEach((it) => required(it, wanted, present, out));
  };
  const mentions = (p, present) => (p.k === "e" ? present.has(p.name) : p.items.some((it) => mentions(it, present)));
  const walk = (p, mult) => {
    if (p.k === "e") {
      if (!types.has(p.name)) types.set(p.name, p.type);
      const m = mult < 0 || p.max < 0 ? -1 : mult * p.max;
      const prev = max.get(p.name);
      max.set(p.name, prev === undefined ? m : prev < 0 || m < 0 ? -1 : Math.max(prev, m));
      return;
    }
    p.items.forEach((it) => walk(it, mult < 0 || p.max < 0 ? -1 : mult * p.max));
  };
  const def = schema.complex[typeName];
  if (def.model) walk(def.model, 1);
  i = { types, max, def, required: (present) => { const out = new Set(); required(def.model, true, present, out); return out; } };
  infoCache.set(typeName, i);
  return i;
}

function checkNode(node, typeName, path, out) {
  const { types, max, def, required } = info(typeName);
  for (const a of def.attrs) {
    const got = node.attrs?.[a.name];
    if (got === undefined) {
      if (a.use === "required") out.push(finding("PL-016", `${node.name} is missing its required attribute ${a.name}.`, `Add ${a.name} to ${node.name}.`, path));
    } else if (a.fixed !== undefined && got !== a.fixed) {
      out.push(finding("PL-016", `Attribute ${a.name} of ${node.name} must be "${a.fixed}".`, `Set ${a.name}="${a.fixed}"; FA(3) allows no other value.`, path));
    } else {
      const problem = valueProblem(a.type, got);
      if (problem) out.push(finding("PL-015", `Attribute ${a.name} of ${node.name} ${problem}.`, `Correct ${a.name} on ${node.name}.`, path));
    }
  }
  if (def.text) {
    const problem = valueProblem(def.text, node.text);
    if (problem) out.push(finding("PL-015", `${node.name} ${problem}.`, `Correct ${node.name}; KSeF refuses a file whose values break the schema.`, path));
    return;
  }
  if (!def.model) return;
  const count = new Map();
  const seen = [];
  for (const c of node.children) {
    if (!types.has(c.name)) {
      out.push(finding("PL-012", `${c.name} is not allowed inside ${node.name}.`, `Remove ${c.name}, or move it to the block where the schema defines it.`, `${path}/${c.name}`));
      continue;
    }
    const n = (count.get(c.name) ?? 0) + 1;
    count.set(c.name, n);
    const limit = max.get(c.name);
    if (limit >= 0 && n > limit) {
      if (n === limit + 1) out.push(finding("PL-012", `${c.name} appears more than ${limit === 1 ? "once" : `${limit} times`} in ${node.name}.`, `Keep at most ${limit} ${c.name}.`, `${path}/${c.name}`));
      continue;
    }
    seen.push(c);
  }
  const present = new Set(seen.map((c) => c.name));
  let problems = out.length;
  for (const name of required(present)) {
    if (!present.has(name)) out.push(finding("PL-014", `${name} is required in ${node.name} and is missing.`, `Add ${name} to ${node.name}.`, `${path}/${name}`));
  }
  if (out.length === problems && !out.some((f) => f.path.startsWith(`${path}/`) && f.rule === "PL-012")) {
    const m = matcher(def.model, seen);
    if (!m.ok) {
      const at = seen[m.far];
      if (at) {
        const before = seen.slice(0, m.far).reverse().find((k) => k.name !== at.name);
        out.push(finding("PL-013", `${at.name} is out of place in ${node.name}${before ? `: it cannot follow ${before.name}` : ""}.`,
          `Put ${at.name} where the schema sequence places it; KSeF rejects elements out of order.`, `${path}/${at.name}`));
      } else {
        const names = [...(m.need.get(m.far) ?? [])];
        out.push(finding("PL-014", `${node.name} is incomplete${names.length ? `: the schema expects ${names.join(" or ")} next` : ""}.`,
          `Add the missing element${names.length === 1 ? "" : "s"} to ${node.name}.`, path));
      }
    }
  }
  for (const c of seen) {
    const t = types.get(c.name);
    const idx = node.children.filter((k) => k.name === c.name);
    const where = idx.length > 1 ? `${path}/${c.name}[${idx.indexOf(c) + 1}]` : `${path}/${c.name}`;
    if (schema.complex[t]) checkNode(c, t, where, out);
    else {
      const problem = valueProblem(t, c.text);
      if (problem) out.push(finding("PL-015", `${c.name} ${problem}.`, `Correct ${c.name}; KSeF refuses a file whose values break the schema.`, where));
    }
  }
}

/** @param root the Faktura node from parseXmlTree */
export function checkAgainstFa3Schema(root, text) {
  const out = [];
  if (text && !wellFormed(text)) {
    out.push(finding("PL-017", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.",
      "Re-export the file; if it was edited by hand, close every tag in the order it was opened.", "/Faktura"));
    return out;
  }
  checkNode(root, schema.root, "/Faktura", out);
  return out;
}
