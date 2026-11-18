// Runs the official EN 16931 / XRechnung / Peppol Schematron rules as plain
// JSON in plain JavaScript (fontoxpath, MIT), with no Saxon: so the check can
// ship in the page itself, on any static host, and the invoice never leaves
// the browser. The rules are compiled from the official .sch by
// build-plain-rules.mjs (plain-compile.mjs); the SEF route (schematron.mjs,
// official-browser.mjs) stays as the reference this is tested against.
//
// Dependencies are injected so Node (slimdom) and the page (DOMParser) share
// this file: createPlainRunner({ fontoxpath, parseXml }).
import { FILES, ADDONS, PEPPOL_NEXT, PROFILES, detectSyntax, matchingAddons, matchingExtendedBase, matchingProfile } from "./schematron-core.mjs";
import { plainFix, selfBillingFix } from "./schematron-fixes.mjs";
import { CASTABLE, NON_XML_SPACE, spaceName, visibleSpaces } from "./xmlvalues.mjs";

export const PLAIN_DIR = "plain/";
const RULE_FILES = { ubl: "en16931-ubl.json", cii: "en16931-cii.json" };
export const CDAR_FILE = "cdar-fr.json";
export const FLUX10_FILE = "flux10-fr.json";
export const PLAIN_ADDON_FILES = { "peppol-next": PEPPOL_NEXT.files, xrechnung: { ubl: "xrechnung-ubl.json", cii: "xrechnung-cii.json" }, peppol: { ubl: "peppol-ubl.json", cii: "peppol-cii.json" }, "peppol-sb": { ubl: "peppol-sb-ubl.json" }, "peppol-sb-next": PEPPOL_NEXT.selfBilling.files, "cius-ro": { ubl: "cius-ro-ubl.json" }, "cius-pt": { ubl: "cius-pt-ubl.json" }, "cius-hr": { ubl: "cius-hr-ubl.json" }, nlcius: { ubl: "nlcius-ubl.json", cii: "nlcius-cii.json" }, "cius-fr": { ubl: "cius-fr-ubl.json", cii: "cius-fr-cii.json" } };

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

