// Structure and value checks for an ABRASF municipal NFS-e file (layouts 2.00 to 2.04),
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

// Elements some providers add to the ABRASF model, as seen in their published sample files
// (README, "ABRASF 2.00 to 2.02"). The schema finding stands, since the ABRASF schema does
// not allow them; the note says whose extension it is, so a file meant for that provider's
// city is not "fixed" by deleting a field its web service wants.
const PROVIDER_EXTRA = {
  "LoteRps/Token": "Token in LoteRps is an AVMB extension (its 2.02 samples carry it): keep it if the city runs AVMB's system.",
  "InfDeclaracaoPrestacaoServico/DataPagamento": "DataPagamento is a Fintel extension (its 2.02 samples carry it): keep it if the city runs Fintel's system.",
  "InfDeclaracaoPrestacaoServico/IBSCBS": "IBSCBS is the 2026 tax-reform (IBS/CBS) group some providers have added to their ABRASF layout (WebISS's 2.02 RTC sample carries it): keep it if the city's provider asks for it.",
  "Servico/CodigoNBS": "CodigoNBS is a tax-reform (NBS service code) field some providers have added (Sonner's 2.01 samples carry it): keep it if the city's provider asks for it.",
  "Servico/MunicipioPrestacao": "MunicipioPrestacao is a tax-reform field Sonner's 2.01 RTC sample carries: keep it if the city's provider asks for it.",
  "Servico/PaisPrestacao": "PaisPrestacao is a tax-reform field Sonner's 2.01 RTC sample carries: keep it if the city's provider asks for it.",
  "InfNfse/tsStatusRps": "tsStatusRps is not an ABRASF element; it appears in replies from at least one city's own system (Campo Novo do Parecis), so it comes from the city, not from your RPS.",
  "InfNfse/tsStatusNfse": "tsStatusNfse is not an ABRASF element; it appears in replies from at least one city's own system (Campo Novo do Parecis), so it comes from the city, not from your RPS.",
};

// XSD regular expressions have no anchors: outside a character class ^ and $ are ordinary
// characters (XML Schema Part 2, appendix F), and xmllint reads them so. ISSNet 1.00 writes
// tsCompetencia as "^20(09|[1-9]\d)(0[1-9]|1[0-2])$", which therefore matches no real month;
// they are escaped here so this check agrees with xmllint.
const literalAnchors = (source) => {
  let out = "", inClass = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === "\\") { out += ch + (source[++i] ?? ""); continue; }
    if (inClass) { if (ch === "]") inClass = false; out += ch; continue; }
    if (ch === "[") { inClass = true; out += ch; if (source[i + 1] === "^") out += source[++i]; continue; }
    out += ch === "^" || ch === "$" ? `\\${ch}` : ch;
  }
  return out;
};
const hasLiteralAnchor = (source) => literalAnchors(source) !== source;
const regexCache = new Map();
const xsdRegex = (source) => {
  let re = regexCache.get(source);
  if (!re) regexCache.set(source, (re = new RegExp(`^(?:${literalAnchors(source)})$`, "u")));
  return re;
};

