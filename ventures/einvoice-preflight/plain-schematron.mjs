// Runs the official EN 16931 / XRechnung / Peppol Schematron rules as plain
// JSON in plain JavaScript (fontoxpath, MIT), with no Saxon: so the check can
// ship in the page itself, on any static host, and the invoice never leaves
// the browser. The rules are compiled from the official .sch by
// build-plain-rules.mjs (plain-compile.mjs); the SEF route (schematron.mjs,
// official-browser.mjs) stays as the reference this is tested against.
//
// Dependencies are injected so Node (slimdom) and the page (DOMParser) share
// this file: createPlainRunner({ fontoxpath, parseXml }).
import { FILES, ADDONS, PROFILES, detectSyntax, matchingAddons, matchingProfile } from "./schematron-core.mjs";
import { plainFix } from "./schematron-fixes.mjs";

export const PLAIN_DIR = "plain/";
const RULE_FILES = { ubl: "en16931-ubl.json", cii: "en16931-cii.json" };
export const PLAIN_ADDON_FILES = { xrechnung: { ubl: "xrechnung-ubl.json", cii: "xrechnung-cii.json" }, peppol: { ubl: "peppol-ubl.json", cii: "peppol-cii.json" }, "cius-ro": { ubl: "cius-ro-ubl.json" }, "cius-pt": { ubl: "cius-pt-ubl.json" }, nlcius: { ubl: "nlcius-ubl.json", cii: "nlcius-cii.json" } };

// fontoxpath works on IEEE doubles, the rules are written for exact xs:decimal.
// A money equation like `BasisAmount = round(a*100) div 100 + round(b*100) div 100`
// can miss by 1e-11 on a clean invoice. A failed top-level equality is therefore
// re-asked as "equal within 1e-7": this can only clear a finding, never raise
// one, and no two-decimal amounts differ by so little.
function topLevelEquality(test) {
  let depth = 0;
  let quote = "";
  let index = -1;
  for (let i = 0; i < test.length; i++) {
    const c = test[i];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if ("([".includes(c)) depth++;
    else if (")]".includes(c)) depth--;
    else if (depth === 0) {
      if (c === "=" && !"!<>=".includes(test[i - 1] ?? "") && test[i + 1] !== ">") {
        if (index >= 0) return null; // two top-level equalities
        index = i;
      }
      if (/\s/.test(test[i - 1] ?? " ") && /^(and|or|then|else|return|satisfies)\s/.test(test.slice(i))) return null;
    }
  }
  return index < 0 ? null : [test.slice(0, index), test.slice(index + 1)];
}

const slackTest = (test) => {
  const sides = topLevelEquality(test);
  return sides && `abs((${sides[0]}) - (${sides[1]})) lt 0.0000001`;
};

const safely = (fn) => { try { return fn(); } catch { return false; } };

function locate(node) {
  const parts = [];
  for (let n = node; n && n.nodeType !== 9; n = n.parentNode || n.ownerElement) {
    if (n.nodeType === 2) { parts.unshift(`@${n.localName}`); continue; }
    let index = 1;
    for (let s = n.previousSibling; s; s = s.previousSibling) {
      if (s.nodeType === 1 && s.localName === n.localName && s.namespaceURI === n.namespaceURI) index++;
    }
    parts.unshift(`${n.localName}[${index}]`);
  }
  return `/${parts.join("/")}`;
}