// Split a test on a top-level boolean operator (`or`, `and`), outside brackets and
// strings. Null when the operator is absent or the test has a top-level if/then,
// quantifier or FLWOR, whose parts are not independent.
export function splitTop(test, word) {
  let depth = 0;
  let quote = "";
  const parts = [];
  let start = 0;
  for (let i = 0; i < test.length; i++) {
    const c = test[i];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if ("([".includes(c)) depth++;
    else if (")]".includes(c)) depth--;
    else if (depth === 0 && /\s/.test(test[i - 1] ?? " ")) {
      const rest = test.slice(i);
      if (/^(then|else|return|satisfies)\s/.test(rest) || /^(if|some|every|for|let)[\s(]/.test(rest)) return null;
      if (rest.startsWith(`${word} `) || rest.startsWith(`${word}(`)) { parts.push(test.slice(start, i)); start = i + word.length; }
    }
  }
  if (!parts.length) return null;
  parts.push(test.slice(start));
  return parts.map((p) => p.trim());
}

// The same "within 1e-7" for an equality that is one disjunct or conjunct of the
// test (`not(cbc:BaseAmount) or PriceAmount = BaseAmount - Amount`, PINT
// aligned-ibrp-004). Loosening one part of an `or` or an `and` can only make the
// whole test truer, so this too can only clear a finding.
export const slackTest = (test) => {
  const sides = topLevelEquality(test);
  if (sides) return `abs((${sides[0]}) - (${sides[1]})) lt 0.0000001`;
  for (const word of ["or", "and"]) {
    const parts = splitTop(test, word);
    if (!parts) continue;
    const loose = parts.map((p) => slackTest(p));
    if (loose.every((l) => !l)) return null;
    return loose.map((l, i) => `(${l || parts[i]})`).join(` ${word} `);
  }
  return null;
};

const safely = (fn) => { try { return fn(); } catch { return false; } };

// XPath's whitespace is #x20, #x9, #xD and #xA only (XML 1.0 S; F&O 3.1 normalize-space,
// and XSD regex \s). fontoxpath 3.34 implements normalize-space, and \s in replace() and
// tokenize() patterns, with JavaScript's \s, which also takes U+00A0, U+2003, U+FEFF and
// the other Unicode spaces. So `normalize-space(cbc:CompanyID)` read NL123456782B01 plus a
// no-break space as passing ^NL[0-9]{9}B[0-9]{2}$ where Saxon, and the receiver's own
// validator, warns (eval/xml-whitespace-crosscheck-2026-11-17.md). Every rule, context and
// prolog is rewritten before fontoxpath sees it: normalize-space(x) calls a spec copy
// registered under XML_WS_NS, and \s / \S in the pattern argument of replace() and
// tokenize() become the explicit class. matches() already compiles \s to XML whitespace.
export const XML_WS_NS = "urn:einvoice-preflight:xml-whitespace";
const XML_WS = /[ \t\n\r]+/g;
export const specNormalizeSpace = (s) => (s ?? "").replace(XML_WS, " ").replace(/^ | $/g, "");

// \s and \S in one XSD regex, outside and inside a character class.
export function xmlWhitespaceRegex(re) {
  let out = "";
  let inClass = 0;
  for (let i = 0; i < re.length; i++) {
    const c = re[i];
    if (c === "\\" && i + 1 < re.length) {
      const n = re[i + 1];
      i++;
      if (n === "s") out += inClass ? " \\t\\n\\r" : "[ \\t\\n\\r]";
      else if (n === "S" && !inClass) out += "[^ \\t\\n\\r]";
      else out += c + n; // \S inside a class has no plain-class spelling: left as is
      continue;
    }
    if (c === "[") inClass++;
    else if (c === "]" && inClass) inClass--;
    out += c;
  }
  return out;
}

const REGEX_ARG = { replace: 1, tokenize: 1 }; // 0-based index of the pattern argument
const NAME_CHAR = /[\w.\-:]/;

// Rewrite one XPath/XQuery expression (a test, a context or a prolog). String literals are
// copied as written, except a pattern argument of replace() or tokenize().
export function xmlWhitespaceRewrite(expr) {
  let out = "";
  const frames = []; // per open bracket: { fn, arg }
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (; j < expr.length; j++) {
        if (expr[j] === c) { if (expr[j + 1] === c) { j++; continue; } break; }
      }
      const body = expr.slice(i + 1, j);
      const top = frames[frames.length - 1];
      const isPattern = top && Object.hasOwn(REGEX_ARG, top.fn ?? "") && REGEX_ARG[top.fn] === top.arg && !out.slice(top.start).trim();
      out += c + (isPattern ? xmlWhitespaceRegex(body) : body) + (j < expr.length ? c : "");
      i = j;
      continue;
    }
    if (c === "(" && expr[i + 1] === ":") { // XQuery comment
      const end = expr.indexOf(":)", i + 2);
      const stop = end < 0 ? expr.length : end + 2;
      out += expr.slice(i, stop);
      i = stop - 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      const name = c === "(" ? (out.match(/(?:^|[^\w.\-:])(?:fn:)?([\w.\-]+)\s*$/) || [])[1] : null;
      out += c;
      frames.push({ fn: name, arg: 0, start: out.length });
      continue;
    }
    if (c === ")" || c === "]" || c === "}") { frames.pop(); out += c; continue; }
    if (c === "," && frames.length) { out += c; Object.assign(frames[frames.length - 1], { arg: frames[frames.length - 1].arg + 1, start: out.length }); continue; }
    if (c === "n" && expr.startsWith("normalize-space", i) && !NAME_CHAR.test(expr[i + 15] ?? "") ) {
      const before = out.match(/(?:^|[^\w.\-:])(fn:)?$/);
      const after = expr.slice(i + 15).match(/^\s*\(/);
      if (before && after) {
        if (before[1]) out = out.slice(0, -3);
        out += `Q{${XML_WS_NS}}normalize-space`;
        i += 14;
        const empty = expr.slice(i + 1).match(/^\s*\(\s*\)/);
        if (empty) { out += "(.)"; i += empty[0].length; }
        continue;
      }
    }
    out += c;
  }
  return out;
}