const COLLAPSE = new Set(["token", "decimal", "integer", "nonNegativeInteger", "positiveInteger", "byte", "unsignedByte", "short", "int", "long", "unsignedInt", "date", "dateTime", "boolean"]);
const LIBXML_NO_TRIM = new Set(["byte", "unsignedByte", "short", "int", "long", "unsignedInt", "date", "dateTime"]);
const WHOLE = { integer: [-Infinity, Infinity], nonNegativeInteger: [0, Infinity], positiveInteger: [1, Infinity], byte: [-128, 127], unsignedByte: [0, 255], short: [-32768, 32767], int: [-2147483648, 2147483647], unsignedInt: [0, 4294967295], long: [-Infinity, Infinity] };

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
    // A union (DSF's tpCEPNulo = tpCEP | nulo): valid when any member accepts the value;
    // otherwise the first member's reason, which is the one a non-empty value means.
    const u = schema.simple[type]?.union;
    if (u) {
      // libxml2 collapses a union's value before trying its members (a space before a
      // dateTime in DSF's tpDataHoraNulo = tpDataHora | nulo passes xmllint).
      const why = u.map((m) => valueProblem(m, raw.trim().replace(/\s+/g, " ")));
      return why.includes("") ? "" : why[0];
    }
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
    // eval/abrasf-xsd-diff.mjs (it trims them for xs:nonNegativeInteger). A space
    // there is never wanted, so it is reported. libxml2 does collapse it when the type, or one
    // it derives from, carries a pattern or enumeration facet (measured 2026-11-13 on xs:int and
    // xs:date: " 1" passes an int restricted by pattern [1-3] or enumeration 1, fails a bare
    // int or one with only totalDigits or a range), so there it is checked as XSD reads it.
    // Measured again 2026-11-13 with xmllint 2.9 on one-step restrictions of each built-in
    // type (eval/dsf-2026-11-13.md): a leading or trailing space is refused by xs:byte,
    // unsignedByte, short, int, long, unsignedInt, date and dateTime, bare, with a range, or
    // with an explicit whiteSpace="collapse" facet; it is accepted once a pattern or an
    // enumeration is in the derivation, and always for xs:integer, nonNegativeInteger,
    // positiveInteger, decimal and boolean. (The earlier note that libxml2 trims xs:byte was
    // wrong.) Union types are trimmed before their members are tried (see valueProblem).
    if (LIBXML_NO_TRIM.has(t.base) && !t.patterns.length && !t.enum && raw !== raw.trim() && value) return "has a space before or after it, which libxml2-based validators (xmllint, PHP) reject though XSD would trim it";
    if (t.base === "boolean" && !["true", "false", "1", "0"].includes(value)) return value ? "is not true, false, 1 or 0" : "is empty";
    if (t.base === "base64Binary") {
      const b = value.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b) || b.length % 4) return "is not valid base64 (letters, digits, + and /, in groups of four)";
    }
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
    const failed = t.patterns.find((alts) => !alts.some((p) => xsdRegex(p).test(value)));
    if (failed && failed.some(hasLiteralAnchor) && !/[\^$]/.test(value)) return `does not match the schema's pattern ${failed.join(" | ")}, which no ordinary value can: XSD reads ^ and $ as literal characters, not anchors, so xmllint and other libxml2-based validators reject every value here (${failed.some((p) => new RegExp(`^(?:${p})$`, "u").test(value)) ? `a validator that reads them as anchors would accept ${JSON.stringify(value)}` : `read as anchors it would still refuse ${JSON.stringify(value)}`}; ask the provider which one its web service runs)`;
    if (failed) return /^\s|\s$/.test(raw) && ws === "preserve" ? "starts or ends with a space, which the schema's pattern does not allow" : "does not match the format the schema requires";
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
      if (p.k === "a") {
        // <xs:all>: each member at most once, in any order; the group ends wherever every
        // required member has been seen (members are single elements, max 1).
        const names = new Map(p.items.map((it) => [it.name, it]));
        const out = new Set();
        const used = new Set();
        const done = () => p.items.every((it) => it.min === 0 || used.has(it.name));
        if (done()) out.add(pos);
        for (let q = pos; q < kids.length && names.has(kids[q].name) && !used.has(kids[q].name); q++) {
          used.add(kids[q].name);
          far = Math.max(far, q + 1);
          if (done()) out.add(q + 1);
        }
        if (!out.size) {
          if (!need.has(pos + used.size)) need.set(pos + used.size, new Set());
          for (const it of p.items) if (it.min > 0 && !used.has(it.name)) need.get(pos + used.size).add(it.name);
        }
        return out;
      }
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
    const types = new Map(), max = new Map(), nsOf = new Map(), dflt = new Map();
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
        if (!types.has(p.name)) { types.set(p.name, p.type); nsOf.set(p.name, p.ns ?? schema.namespace); if (p.d !== undefined) dflt.set(p.name, p.d); }
        const m = mult < 0 || p.max < 0 ? -1 : mult * p.max;
        const prev = max.get(p.name);
        max.set(p.name, prev === undefined ? m : prev < 0 || m < 0 ? -1 : Math.max(prev, m));
        return;
      }
      p.items.forEach((it) => walk(it, mult < 0 || p.max < 0 ? -1 : mult * p.max));
    };
    const def = schema.complex[typeName];
    if (def.model) walk(def.model, 1);
    i = { types, max, nsOf, dflt, def, required: (present) => { const out = new Set(); required(def.model, true, present, out); return out; } };
    infoCache.set(typeName, i);
    return i;
  }

  function checkNode(node, typeName, path, out) {
    const { types, max, nsOf, dflt, def, required } = info(typeName);
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
    // Every complex type these layouts define has element-only (or empty) content, so text
    // there is refused (xmllint: "Character content other than whitespace is not allowed").
    if (!kids.length && (node.text ?? "").trim()) out.push(finding("ABR-002", `${node.name} holds text ("${node.text.trim().slice(0, 40)}"), but the schema gives it elements only${def.model ? "" : " (it is an empty element)"}.`, `Remove the text from ${node.name}${def.model ? " and give it its elements" : ""}.`, path));
    if (!def.model) {
      for (const c of kids) out.push(finding("ABR-002", `${c.name} is not allowed inside ${node.name}.`, `Remove ${c.name}.`, `${path}/${c.name}`));
      return;
    }
    const count = new Map();
    const seen = [];
    const misplacedNs = new Set(); // known names in the wrong namespace: reported once, not again as missing
    let structural = false;
    for (const c of kids) {
      const t = types.get(c.name);
      const want = t && nsOf.get(c.name);
      if (!t || (t !== "#any" && c.ns !== want)) {
        structural = true;
        if (t) misplacedNs.add(c.name);
        const abrasf = want === ABRASF_NS;
        // An unqualified layout (Betha 1.00) leaves every local element in no namespace: only
        // the message root is in the provider's namespace.
        const none = want === "";
        out.push(finding("ABR-002", t ? (abrasf ? `${c.name} inside ${node.name} is not in the ABRASF namespace (${ABRASF_NS}).` : none ? `${c.name} inside ${node.name} is in namespace ${c.ns}, but this layout's schema (elementFormDefault unqualified) puts every element below the message root in no namespace.` : `${c.name} inside ${node.name} is in ${c.ns ? `namespace ${c.ns}` : "no namespace"}, but the schema puts it in ${want}.`) : `${c.name} is not allowed inside ${node.name}.`,
          t ? (abrasf ? "Declare xmlns=\"http://www.abrasf.org.br/nfse.xsd\" so every element is in it (a default namespace dropped on a child is the usual cause)." : none ? `Keep the default xmlns on the message root and add xmlns="" to each of its direct children (<${c.name} xmlns="">, as OpenAC.Net.NFSe's Betha writer does), or put the root in the namespace with a prefix (<e:${node.name} xmlns:e="...">) and leave the children unprefixed.` : `Put ${c.name} in ${want} (in this provider's layout the message's own elements and the shared types sit in different namespaces, so a prefix such as tipos: matters).`) : `Remove ${c.name}, or check its spelling (element names are case-sensitive) and where the schema puts it.${PROVIDER_EXTRA[`${node.name}/${c.name}`] ? ` ${PROVIDER_EXTRA[`${node.name}/${c.name}`]}` : ""}`, `${path}/${c.name}`));
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
      if (!present.has(name) && !misplacedNs.has(name)) { structural = true; out.push(finding("ABR-004", `${name} is required in ${node.name} and is missing.`, `Add ${name} to ${node.name}.`, `${path}/${name}`)); }
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
        const problem = valueProblem(t, c.text === "" && dflt.has(c.name) ? dflt.get(c.name) : c.text);
        if (problem) out.push(finding("ABR-005", `${c.name} ${problem}.`, `Correct ${c.name}; the web service refuses a file whose values break the schema.`, where));
      }
    }
  }
  return { checkNode, valueProblem };
}

