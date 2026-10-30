// Turns an ISO-Schematron-compiled XSLT (the shape ph-schematron writes, which
// is how Peppol PINT, the Romanian CIUS and other national rule sets are
// published in the phive-rules Maven artefacts) back into the plain JSON that
// plain-schematron.mjs runs. Build-time only (Node, slimdom).
//
// It does not interpret XSLT. It reads the fixed shape the generator emits and
// rebuilds a small Schematron file from it, then hands that to compileSchematron
// so the let-substitution, xsl:function and big-integer handling are shared:
//   <xsl:template match=CTX mode="Mn" priority=P>  one rule; Mn is its pattern,
//       templates of a pattern run highest priority first and the first to match
//       a node owns it (the same rule the .sch route applies);
//     <xsl:variable name select>                   a rule-level <let>
//     <xsl:when test=T/><xsl:otherwise><svrl:failed-assert id flag>  an <assert>
//   top-level <xsl:variable name select>           a global <let>
//   top-level <xsl:function>                       copied through
// Anything else it finds inside a rule's template throws rather than being
// dropped, because a dropped rule would read as a pass.
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseXmlDocument, serializeToWellFormedString } from "slimdom";
import { compileSchematron } from "./plain-compile.mjs";

const SCH = "http://purl.oclc.org/dsdl/schematron";
const XSL = "http://www.w3.org/1999/XSL/Transform";
const SVRL = "http://purl.oclc.org/dsdl/svrl";

const elements = (node) => [...node.childNodes].filter((c) => c.nodeType === 1);
const is = (node, uri, name) => node.namespaceURI === uri && node.localName === name;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clean = (text) => text.replace(/\s+/g, " ").trim();

// The text of a variable whose value is written as content, not as select.
const variableValue = (v) => (v.hasAttribute("select") ? v.getAttribute("select") : JSON.stringify(v.textContent.trim()));

function assertsOf(template, file) {
  const out = [];
  for (const child of elements(template)) {
    if (is(child, XSL, "variable") || is(child, SVRL, "fired-rule")) continue;
    if (is(child, XSL, "apply-templates")) continue; // descends to the children, as the next rule does
    if (is(child, XSL, "if")) { // a Schematron <report>: fires when the test holds, so the assert is its negation
      const report = elements(child).find((e) => is(e, SVRL, "successful-report"));
      if (!report || elements(child).length !== 1) throw new Error(`${file}: an xsl:if that is not a plain report`);
      const attr = (name) => elements(report).find((e) => e.localName === "attribute" && e.getAttribute("name") === name)?.textContent.trim();
      out.push({ test: `not(${child.getAttribute("test")})`, id: attr("id") ?? "", flag: attr("flag") ?? "fatal", text: clean(elements(report).find((e) => is(e, SVRL, "text"))?.textContent ?? "") });
      continue;
    }
    if (!is(child, XSL, "choose")) throw new Error(`${file}: unsupported <${child.localName}> in a rule`);
    const [when, otherwise, ...extra] = elements(child);
    const failed = otherwise && is(otherwise, XSL, "otherwise") ? elements(otherwise).find((e) => is(e, SVRL, "failed-assert")) : null;
    if (!when || !is(when, XSL, "when") || !failed || extra.length) {
      // `successful-report` shapes (when body fires the report): not emitted by the sets in use
      throw new Error(`${file}: an xsl:choose that is not a plain assert`);
    }
    const text = elements(failed).find((e) => is(e, SVRL, "text"));
    out.push({ test: when.getAttribute("test"), id: elements(failed).find((e) => e.localName === "attribute" && e.getAttribute("name") === "id")?.textContent.trim() ?? "", flag: elements(failed).find((e) => e.localName === "attribute" && e.getAttribute("name") === "flag")?.textContent.trim() ?? "fatal", text: clean(text?.textContent ?? "") });
  }
  return out;
}

const SCHXSLT = "https://doi.org/10.5281/zenodo.1495494";

