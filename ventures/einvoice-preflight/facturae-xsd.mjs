// Structure and value-format checks for a Spanish Facturae 3.2.1 or 3.2.2 file,
// read from the Ministerio de Hacienda's XSDs by build-facturae-schema.mjs.
// FACe and the regional hubs refuse a file that fails the schema before any other rule.
//   ES-018 elements out of sequence     ES-019 an element the schema does not allow here
//   ES-020 a required element missing   ES-021 a value outside its length / pattern / code list
//   ES-022 the XML is not well formed (a cut-off file, a mismatched tag)
// The same walk as fatturapa-xsd.mjs (sequences, choices, occurrence counts, facets),
// plus Facturae's xs:any in Extensions, which is accepted unread. Messages never echo
// the value, only which element and why.
import tables from "./facturae-xsd-data.mjs";
import { calendarDate, wellFormed } from "./fatturapa-xsd.mjs";

export const FACTURAE_VERSIONS = Object.keys(tables);
/** The schema table whose target namespace is `namespace`, or undefined. */
export function tableForNamespace(namespace) {
  return Object.values(tables).find((t) => t.namespace === namespace);
}
export function tableForVersion(version) {
  return tables[version];
}

const finding = (rule, message, fix, path) => ({ rule, message, fix, path });

const regexCache = new Map();
function xsdRegex(source) {
  let re = regexCache.get(source);
  if (!re) {
    re = new RegExp(`^(?:${source})$`, "u");
    regexCache.set(source, re);
  }
  return re;
}

function walkSteps(steps, visit) {
  for (const s of steps) {
    if (s.choice) s.choice.forEach((b) => walkSteps(b, visit));
    else visit(s);
  }
}
function hasAny(model) {
  let any = false;
  walkSteps(model, (s) => { if (s.any) any = true; });
  return any;
}
function firstStep(model, name) {
  let hit;
  walkSteps(model, (s) => { if (s.el === name && !hit) hit = s; });
  return hit;
}
function modelIndex(model, name) {
  let n = 0, found = -1;
  walkSteps(model, (s) => { if (s.el === name && found < 0) found = n; n++; });
  return found;
}