export function createPlainRunner({ fontoxpath, parseXml }) {
  const { evaluateXPathToNodes, evaluateXPathToBoolean, evaluateXPath } = fontoxpath;

  // Findings of one compiled rule set: [{ id, flag, text, path }].
  function runRules(rules, doc) {
    const resolver = (prefix) => rules.ns[prefix] ?? null;
    const xpath = { namespaceResolver: resolver };
    const xquery = { namespaceResolver: resolver, language: evaluateXPath.XQUERY_3_1_LANGUAGE };
    const holds = (test, node, xq) =>
      xq ? evaluateXPathToBoolean(`${rules.prolog}${test}`, node, null, null, xquery) : evaluateXPathToBoolean(test, node, null, null, xpath);
    const out = [];
    out.skipped = [];
    for (const pattern of rules.patterns) {
      const seen = new Set(); // within a pattern, the first rule that matches a node owns it
      for (const rule of pattern.rules) {
        const select = rule.context.startsWith("/") ? rule.context : `//(${rule.context})`;
        let nodes;
        try {
          nodes = evaluateXPathToNodes(select, doc, null, null, xpath);
        } catch {
          for (const check of rule.checks) if (!out.skipped.includes(check.id)) out.skipped.push(check.id);
          continue;
        }
        for (const node of nodes) {
          if (seen.has(node)) continue;
          seen.add(node);
          for (const check of rule.checks) {
            if (check.kind !== "assert") continue;
            let ok;
            try {
              ok = holds(check.test, node, check.xq);
            } catch {
              // an engine limit (not a pass): name the rule so the caller can say it was not checked
              if (!out.skipped.includes(check.id)) out.skipped.push(check.id);
              continue;
            }
            if (ok) continue;
            const slack = slackTest(check.test);
            if (slack && safely(() => holds(slack, node, check.xq))) continue;
            out.push({ rule: check.id, flag: check.flag, text: check.text, path: locate(node) });
          }
        }
      }
    }
    return out;
  }

  const toFinding = (f, source) => {
    const withId = f.text.match(/^\[([^\]]+)\]-?\s*(.*)$/);
    // The Romanian rules carry "Romanian text #English text"; show the English.
    let message = withId ? withId[2] : f.text;
    if (source === "cius-ro-schematron" && message.includes("#")) message = message.slice(message.indexOf("#") + 1).trim();
    return { rule: f.rule || withId?.[1] || "SCH", message, fix: plainFix(f.rule || withId?.[1] || "SCH"), path: f.path, severity: f.flag, source };
  };

  // load(file) -> compiled rule set (parsed JSON) or null when that set is not shipped.
  async function run(xml, load) {
    const syntax = detectSyntax(xml);
    const profile = syntax && matchingProfile(xml, syntax);
    if (profile) {
      // PINT: its own sets stand in for the EN 16931 base and the BIS add-on. Any set
      // missing from this copy makes the whole check unavailable, never a partial pass.
      const sets = await Promise.all(profile[1].files[syntax].map(load));
      if (sets.some((s) => !s)) return { status: "unavailable", syntax, findings: [], sets: [] };
      const doc = parseXml(xml);
      const findings = [];
      const skipped = [];
      const seen = new Set();
      for (const rules of sets) {
        const raw = runRules(rules, doc);
        skipped.push(...raw.skipped);
        for (const f of raw.map((x) => toFinding(x, profile[1].source))) {
          if (!seen.has(`${f.rule}|${f.path}`)) { seen.add(`${f.rule}|${f.path}`); findings.push(f); }
        }
      }
      return { status: "ok", syntax, findings, sets: [profile[0]], skipped };
    }
    const base = syntax && (await load(RULE_FILES[syntax]));
    if (!base) return { status: "unavailable", syntax, findings: [], sets: [] };
    const doc = parseXml(xml);
    const baseRaw = runRules(base, doc);
    const findings = baseRaw.map((f) => toFinding(f, "en16931-schematron"));
    const skipped = [...baseRaw.skipped];
    const sets = ["en16931"];
    const seen = new Set(findings.map((f) => `${f.rule}|${f.path}`));
    for (const [name, addon] of matchingAddons(xml, syntax)) {
      const rules = await load(PLAIN_ADDON_FILES[name][syntax]);
      if (!rules) continue;
      sets.push(name);
      if (name === "cius-pt") for (const f of findings) if (f.rule === "BR-CL-17" || f.rule === "BR-CL-18") f.fix += PT_CODE_NOTE;
      const raw = runRules(rules, doc);
      skipped.push(...raw.skipped);
      for (const f of raw.map((x) => toFinding(x, addon.source))) {
        if (!seen.has(`${f.rule}|${f.path}`)) findings.push(f);
      }
    }
    return { status: "ok", syntax, findings, sets, skipped };
  }

  return { run, runRules };
}

// AMA's CIUS-PT 2.1.1 stylesheet carries no BR-CL-* rule, and its own format rules (DT-CIUS-PT-091, -105, -131) and BR-AA-* rules admit AA, RED, INT, NOR, ISE, OUT and NA. EN 16931's list does not, so the EU base rejects them: say so instead of leaving a Portuguese issuer to guess.
const PT_CODE_NOTE = " This invoice names CIUS-PT, whose own rules accept AA, RED, INT, NOR, ISE, OUT and NA; if the code is one of those, the EN 16931 base and the Portuguese profile disagree, and S with the actual rate is what the EU base accepts. Ask your software vendor or AT which one the receiver validates against.";

export { FILES, ADDONS, PROFILES };