// fontoxpath compiles an XSD regex to an automaton and expands a bounded repeat into
// one state per count, so CIUS-PT's attachment rule DT-CIUS-PT-111.1,
// matches(.,'^(.{1,6826666})$'), never finishes on a file with an attachment (4.4 GB
// after 15 minutes on AMA's own examples, 2026-11-11). A whole-string length test with
// a large bound is rewritten to the same test without the regex: "." matches any
// character but a newline or carriage return, and ^...$ anchor the whole string.
const LONG_REPEAT = /matches\(\s*\.\s*,\s*'\^\(?\.\{(\d+),(\d+)\}\)?\$'\s*\)/g;
export const rewriteLongRepeat = (test) => test.replace(LONG_REPEAT, (whole, min, max) => (
  Number(max) < 1000 ? whole : `(string-length(.) ge ${Number(min)} and string-length(.) le ${Number(max)} and not(matches(., '[\\n\\r]')))`
));

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

const CAST_ERROR = /FORG0001|FOCA0002/;
// NON_XML_SPACE, CASTABLE, spaceName and visibleSpaces live in xmlvalues.mjs, shared
// with the built-in readers' INV-065 since 2026-11-17.
// Leaf values that are a number, date or boolean once JavaScript trims them but not once
// XML does: the values a rule's cast fails on.
export function unreadableValues(nodes) {
  const out = [];
  for (const n of nodes) {
    const value = n.nodeType === 2 ? n.value : n.textContent;
    if (!value || !NON_XML_SPACE.test(value)) continue;
    const js = value.trim();
    const xml = value.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, "");
    if (CASTABLE.test(js) && !CASTABLE.test(xml)) out.push({ path: locate(n), value });
  }
  return out;
}

// One registration per fontoxpath module (Node's and the page's bundle are separate copies).
const registered = new WeakSet();
function registerXmlWhitespace(fontoxpath) {
  if (registered.has(fontoxpath)) return;
  registered.add(fontoxpath);
  try {
    fontoxpath.registerCustomXPathFunction({ namespaceURI: XML_WS_NS, localName: "normalize-space" }, ["xs:string?"], "xs:string", (_, s) => specNormalizeSpace(s));
  } catch (e) {
    if (!/already|registered/i.test(String(e?.message))) throw e;
  }
}