function valueProblem(schema, typeName, raw) {
  const t = schema.simple[typeName] ?? (typeName.startsWith("xs:") ? { base: typeName.slice(3) } : null);
  if (!t) return "";
  // xs:string keeps whitespace (tabs and line ends count as spaces); every other base collapses it.
  const value = t.base === "string" ? raw.replace(/[\t\r\n]/g, " ") : raw.trim().replace(/\s+/g, " ");
  const chars = [...value].length;
  if (t.length !== undefined && chars !== t.length) return `must be exactly ${t.length} characters`;
  if (t.minLength !== undefined && chars < t.minLength) return chars ? `must be at least ${t.minLength} characters` : "is empty";
  if (t.maxLength !== undefined && chars > t.maxLength) return `is longer than ${t.maxLength} characters`;
  if (t.base === "long" && !/^[+-]?\d+$/.test(value)) return "is not a whole number";
  if (t.base === "double" && /^-?\d+,\d+$/.test(value)) return "uses a decimal comma; write amounts with a point, as plain digits (for example 1050.00)";
  if (t.base === "double" && !/^([+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?|-?INF|NaN)$/.test(value)) return "is not a number";
  if (t.base === "date" && !(/^-?\d{4}-\d{2}-\d{2}(Z|[+-]\d{2}:\d{2})?$/.test(value) && calendarDate(value.slice(0, 10)))) return "is not a YYYY-MM-DD date";
  if (t.pattern && !t.pattern.some((p) => xsdRegex(p).test(value))) {
    if (t.base === "double") {
      if (t.pattern.some((p) => p.includes("{2}"))) return "must be written with exactly two decimals (for example 100.00)";
      return "must be written as plain digits with at most eight decimals (no exponent, no comma)";
    }
    return "does not match the format the schema requires";
  }
  if (schema.enums[typeName] && !schema.enums[typeName].includes(value)) {
    const codes = schema.enums[typeName];
    return codes.length <= 12 ? `is not one of ${codes.join(", ")}` : `is not a code in the schema's ${typeName.replace(/Type$/, "")} list`;
  }
  return "";
}

function checkNode(schema, node, typeName, path, out, step) {
  const model = schema.complex[typeName];
  if (!model) {
    if (step && step.default !== undefined && !node.text.trim()) return; // an empty element takes its default
    if (node.children.length) {
      out.push(finding("ES-019", `${node.name} holds elements, but the schema allows only a value here.`, `Remove the elements inside ${node.name}.`, path));
      return;
    }
    const problem = valueProblem(schema, typeName, node.text);
    if (problem) out.push(finding("ES-021", `${node.name} ${problem}.`, `Correct ${node.name}; a Facturae file whose values break the schema is refused before it is read.`, path));
    return;
  }
  const any = hasAny(model);
  const kids = [];
  const seen = new Map();
  for (const c of node.children) {
    const s = firstStep(model, c.name);
    if (!s) {
      if (!any) out.push(finding("ES-019", `${c.name} is not allowed inside ${node.name}.`, `Remove ${c.name}, or move it to the block where the schema defines it.`, `${path}/${c.name}`));
      continue;
    }
    const count = (seen.get(c.name) ?? 0) + 1;
    seen.set(c.name, count);
    if (s.max >= 0 && count > s.max) {
      if (count === s.max + 1) out.push(finding("ES-019", `${c.name} appears more than ${s.max === 1 ? "once" : `${s.max} times`} in ${node.name}.`, `Keep at most ${s.max} ${c.name}.`, `${path}/${c.name}`));
      continue;
    }
    kids.push(c);
  }
  const present = new Set(kids.map((c) => c.name));
  const consumed = new Map();
  let i = 0;
  const run = (steps) => {
    for (const st of steps) {
      if (st.any) continue;
      if (st.choice) {
        const branch = st.choice.find((b) => b[0] && kids[i] && kids[i].name === b[0].el)
          ?? st.choice.find((b) => b.some((s) => present.has(s.el)));
        if (branch) run(branch);
        else if (st.min !== 0) {
          out.push(finding("ES-020", `${node.name} needs one of: ${st.choice.map((b) => b.filter((s) => s.min).map((s) => s.el).join(" + ")).join(" or ")}.`,
            "Add the missing element; the schema requires one of those alternatives.", path));
        }
        continue;
      }
      let count = 0;
      while (i < kids.length && kids[i].name === st.el && (st.max < 0 || count < st.max)) {
        consumed.set(kids[i], st); i++; count++;
      }
      if (count < st.min && !present.has(st.el)) {
        out.push(finding("ES-020", `${st.el} is required in ${node.name} and is missing.`, `Add ${st.el} to ${node.name}.`, `${path}/${st.el}`));
      }
    }
  };
  run(model);
  let ordered = true;
  for (const c of kids) {
    if (consumed.has(c) || !ordered) continue;
    ordered = false;
    const after = kids.slice(0, kids.indexOf(c)).reverse().find((k) => consumed.has(k) && modelIndex(model, k.name) > modelIndex(model, c.name));
    out.push(finding("ES-018", `${c.name} comes after ${after ? after.name : "an element that follows it"} in ${node.name}, but the schema puts it before.`,
      `Move ${c.name} ahead of ${after ? after.name : "the later elements"}; the schema fixes the order of elements.`, `${path}/${c.name}`));
  }
  for (const c of kids) {
    const st = consumed.get(c) ?? firstStep(model, c.name);
    if (st && st.type !== "any") checkNode(schema, c, st.type, `${path}/${c.name}`, out, st);
  }
}

/** @param schema a table from tableForNamespace; @param root the Facturae node from parseXmlTree */
export function checkFacturaeSchema(schema, root, text) {
  const out = [];
  if (text && !wellFormed(text)) {
    out.push(finding("ES-022", "The XML is not well formed: a tag is never closed or closes out of order, which is what a cut-off file looks like.",
      "Re-export the file; if it was edited by hand, close every tag in the order it was opened.", "/Facturae"));
    return out;
  }
  checkNode(schema, root, schema.root, "/Facturae", out);
  return out;
}
