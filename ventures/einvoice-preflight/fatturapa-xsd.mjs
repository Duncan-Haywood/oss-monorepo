// Structure and value-format checks for a FatturaPA file, read from the Agenzia
// delle Entrate schema (XSD 1.2.1) by build-fatturapa-schema.mjs. The XSD is the
// first gate SdI applies; a file that fails it is refused before any business rule.
//   IT-018 elements out of sequence     IT-019 an element the schema does not allow here
//   IT-020 a required element missing   IT-021 a value outside its length / pattern / range
//   IT-022 the XML is not well formed (a cut-off file, a mismatched tag)
// Not enforced: the code lists. 1.2.1 predates TD16-TD28, RF17-RF19 and the N2.1,
// N3.x, N6.x codes in use today, so only the lists that have not grown are read
// from it (STABLE_ENUMS); the others stay with IT-006, IT-008 and IT-011.
// Messages never echo the value, only which element and why.
import schema from "./fatturapa-xsd-data.mjs";

const STABLE_ENUMS = new Set([
  "Art73Type", "BolloVirtualeType", "CondizioniPagamentoType", "EsigibilitaIVAType", "RitenutaType",
  "SocioUnicoType", "SoggettoEmittenteType", "StatoLiquidazioneType", "TipoCessionePrestazioneType", "TipoScontoMaggiorazioneType",
]);

const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

// XSD regular expressions are anchored; \p{IsBasicLatin} and \p{IsLatin-1Supplement} are blocks.
const regexCache = new Map();
function xsdRegex(source) {
  let re = regexCache.get(source);
  if (!re) {
    const js = source.replace(/\\p\{IsBasicLatin\}/g, "\\u0000-\\u007F").replace(/\\p\{IsLatin-1Supplement\}/g, "\\u0080-\\u00FF");
    // A bare \u0000-\u007F outside a class needs wrapping in one.
    const wrapped = js.replace(/(^|[^[\\])(\\u0000-\\u007F)/g, "$1[$2]");
    re = new RegExp(`^(?:${wrapped})$`, "u");
    regexCache.set(source, re);
  }
  return re;
}

const NAMES = new Map();
function namesOf(typeName) {
  let set = NAMES.get(typeName);
  if (!set) {
    set = new Set();
    const walk = (steps) => { for (const s of steps) { if (s.choice) s.choice.forEach(walk); else set.add(s.el); } };
    walk(schema.complex[typeName]);
    NAMES.set(typeName, set);
  }
  return set;
}

function valueProblem(typeName, raw) {
  const t = schema.simple[typeName] ?? (typeName.startsWith("xs:") ? { base: typeName.slice(3) } : null);
  if (!t) return "";
  const value = t.base === "string" || t.base === "normalizedString" ? raw.replace(/[\t\r\n]/g, " ") : raw.trim().replace(/\s+/g, " ");
  const chars = [...value].length;
  if (t.length !== undefined && chars !== t.length) return `must be exactly ${t.length} characters`;
  if (t.minLength !== undefined && chars < t.minLength) return chars ? `must be at least ${t.minLength} characters` : "is empty";
  if (t.maxLength !== undefined && chars > t.maxLength) return `is longer than ${t.maxLength} characters`;
  if (t.base === "integer" && !/^[+-]?\d+$/.test(value)) return "is not a whole number";
  if (t.base === "decimal" && !/^[+-]?(\d+\.?\d*|\.\d+)$/.test(value)) return "is not a number";
  if (t.base === "date" && !(/^\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10))))) return "is not a YYYY-MM-DD date";
  if (t.base === "dateTime" && !(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10))))) return "is not a YYYY-MM-DDThh:mm:ss date and time";
  if ((t.base === "integer" || t.base === "decimal") && /^[+-]?[\d.]+$/.test(value)) {
    const n = Number(value);
    if (t.minInclusive !== undefined && n < t.minInclusive) return `is below ${t.minInclusive}`;
    if (t.maxInclusive !== undefined && n > t.maxInclusive) return `is above ${t.maxInclusive}`;
  }
  if (t.pattern && !t.pattern.some((p) => xsdRegex(p).test(value))) {
    if (t.pattern.some((p) => p.includes("IsBasicLatin")) && [...value].some((c) => c.codePointAt(0) > 0xff)) {
      const bad = [...value].find((c) => c.codePointAt(0) > 0xff);
      return `contains a character outside the Latin set the schema allows (U+${bad.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")})`;
    }
    return "does not match the format the schema requires";
  }
  if (STABLE_ENUMS.has(typeName) && schema.enums[typeName] && !schema.enums[typeName].includes(value)) {
    return `is not one of ${schema.enums[typeName].join(", ")}`;
  }
  return "";
}