// xmlWhitespace: false runs fontoxpath's own whitespace, only for the before/after measurement.
export function createPlainRunner({ fontoxpath, parseXml, xmlWhitespace = true }) {
  const { evaluateXPathToNodes, evaluateXPathToBoolean, evaluateXPath } = fontoxpath;
  registerXmlWhitespace(fontoxpath);
  const rewritten = new Map();
  const ws = (expr) => {
    if (!expr || !xmlWhitespace) return expr;
    let r = rewritten.get(expr);
    if (r === undefined) { r = xmlWhitespaceRewrite(expr); rewritten.set(expr, r); }
    return r;
  };

  // Findings of one compiled rule set: [{ id, flag, text, path }].
  function runRules(rules, doc) {
    const resolver = (prefix) => rules.ns[prefix] ?? null;
    const xpath = { namespaceResolver: resolver };
    const xquery = { namespaceResolver: resolver, language: evaluateXPath.XQUERY_3_1_LANGUAGE };
    const holds = (raw, node, xq) => {
      const test = ws(rewriteLongRepeat(raw));
      return xq ? evaluateXPathToBoolean(`${ws(rules.prolog)}${test}`, node, null, null, xquery) : evaluateXPathToBoolean(test, node, null, null, xpath);
    };
    const out = [];
    out.skipped = [];
    for (const pattern of rules.patterns) {
      const seen = new Set(); // within a pattern, the first rule that matches a node owns it
      for (const rule of pattern.rules) {
        const context = ws(rule.context);
        const select = context.startsWith("/") ? context : `//(${context})`;
        let nodes;
        try {
          nodes = evaluateXPathToNodes(select, doc, null, null, xpath);
        } catch (e) {
          if (CAST_ERROR.test(String(e?.message))) out.castFailed = true;
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
            } catch (e) {
              // an engine limit (not a pass): name the rule so the caller can say it was not checked.
              // A value no rule can cast is not an engine limit: Saxon stops on it too (see below).
              if (CAST_ERROR.test(String(e?.message))) out.castFailed = true;
              if (!out.skipped.includes(check.id)) out.skipped.push(check.id);
              continue;
            }
            if (ok) continue;
            const slack = slackTest(check.test);
            if (slack && safely(() => holds(slack, node, check.xq))) continue;
            out.push({ rule: check.id, flag: check.flag, text: check.text, ...(check.en ? { en: check.en } : {}), path: locate(node) });
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
    // FNFE's Flux 10 messages open "[G1.14] : doit ..." and end "| Source : Annexe 7 v1.8 G1.14".
    if (source === "flux10-fr-schematron") message = message.replace(/^:\s*/, "").replace(/\s*\|\s*Source\s*:[^|]*$/, "");
    if (source === "cius-ro-schematron" && message.includes("#")) message = message.slice(message.indexOf("#") + 1).trim();
    // The French BR-FR rules carry an English translation (br-fr-en.mjs): show it, keep FNFE's text.
    // Both lose their rule-code prefix ("[BR-FR-01/BT-1] :", "BR-FR-02/BT-1 :") and the
    // "current value" clause, which the compiled set always leaves empty (no value-of).
    let french;
    if (f.en || /^(cius-fr|cdar-fr)-schematron$/.test(source)) {
      const tidy = (t) => t.replace(/^\[[^\]]+\]\s*[-:,]*\s*/, "").replace(/^(?:\w{1,20} : )?\[?BR-FR[^:]{0,40}:\s*/, "").replace(/\s*(?:Current value|Valeur actuelle)\s*:\s*""\.?/g, "").trim();
      french = tidy(f.text);
      message = f.en ? tidy(f.en) : french;
      if (!f.en) french = undefined;
    }
    return { rule: f.rule || withId?.[1] || "SCH", message, ...(french ? { message_fr: french } : {}), fix: (/^peppol-sb/.test(source) && selfBillingFix(f.rule || withId?.[1])) || plainFix(f.rule || withId?.[1] || "SCH"), path: f.path, severity: f.flag, source };
  };

  // load(file) -> compiled rule set (parsed JSON) or null when that set is not shipped.
  // opts.profile ("france") adds the add-on that profile names (schematron-core.mjs).
  // A value with a no-break space (or another non-XML space) around a number or date cannot
  // be cast: Saxon, and so every Java validator (Peppol access points, KoSIT), stops on the
  // whole file with FORG0001, and fontoxpath throws on each rule that casts it. Rules that
  // throw are listed as skipped, which read as "not checked here" while the receiver
  // rejects the file. When a cast failed, name the field(s) as one fatal finding.
  async function run(xml, load, opts = {}) {
    const result = await runSets(xml, load, opts);
    if (!result.castFailed) return result;
    const { castFailed, ...rest } = result;
    let doc;
    try { doc = parseXml(xml.replace(/^\uFEFF/, "")); } catch { return rest; }
    const fields = unreadableValues(evaluateXPathToNodes("//*[not(*)] | //@*", doc, null, null, {}));
    const where = fields.length ? fields : [{ path: "/", value: "" }];
    const extra = where.map(({ path, value }) => ({
      rule: "XML-VALUE-01",
      message: value
        ? `"${visibleSpaces(value)}" holds a ${spaceName(value)}, so it is not a valid number or date in XML. The official validators (Saxon) stop on the whole file here (FORG0001) and report no rule.`
        : "A value in this file cannot be read as the number or date a rule expects, so the official validators (Saxon) stop on the whole file (FORG0001) and report no rule.",
      fix: "Write the value with no space characters other than an ordinary space, tab or line break at its ends (no no-break space, U+00A0, or similar). Spreadsheets and copied text often add one.",
      path,
      severity: "fatal",
      source: castFailed,
    }));
    return { ...rest, findings: [...extra, ...rest.findings] };
  }

  async function runSets(xml, load, opts = {}) {
    const syntax = detectSyntax(xml);
    if (syntax === "cdar") {
      // A French life-cycle message (CDAR) is not an invoice: FNFE-MPE's BR-FR-CDV set alone.
      const rules = await load(CDAR_FILE);
      if (!rules) return { status: "unavailable", syntax, findings: [], sets: [] };
      const raw = runRules(rules, parseXml(xml.replace(/^\uFEFF/, "")));
      return { status: "ok", syntax, findings: raw.map((x) => toFinding(x, "cdar-fr-schematron")), sets: ["cdar-fr"], skipped: raw.skipped, ...(raw.castFailed ? { castFailed: "cdar-fr-schematron" } : {}) };
    }
    if (syntax === "flux10") {
      // A French e-reporting file (Flux 10) is not an invoice: FNFE-MPE's Flux 10 set alone.
      const rules = await load(FLUX10_FILE);
      if (!rules) return { status: "unavailable", syntax, findings: [], sets: [] };
      const raw = runRules(rules, parseXml(xml.replace(/^\uFEFF/, "")));
      return { status: "ok", syntax, findings: raw.map((x) => toFinding(x, "flux10-fr-schematron")), sets: ["flux10-fr"], skipped: raw.skipped, ...(raw.castFailed ? { castFailed: "flux10-fr-schematron" } : {}) };
    }
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
      let castFailed = false;
      for (const rules of sets) {
        const raw = runRules(rules, doc);
        skipped.push(...raw.skipped);
        castFailed ||= raw.castFailed;
        for (const f of raw.map((x) => toFinding(x, profile[1].source))) {
          if (!seen.has(`${f.rule}|${f.path}`)) { seen.add(`${f.rule}|${f.path}`); findings.push(f); }
        }
      }
      return { status: "ok", syntax, findings, sets: [profile[0]], skipped, ...(castFailed ? { castFailed: profile[1].source } : {}) };
    }
    // A national add-on built on an older EN 16931 release (CIUS-RO on 1.3.8) gets that
    // release as its base, as its own validator runs it; a copy without that file falls
    // back to the current base.
    // An extended profile (Extended-CTC-FR, Factur-X EXTENDED) gets its own base; a copy
    // without that file is unavailable rather than judged by the EN 16931 base, which
    // rejects what the extension allows.
    const extended = syntax ? matchingExtendedBase(xml, syntax) : null;
    const pinned = extended ? [extended[1].files[syntax], extended[0]]
      : syntax ? matchingAddons(xml, syntax).map(([, a]) => a.base?.[syntax]).find(Boolean) : null;
    let base = pinned ? await load(pinned[0]) : null;
    if (extended && !base) return { status: "unavailable", syntax, findings: [], sets: [] };
    const baseName = base ? pinned[1] : "en16931";
    if (!base) base = syntax && (await load(RULE_FILES[syntax]));
    if (!base) return { status: "unavailable", syntax, findings: [], sets: [] };
    const doc = parseXml(xml);
    const baseRaw = runRules(base, doc);
    const findings = baseRaw.map((f) => toFinding(f, extended ? extended[1].source : "en16931-schematron"));
    const skipped = [...baseRaw.skipped];
    const baseSource = extended ? extended[1].source : "en16931-schematron";
    let castFailed = baseRaw.castFailed ? baseSource : null;
    const sets = [baseName];
    const seen = new Set(findings.map((f) => `${f.rule}|${f.path}`));
    for (const [name, addon] of matchingAddons(xml, syntax, opts)) {
      const rules = await load(PLAIN_ADDON_FILES[name][syntax]);
      if (!rules) continue;
      const nextOf = name === "peppol" ? PEPPOL_NEXT : name === "peppol-sb" ? { ...PEPPOL_NEXT, ...PEPPOL_NEXT.selfBilling, label: "Peppol BIS Self-Billing" } : null;
      if (nextOf && opts.peppolNext) {
        const next = await load(nextOf.files[syntax]);
        if (next) {
          // The coming release replaces the current one; each finding the current release does
          // not raise (a new rule, or a warning that becomes fatal) says so and from when.
          const now = new Set(runRules(rules, doc).map((f) => `${f.rule || f.id}|${f.path}|${f.flag}`));
          const raw = runRules(next, doc);
          sets.push(`${name}-next`);
          skipped.push(...raw.skipped);
          if (raw.castFailed) castFailed ||= nextOf.source;
          for (const x of raw) {
            const f = toFinding(x, nextOf.source);
            if (seen.has(`${f.rule}|${f.path}`)) continue;
            if (!now.has(`${x.rule || x.id}|${x.path}|${x.flag}`)) {
              f.peppolNext = "new";
              f.message += ` [New in ${nextOf.label || "Peppol BIS"} ${nextOf.release}${f.severity === "fatal" ? `, rejected from ${nextOf.mandatory}` : ""}; ${nextOf.current}, in force today, does not raise this.]`;
            }
            findings.push(f);
          }
          continue;
        }
      }
      sets.push(name);
      if (name === "cius-pt") for (const f of findings) if (f.rule === "BR-CL-17" || f.rule === "BR-CL-18") f.fix += PT_CODE_NOTE;
      if (name === "cius-hr") for (const f of findings) if (Object.hasOwn(HR_REQUIRED, f.rule)) f.fix = HR_REQUIRED[f.rule];
      const raw = runRules(rules, doc);
      skipped.push(...raw.skipped);
      if (raw.castFailed) castFailed ||= addon.source;
      for (const f of raw.map((x) => toFinding(x, addon.source))) {
        if (!seen.has(`${f.rule}|${f.path}`)) findings.push(f);
      }
    }
    return { status: "ok", syntax, findings, sets, skipped, ...(castFailed ? { castFailed } : {}) };
  }

  return { run, runRules };
}

// AMA's CIUS-PT 2.1.1 stylesheet carries no BR-CL-* rule, and its own format rules (DT-CIUS-PT-091, -105, -131) and BR-AA-* rules admit AA, RED, INT, NOR, ISE, OUT and NA. EN 16931's list does not, so the EU base rejects them: say so instead of leaving a Portuguese issuer to guess.
const PT_CODE_NOTE = " This invoice names CIUS-PT, whose own rules accept AA, RED, INT, NOR, ISE, OUT and NA; if the code is one of those, the EN 16931 base and the Portuguese profile disagree, and S with the actual rate is what the EU base accepts. Ask your software vendor or AT which one the receiver validates against.";

// The EN 16931 base warns (UBL-CR-*) on UBL elements outside the core model, and Croatia's
// HR-CIUS requires some of them: the issue time (HR-BR-2), the operator in SellerContact
// (HR-BR-37, HR-BR-9), the HR category label in a tax category's Name (HR-BR-11, -16, CL-1),
// a line's exemption reason (HR-BR-36) and the HRFISK20Data extension (HR-BR-26, -30). Deleting them to quiet the warning would
// make the Porezna uprava reject the file, so the fix says to keep them.
const HR_KEEP = (what, rule) => `Keep it: this invoice names HR-CIUS 2025, and Croatia's rules require ${what} (${rule}). The EN 16931 base only warns about elements outside its core model; a Croatian receiver accepts it.`;
const HR_REQUIRED = {
  "UBL-CR-001": HR_KEEP("the HR extension (HRFISK20Data) when an invoice has exempt or out-of-scope amounts", "HR-BR-26, HR-BR-30"),
  "UBL-CR-006": HR_KEEP("the issue time in hh:mm:ss", "HR-BR-2"),
  "UBL-CR-200": HR_KEEP("the operator's name and OIB in SellerContact", "HR-BR-37, HR-BR-9"),
  "UBL-CR-477": HR_KEEP("an HR VAT category label in the Name of an exempt or out-of-scope charge's tax category", "HR-BR-11, HR-BR-CL-1"),
  "UBL-CR-504": HR_KEEP("the HR VAT category label to come from HR-TB-2 wherever a tax category has a Name", "HR-BR-CL-1"),
  "UBL-CR-480": HR_KEEP("an exemption reason or reason code on an exempt or out-of-scope document charge", "HR-BR-13"),
  "UBL-CR-481": HR_KEEP("an exemption reason or reason code on an exempt or out-of-scope document charge", "HR-BR-13"),
  "UBL-CR-600": HR_KEEP("an exemption reason or reason code on every exempt or out-of-scope line", "HR-BR-36"),
  "UBL-CR-601": HR_KEEP("an exemption reason (or reason code) on every exempt or out-of-scope line", "HR-BR-36"),
  "UBL-CR-597": HR_KEEP("an HR VAT category label (HR:PDV25, HR:E, HR:O...) in the Name of an exempt or out-of-scope line's tax category", "HR-BR-16, HR-BR-CL-1"),
};

export { FILES, ADDONS, PROFILES };
