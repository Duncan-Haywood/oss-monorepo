// Structure and value checks for an ABRASF municipal NFS-e file (layouts 2.03 and 2.04),
// read from the ABRASF XSDs by build-abrasf-schema.mjs. The schema is the first gate a
// municipal web service applies; a file that fails it is refused before any tax rule.
//   ABR-002 an element the schema does not allow here, or one too many
//   ABR-003 elements out of sequence, or content the schema's model cannot place
//   ABR-004 a required element missing
//   ABR-005 a value outside its length / pattern / range / digits / code list
//   ABR-006 a required attribute missing, or an attribute the schema does not define
// The matcher is the one fa3-xsd.mjs uses (a set-of-positions walk over the content model),
// with ds:Signature taken as free content and the element namespace checked.
import data from "./abrasf-xsd-data.mjs";

export const ABRASF_NS = "http://www.abrasf.org.br/nfse.xsd";
export const VERSIONS = Object.keys(data.versions);
export const SOURCE = data.source;
const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

const regexCache = new Map();
const xsdRegex = (source) => {
  let re = regexCache.get(source);
  if (!re) regexCache.set(source, (re = new RegExp(`^(?:${source})$`, "u")));
  return re;
};

const COLLAPSE = new Set(["token", "decimal", "integer", "nonNegativeInteger", "positiveInteger", "byte", "unsignedByte", "short", "int", "long", "date", "dateTime", "boolean"]);
const WHOLE = { integer: [-Infinity, Infinity], nonNegativeInteger: [0, Infinity], positiveInteger: [1, Infinity], byte: [-128, 127], unsignedByte: [0, 255], short: [-32768, 32767], int: [-2147483648, 2147483647], long: [-Infinity, Infinity] };