function checkNode(node, typeName, path, out, step) {
  const model = schema.complex[typeName];
  if (!model) {
    if (step && step.default !== undefined && !node.text.trim()) return; // an empty element takes its default
    const problem = valueProblem(typeName, node.text);
    if (problem) {
      out.push(finding("IT-021", `${node.name} ${problem}.`, `Correct ${node.name}; SdI refuses a file whose values break the schema.`, path));
    }
    return;
  }
  const allowed = namesOf(typeName);
  const kids = [];
  const seen = new Map();
  for (const c of node.children) {
    if (!allowed.has(c.name)) {
      out.push(finding("IT-019", `${c.name} is not allowed inside ${node.name}.`, `Remove ${c.name}, or move it to the block where the schema defines it.`, `${path}/${c.name}`));
      continue;
    }
    const count = (seen.get(c.name) ?? 0) + 1;
    seen.set(c.name, count);
    const max = firstStep(model, c.name).max;
    if (max >= 0 && count > max) {
      if (count === max + 1) out.push(finding("IT-019", `${c.name} appears more than ${max === 1 ? "once" : `${max} times`} in ${node.name}.`, `Keep at most ${max} ${c.name}.`, `${path}/${c.name}`));
      continue;
    }
    kids.push(c);
  }
  const present = new Set(kids.map((c) => c.name));
  const consumed = new Map();
  let i = 0;
  const run = (steps) => {
    for (const step of steps) {
      if (step.choice) {
        const branch = step.choice.find((b) => b[0] && kids[i] && kids[i].name === b[0].el)
          ?? step.choice.find((b) => b.some((s) => present.has(s.el)));
        if (branch) run(branch);
        else {
          out.push(finding("IT-020", `${node.name} needs one of: ${step.choice.map((b) => b.filter((s) => s.min).map((s) => s.el).join(" + ")).join(" or ")}.`,
            "Add the missing element; the schema requires one of those alternatives.", path));
        }
        continue;
      }
      let count = 0;
      while (i < kids.length && kids[i].name === step.el && (step.max < 0 || count < step.max)) {
        consumed.set(kids[i], step); i++; count++;
      }
      if (count < step.min && !present.has(step.el)) {
        out.push(finding("IT-020", `${step.el} is required in ${node.name} and is missing.`, `Add ${step.el} to ${node.name}.`, `${path}/${step.el}`));
      }
    }
  };
  run(model);
  let ordered = true;
  for (const c of kids) {
    if (consumed.has(c) || !ordered) continue;
    ordered = false;
    const after = kids.slice(0, kids.indexOf(c)).reverse().find((k) => consumed.has(k) && modelIndex(model, k.name) > modelIndex(model, c.name));
    out.push(finding("IT-018", `${c.name} comes after ${after ? after.name : "an element that follows it"} in ${node.name}, but the schema puts it before.`,
      `Move ${c.name} ahead of ${after ? after.name : "the later elements"}; SdI rejects elements out of sequence.`, `${path}/${c.name}`));
  }
  for (const c of kids) {
    const step = consumed.get(c) ?? firstStep(model, c.name);
    if (step && step.type !== "any") checkNode(c, step.type, `${path}/${c.name}`, out, step);
  }
}

function modelIndex(model, name) {
  let n = 0, found = -1;
  const walk = (steps) => { for (const s of steps) { if (s.choice) s.choice.forEach(walk); else { if (s.el === name && found < 0) found = n; n++; } } };
  walk(model);
  return found;
}
function firstStep(model, name) {
  let hit;
  const walk = (steps) => { for (const s of steps) { if (s.choice) s.choice.forEach(walk); else if (s.el === name && !hit) hit = s; } };
  walk(model);
  return hit;
}

/** True when every tag is closed in order; a cut-off file or a stray tag is not. */
export function wellFormed(text) {
  const stack = [];
  for (const token of text.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[^>]+>/g) || []) {
    if (token.startsWith("<!") || token.startsWith("<?")) continue;
    const name = token.replace(/^<\/?/, "").split(/[\s>/]/, 1)[0];
    if (token.startsWith("</")) { if (stack.pop() !== name) return false; }
    else if (!token.endsWith("/>")) stack.push(name);
  }
  return stack.length === 0;
}

/** @param root the FatturaElettronica node from parseXmlTree */
export function checkAgainstSchema(root, text) {
  const out = [];
  if (text && !wellFormed(text)) {
    out.push(finding("IT-022", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.",
      "Re-export the file; if it was edited by hand, close every tag in the order it was opened.", "/FatturaElettronica"));
    return out;
  }
  checkNode(root, schema.root, "/FatturaElettronica", out);
  return out;
}