// A provider's own copy of an ABRASF schema ("ISSNet 2.04"): either the name of the ABRASF
// layout it is identical to, or a delta on one (types added or changed, names dropped).
export const PROVIDER_LAYOUTS = Object.keys(data.providers);
/** The ABRASF layout a provider copy is identical to, or "" if it differs. */
export const providerSameAs = (key) => (typeof data.providers[key] === "string" ? data.providers[key] : "");
/** The ABRASF layout a provider copy is built on (identical to, or a delta on). */
export const providerBase = (key) => providerSameAs(key) || data.providers[key]?.base || "";
/** What OpenAC.Net.NFSe's municipality list says a city runs: { listed: "Provider versao",
 *  key: the provider copy read here ("" if none; names matched ignoring case), city: "Name/UF" },
 *  or null for a city the list does not carry. */
export function cityProvider(ibge) {
  const v = data.cities[String(ibge).trim()];
  if (!v) return null;
  const [listed, city] = v.split("|");
  const key = PROVIDER_LAYOUTS.find((k) => k.toLowerCase() === listed.toLowerCase()) ?? "";
  return { listed, key, city };
}
export const CITY_COUNT = Object.keys(data.cities).length;

const resolved = {};
function layoutOf(key) {
  if (data.versions[key]) return data.versions[key];
  if (resolved[key]) return resolved[key];
  const p = data.providers[key];
  if (p === undefined) return null;
  if (typeof p === "string") return (resolved[key] = data.versions[p]);
  if (p.full) return (resolved[key] = p);
  const b = data.versions[p.base];
  const drop = new Set(p.drop);
  const keep = (o) => Object.fromEntries(Object.entries(o).filter(([n]) => !drop.has(n)));
  return (resolved[key] = { namespace: b.namespace, roots: p.roots, complex: { ...keep(b.complex), ...p.complex }, simple: { ...keep(b.simple), ...p.simple } });
}

const checkers = {};
const get = (v) => (checkers[v] ||= checker(layoutOf(v)));

/** A multi-file provider layout (Ginfes 1.00, WebISS 1.00): { files, namespace } or null. */
export const providerMulti = (key) => (data.providers[key]?.full ? { files: data.providers[key].files, namespace: data.providers[key].namespace } : null);
/** The namespace a layout puts root element `name` in. */
export const rootNamespace = (version, name) => layoutOf(version)?.rootNs?.[name] ?? layoutOf(version)?.namespace;
/** Multi-file provider keys whose layout declares `name` as a root in namespace `ns`. */
export const multiFor = (name, ns) => PROVIDER_LAYOUTS.filter((k) => data.providers[k]?.full && data.providers[k].roots[name] && rootNamespace(k, name) === ns);

/** Root element names a layout (or provider copy) declares (GerarNfseEnvio, CompNfse, ...). */
export const rootsOf = (version) => Object.keys(layoutOf(version)?.roots ?? {});

/** Check `node` (a declared root element) against layout `version` (or a provider copy). */
export function checkAgainstAbrasf(node, version, path = `/${node.name}`) {
  const out = [];
  const type = layoutOf(version)?.roots[node.name];
  if (!type) return out;
  get(version).checkNode(node, type, path, out);
  return out;
}

export const abrasfValueProblem = (version, type, raw) => get(version).valueProblem(type, raw);