function checker(schema) {
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

  function valueProblem(type, raw) {
    const t = fold(type);
    const ws = t.whiteSpace ?? (COLLAPSE.has(t.base) ? "collapse" : t.base === "normalizedString" ? "replace" : "preserve");
    const value = ws === "collapse" ? raw.trim().replace(/\s+/g, " ") : ws === "replace" ? raw.replace(/[\t\r\n]/g, " ") : raw;
    const chars = [...value].length;
    if (t.length !== undefined && chars !== t.length) return `must be exactly ${t.length} characters (it has ${chars})`;
    if (t.minLength !== undefined && chars < t.minLength) return chars ? `must be at least ${t.minLength} characters` : "is empty";
    if (t.maxLength !== undefined && chars > t.maxLength) return `is longer than ${t.maxLength} characters (${chars})`;
    const whole = Object.hasOwn(WHOLE, t.base) ? WHOLE[t.base] : undefined;
    // XSD collapses the spaces around an xs:int, xs:date or xs:dateTime, but libxml2 (xmllint, PHP's
    // DOMDocument::schemaValidate, which many Brazilian ERPs use) rejects them: measured in
    // eval/abrasf-xsd-diff.mjs (it trims them for xs:byte and xs:nonNegativeInteger). A space
    // there is never wanted, so it is reported.
    if (["int", "date", "dateTime"].includes(t.base) && raw !== raw.trim() && value) return "has a space before or after it, which libxml2-based validators (xmllint, PHP) reject though XSD would trim it";
    if (whole && !/^[+-]?\d+$/.test(value)) return value ? "is not a whole number" : "is empty";
    if (whole && (Number(value) < whole[0] || Number(value) > whole[1])) return `is outside the range of xs:${t.base}`;
    if (t.base === "decimal" && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return value ? "is not a number (use a point for decimals, no thousands separator)" : "is empty";
    const dateOk = (v) => !Number.isNaN(Date.parse(v.slice(0, 10))) && new Date(v.slice(0, 10) + "T00:00:00Z").toISOString().slice(0, 10) === v.slice(0, 10);
    if (t.base === "date" && !(/^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && dateOk(value))) return "is not a YYYY-MM-DD date";
    if (t.base === "dateTime" && !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value) && dateOk(value))) return "is not a date and time (YYYY-MM-DDThh:mm:ss)";
    if (t.base === "decimal" || whole) {
      // Significant digits as XSD counts them: no leading zeros, no trailing fraction zeros.
      const intPart = value.replace(/^[+-]/, "").split(".")[0].replace(/^0+/, "");
      const frac = (value.split(".")[1] ?? "").replace(/0+$/, "");
      if (t.totalDigits !== undefined && Math.max(1, intPart.length + frac.length) > t.totalDigits) return `has more than ${t.totalDigits} digits`;
      if (t.fractionDigits !== undefined && frac.length > t.fractionDigits) return `has more than ${t.fractionDigits} decimal places`;
      const n = Number(value);
      if (t.minInclusive !== undefined && n < t.minInclusive) return `is below ${t.minInclusive}`;
      if (t.maxInclusive !== undefined && n > t.maxInclusive) return `is above ${t.maxInclusive}`;
    }
    if (!t.patterns.every((alts) => alts.some((p) => xsdRegex(p).test(value)))) return /^\s|\s$/.test(raw) && ws === "preserve" ? "starts or ends with a space, which the schema's pattern does not allow" : "does not match the format the schema requires";
    if (t.enum && !t.enum.includes(value)) return t.enum.length <= 16 ? `is not one of ${t.enum.join(", ")}` : "is not in the schema's code list";
    return "";
  }

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
    return { ok: rep(model, 0).has(kids.length), far, need };
  }

  const infoCache = new Map();
  function info(typeName) {
    let i = infoCache.get(typeName);
    if (i) return i;
    const types = new Map(), max = new Map();
    const mentions = (p, present) => (p.k === "e" ? present.has(p.name) : p.items.some((it) => mentions(it, present)));
    const required = (p, forced, present, out) => {
      if (!p) return;
      if (p.k === "e") { if (p.min > 0 && forced) out.add(p.name); return; }
      if (p.k === "c") return;
      const wanted = (forced && p.min > 0) || p.items.some((it) => mentions(it, present));
      p.items.forEach((it) => required(it, wanted, present, out));
    };
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
    const known = new Set(def.attrs.map((a) => a.name));
    for (const a of def.attrs) {
      const got = node.attrs?.[a.name];
      if (got === undefined) {
        if (a.use === "required") out.push(finding("ABR-006", `${node.name} is missing its required attribute ${a.name}.`, `Add ${a.name} to ${node.name}.`, `${path}/@${a.name}`));
      } else {
        const problem = valueProblem(a.type, got);
        if (problem) out.push(finding("ABR-005", `Attribute ${a.name} of ${node.name} ${problem}.`, `Correct ${a.name} on ${node.name}.`, `${path}/@${a.name}`));
      }
    }
    for (const k of Object.keys(node.attrs || {})) {
      if (k.includes(":") || known.has(k)) continue;
      out.push(finding("ABR-006", `${node.name} carries an attribute the ABRASF schema does not define: ${k}.`, `Remove ${k} or check its spelling.`, `${path}/@${k}`));
    }
    const kids = node.children.filter((c) => c.name);
    if (!def.model) {
      for (const c of kids) out.push(finding("ABR-002", `${c.name} is not allowed inside ${node.name}.`, `Remove ${c.name}.`, `${path}/${c.name}`));
      return;
    }
    const count = new Map();
    const seen = [];
    let structural = false;
    for (const c of kids) {
      const t = types.get(c.name);
      if (!t || (t !== "#any" && c.ns !== ABRASF_NS)) {
        structural = true;
        out.push(finding("ABR-002", t ? `${c.name} inside ${node.name} is not in the ABRASF namespace (${ABRASF_NS}).` : `${c.name} is not allowed inside ${node.name}.`,
          t ? "Declare xmlns=\"http://www.abrasf.org.br/nfse.xsd\" so every element is in it (a default namespace dropped on a child is the usual cause)." : `Remove ${c.name}, or check its spelling (element names are case-sensitive) and where the schema puts it.`, `${path}/${c.name}`));
        continue;
      }
      const n = (count.get(c.name) ?? 0) + 1;
      count.set(c.name, n);
      const limit = max.get(c.name);
      if (limit >= 0 && n > limit) {
        structural = true;
        if (n === limit + 1) out.push(finding("ABR-002", `${c.name} appears more than ${limit === 1 ? "once" : `${limit} times`} in ${node.name}.`, `Keep at most ${limit} ${c.name}.`, `${path}/${c.name}`));
        continue;
      }
      seen.push(c);
    }
    const present = new Set(seen.map((c) => c.name));
    for (const name of required(present)) {
      if (!present.has(name)) { structural = true; out.push(finding("ABR-004", `${name} is required in ${node.name} and is missing.`, `Add ${name} to ${node.name}.`, `${path}/${name}`)); }
    }
    if (!structural) {
      const m = matcher(def.model, seen);
      if (!m.ok) {
        const at = seen[m.far];
        if (at) {
          const before = seen.slice(0, m.far).reverse().find((k) => k.name !== at.name);
          out.push(finding("ABR-003", `${at.name} is out of place in ${node.name}${before ? `: it cannot follow ${before.name}` : ""}.`, `Put ${at.name} where the schema's sequence places it; the web service rejects elements out of order.`, `${path}/${at.name}`));
        } else {
          const names = [...(m.need.get(m.far) ?? [])];
          out.push(finding("ABR-004", `${node.name} is incomplete${names.length ? `: the schema expects ${names.join(" or ")} next` : ""}.`, `Add the missing element${names.length === 1 ? "" : "s"} to ${node.name}.`, path));
        }
      }
    }
    for (const c of seen) {
      const t = types.get(c.name);
      if (t === "#any") continue;
      const same = seen.filter((k) => k.name === c.name);
      const where = same.length > 1 ? `${path}/${c.name}[${same.indexOf(c) + 1}]` : `${path}/${c.name}`;
      if (schema.complex[t]) checkNode(c, t, where, out);
      else if (c.children.some((k) => k.name)) out.push(finding("ABR-002", `${c.name} should hold a value, not elements.`, "Check the file's structure.", where));
      else {
        const problem = valueProblem(t, c.text);
        if (problem) out.push(finding("ABR-005", `${c.name} ${problem}.`, `Correct ${c.name}; the web service refuses a file whose values break the schema.`, where));
      }
    }
  }
  return { checkNode, valueProblem };
}

const checkers = {};
const get = (v) => (checkers[v] ||= checker(data.versions[v]));

/** Root element names a layout declares (GerarNfseEnvio, EnviarLoteRpsEnvio, CompNfse, ...). */
export const rootsOf = (version) => Object.keys(data.versions[version].roots);

/** Check `node` (a declared root element) against layout `version`. */
export function checkAgainstAbrasf(node, version, path = `/${node.name}`) {
  const out = [];
  const type = data.versions[version].roots[node.name];
  if (!type) return out;
  get(version).checkNode(node, type, path, out);
  return out;
}

export const abrasfValueProblem = (version, type, raw) => get(version).valueProblem(type, raw);