// SchXslt output (ZATCA's Saudi rules): one mode for every rule, the pattern named on
// <schxslt:rule pattern>, and each rule body hand-extended with xsl:if, xsl:for-each and
// xsl:choose around the failed-assert. The xsl:if test is the failure condition itself. A
// violation is rebuilt as one XPath that is true when the check fails, relative to the rule's
// context: a for-each becomes exists((select)[violation]), a when branch carries the negation
// of the branches before it. Anything else (a variable inside a loop, say) throws.
function violations(node, file) {
  const out = [];
  for (const child of elements(node)) {
    if (is(child, XSL, "comment") || is(child, SVRL, "fired-rule")) continue;
    if (is(child, SVRL, "failed-assert")) { // reached unconditionally: the branch it sits in is the whole condition
      out.push({ viol: "true()", id: child.getAttribute("id"), flag: child.getAttribute("flag"), text: clean(elements(child).find((e) => is(e, SVRL, "text")).textContent) });
      continue;
    }
    if (is(child, XSL, "if")) {
      const test = child.getAttribute("test").trim();
      for (const f of elements(child)) {
        if (is(f, SVRL, "failed-assert")) {
          out.push({ viol: test, id: f.getAttribute("id"), flag: f.getAttribute("flag"), text: clean(elements(f).find((e) => is(e, SVRL, "text")).textContent) });
        }
      }
      for (const v of violations({ childNodes: [...child.childNodes].filter((c) => c.nodeType === 1 && !is(c, SVRL, "failed-assert")) }, file)) out.push({ ...v, viol: `(${test}) and (${v.viol})` });
    } else if (is(child, XSL, "for-each")) {
      const select = child.getAttribute("select").trim();
      for (const v of violations(child, file)) out.push({ ...v, viol: `exists((${select})[${v.viol}])` });
    } else if (is(child, XSL, "choose")) {
      const seen = [];
      for (const branch of elements(child)) {
        const guard = is(branch, XSL, "when") ? branch.getAttribute("test").trim() : null;
        if (!guard && !is(branch, XSL, "otherwise")) throw new Error(`${file}: unsupported <${branch.localName}> in xsl:choose`);
        const lead = [...seen.map((t) => `not(${t})`), ...(guard ? [`(${guard})`] : [])].join(" and ") || "true()";
        for (const v of violations(branch, file)) out.push({ ...v, viol: `${lead} and (${v.viol})` });
        if (guard) seen.push(guard);
      }
    } else throw new Error(`${file}: unsupported <${child.localName}> in a rule`);
  }
  return out;
}

// -> the same rule list shape as the ph-schematron route, from a SchXslt stylesheet.
function schxsltPatterns(root, file) {
  const patterns = new Map();
  for (const t of elements(root)) {
    if (!is(t, XSL, "template") || !t.hasAttribute("match")) continue;
    const choose = elements(t).find((e) => is(e, XSL, "choose"));
    const otherwise = choose && elements(choose).find((e) => is(e, XSL, "otherwise"));
    // a template with no xsl:choose has no shadowing check: its rule sits straight under it
    const rule = elements(otherwise || t).find((e) => is(e, SCHXSLT_NS(), "rule"));
    if (!rule) continue;
    const id = rule.getAttribute("pattern");
    if (!patterns.has(id)) patterns.set(id, []);
    patterns.get(id).push({ template: t, rule });
  }
  return patterns;
}
const SCHXSLT_NS = () => SCHXSLT;

// -> the Schematron source text rebuilt from `xsltPath`, and the title.
export function schematronFromXslt(xsltPath) {
  const root = parseXmlDocument(readFileSync(xsltPath, "utf8")).documentElement;
  if (root.lookupNamespaceURI("schxslt") === SCHXSLT && !elements(root).some((e) => is(e, XSL, "template") && /^M\d+$/.test(e.getAttribute("mode") ?? ""))) return schematronFromSchxslt(root, xsltPath);
  const ns = new Map();
  const lets = [];
  const functions = [];
  const patterns = new Map();
  for (const el of elements(root)) {
    // a top-level xsl:param with a select is a <let> evaluated from the root (the stock archive* params have none)
    if ((is(el, XSL, "variable") && el.getAttribute("name") !== "document-uri") || (is(el, XSL, "param") && el.hasAttribute("select"))) lets.push(el);
    else if (is(el, XSL, "function")) functions.push(el);
    else if (is(el, XSL, "template") && el.hasAttribute("mode") && /^M\d+$/.test(el.getAttribute("mode")) && elements(el).some((e) => is(e, SVRL, "fired-rule"))) {
      const mode = el.getAttribute("mode");
      if (!patterns.has(mode)) patterns.set(mode, []);
      patterns.get(mode).push(el);
    }
  }
  // the prefixes the rules use are declared inside the root template ("/")
  for (const el of root.getElementsByTagNameNS(SVRL, "ns-prefix-in-attribute-values")) ns.set(el.getAttribute("prefix"), el.getAttribute("uri"));
  // `xsd:` is declared on the stylesheet and used in function bodies, but is not an svrl entry
  for (const prefix of ["xs", "xsd"]) if (!ns.has(prefix)) ns.set(prefix, "http://www.w3.org/2001/XMLSchema");
  // prefixes the XSLT functions use (u:) are declared on the stylesheet, not as svrl ns entries
  for (const fn of functions) {
    const prefix = fn.getAttribute("name").split(":")[0];
    if (!ns.has(prefix)) ns.set(prefix, root.lookupNamespaceURI(prefix));
  }
  if (![...patterns.values()].some((p) => p.length)) throw new Error(`${xsltPath}: no rules found`);

  const parts = [`<schema xmlns="${SCH}" xmlns:xsl="${XSL}">`];
  for (const [prefix, uri] of ns) parts.push(`<ns prefix="${esc(prefix)}" uri="${esc(uri)}"/>`);
  for (const v of lets) parts.push(`<let name="${esc(v.getAttribute("name"))}" value="${esc(variableValue(v))}"/>`);
  // xsd: and xs: are the same namespace; the XQuery prolog only knows xs:
  for (const f of functions) parts.push(serializeToWellFormedString(f).replace(/\bxsd:/g, "xs:"));
  for (const [mode, templates] of patterns) {
    parts.push(`<pattern id="${mode}">`);
    // XSLT picks the highest priority first; ties keep document order.
    const ordered = templates.map((t, i) => [t, i]).sort((a, b) => Number(b[0].getAttribute("priority") ?? 0) - Number(a[0].getAttribute("priority") ?? 0) || a[1] - b[1]);
    for (const [t] of ordered) {
      parts.push(`<rule context="${esc(t.getAttribute("match"))}">`);
      for (const v of elements(t).filter((e) => is(e, XSL, "variable"))) parts.push(`<let name="${esc(v.getAttribute("name"))}" value="${esc(variableValue(v))}"/>`);
      for (const a of assertsOf(t, xsltPath)) parts.push(`<assert id="${esc(a.id)}" flag="${esc(a.flag)}" test="${esc(a.test)}">${esc(a.text)}</assert>`);
      parts.push("</rule>");
    }
    parts.push("</pattern>");
  }
  parts.push("</schema>");
  return parts.join("\n");
}

export function compileXslt(xsltPath) {
  const dir = mkdtempSync(join(tmpdir(), "einvoice-xslt-"));
  const sch = join(dir, "rules.sch");
  writeFileSync(sch, schematronFromXslt(xsltPath));
  return compileSchematron(sch);
}

function schematronFromSchxslt(root, file) {
  // a lookup table written as element content (the CEN file's Discount list) is not an XPath value
  const lets = elements(root).filter((e) => (is(e, XSL, "variable") || is(e, XSL, "param")) && e.hasAttribute("select"));
  const patterns = schxsltPatterns(root, file);
  if (!patterns.size) throw new Error(`${file}: no rules found`);
  const ns = new Map();
  for (const el of root.getElementsByTagNameNS(SVRL, "ns-prefix-in-attribute-values")) ns.set(el.getAttribute("prefix"), el.getAttribute("uri"));
  for (const prefix of ["xs", "xsd"]) if (!ns.has(prefix)) ns.set(prefix, "http://www.w3.org/2001/XMLSchema");
  const parts = [`<schema xmlns="${SCH}" xmlns:xsl="${XSL}">`];
  for (const [prefix, uri] of ns) parts.push(`<ns prefix="${esc(prefix)}" uri="${esc(uri)}"/>`);
  for (const v of lets) parts.push(`<let name="${esc(v.getAttribute("name"))}" value="${esc(variableValue(v))}"/>`);
  for (const [id, rules] of patterns) {
    parts.push(`<pattern id="${esc(id)}">`);
    const ordered = rules.map((r, i) => [r, i]).sort((a, b) => Number(b[0].template.getAttribute("priority") ?? 0) - Number(a[0].template.getAttribute("priority") ?? 0) || a[1] - b[1]);
    for (const [{ template, rule }] of ordered) {
      parts.push(`<rule context="${esc(template.getAttribute("match"))}">`);
      for (const v of elements(rule).filter((e) => is(e, XSL, "variable"))) parts.push(`<let name="${esc(v.getAttribute("name"))}" value="${esc(variableValue(v))}"/>`);
      const body = { childNodes: [...rule.childNodes].filter((c) => !(c.nodeType === 1 && is(c, XSL, "variable"))) };
      for (const a of violations(body, file)) parts.push(`<assert id="${esc(a.id)}" flag="${esc(a.flag === "error" ? "fatal" : a.flag)}" test="${esc(`not(${a.viol})`)}">${esc(a.text)}</assert>`);
      parts.push("</rule>");
    }
    parts.push("</pattern>");
  }
  parts.push("</schema>");
  return parts.join("\n");
}
