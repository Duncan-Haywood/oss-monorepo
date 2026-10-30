// Turns Schematron source into the plain JSON the JS evaluator runs
// (plain-schematron.mjs). Build-time only (Node, slimdom): the page and the
// server never parse .sch files.
//
// What it handles, because the four rule sets need exactly this and no more:
//   - <include href> (the XRechnung common.sch of global <let>s);
//   - <let> at schema, pattern and rule level, by substituting the value for
//     $name in later lets, contexts and tests (no variable binding at run time);
//   - <xsl:function> bodies (Peppol's checksum functions), rewritten as XQuery
//     `declare function` so fontoxpath can run them.
// It throws on anything else (abstract patterns, <diagnostics>, xsl:for-each in
// a function body, ...) rather than dropping a rule: a missing rule would read
// as a pass.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseXmlDocument } from "slimdom";

const SCH = "http://purl.oclc.org/dsdl/schematron";
const XSL = "http://www.w3.org/1999/XSL/Transform";

const elements = (node) => [...node.childNodes].filter((c) => c.nodeType === 1);
const is = (node, uri, name) => node.namespaceURI === uri && node.localName === name;
const clean = (text) => text.replace(/\s+/g, " ").trim();

function parseFile(path) {
  return parseXmlDocument(readFileSync(path, "utf8")).documentElement;
}

// <include href> replaced by the included file's children (or the file itself
// when its root is the element being included, e.g. a <pattern>).
function expandIncludes(parent, file) {
  for (const child of elements(parent)) {
    if (is(child, SCH, "include")) {
      const target = resolve(dirname(file), child.getAttribute("href"));
      const root = parseFile(target);
      expandIncludes(root, target);
      parent.replaceChild(root, child);
    } else {
      expandIncludes(child, file);
    }
  }
}

function substitute(text, lets) {
  let out = text;
  for (const [name, value] of [...lets].reverse()) {
    out = out.replace(new RegExp(`\\$${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`, "g"), () => `(${value})`);
  }
  return out;
}

// IBAN mod-97 checks (DE-R-019/020) cast a 24-digit string to xs:integer, which
// fontoxpath keeps in a double. Run them as a digit-by-digit remainder instead.
const BIGMOD = 'declare function u:bigmod($digits as xs:string, $m as xs:integer) as xs:integer { fold-left(string-to-codepoints($digits), 0, function($acc, $c) { ($acc * 10 + $c - 48) mod $m }) };';
// fn:format-number is not in fontoxpath. The only pictures the rule sets use ('0.00', '#.00') mean
// two decimals, half-to-even, and the rules compare two such strings; '#.00' drops a zero integer part.
const FMT = 'declare function u:fmt($n as item()*, $pic as xs:string) as xs:string { if (empty($n)) then "NaN" else let $x := xs:double($n) return if ($x != $x) then "NaN" else let $c := xs:integer(round-half-to-even(abs($x) * 100)) return concat(if ($x < 0 and $c > 0) then "-" else "", if ($c idiv 100 > 0 or starts-with($pic, "0")) then string($c idiv 100) else "", ".", format-integer($c mod 100, "00")) };';
const rewriteFormatNumber = (test) => test.replace(/(?<![\w:.-])format-number\(/g, "u:fmt(");
function rewriteBigMod(test) {
  let out = "";
  let rest = test;
  for (;;) {
    const m = /xs:(?:integer|decimal)\(\s*(?=string-join\()/.exec(rest);
    if (!m) return out + rest;
    let depth = 1;
    let i = m.index + m[0].length;
    const innerStart = i;
    let quote = "";
    for (; i < rest.length && depth; i++) {
      const c = rest[i];
      if (quote) { if (c === quote) quote = ""; continue; }
      if (c === "'" || c === '"') quote = c;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
    }
    const after = /^\s*mod\s+(\d+)/.exec(rest.slice(i));
    if (!after) { out += rest.slice(0, i); rest = rest.slice(i); continue; }
    out += `${rest.slice(0, m.index)}u:bigmod(${rest.slice(innerStart, i - 1)}, ${after[1]})`;
    rest = rest.slice(i + after[0].length);
  }
}

// Rewrites an xsl:function as an XQuery function declaration.
function xqueryFunction(fn) {
  const name = fn.getAttribute("name");
  const params = elements(fn).filter((e) => is(e, XSL, "param"))
    .map((p) => `$${p.getAttribute("name")}${p.getAttribute("as") ? ` as ${p.getAttribute("as")}` : ""}`);
  const body = (nodes) => {
    const [first, ...rest] = nodes;
    if (!first) throw new Error(`function ${name}: body ends without a value`);
    // value-of in a function typed xs:boolean/xs:string: the select's own value
    if (is(first, XSL, "sequence") || is(first, XSL, "value-of")) return `(${first.getAttribute("select")})`;
    if (is(first, XSL, "variable")) {
      const select = first.getAttribute("select")
        ?? (elements(first).length ? valueOf(first) : JSON.stringify(first.textContent.trim()));
      return `let $${first.getAttribute("name")} := (${select}) return ${body(rest)}`;
    }
    if (is(first, XSL, "choose")) {
      const whens = elements(first).filter((e) => is(e, XSL, "when"));
      const otherwise = elements(first).find((e) => is(e, XSL, "otherwise"));
      if (!otherwise || rest.length) throw new Error(`function ${name}: unsupported xsl:choose`);
      return whens.reduceRight((acc, w) => `if (${w.getAttribute("test")}) then ${body(elements(w))} else ${acc}`, body(elements(otherwise)));
    }
    throw new Error(`function ${name}: unsupported <${first.localName}>`);
  };
  const valueOf = (variable) => {
    const seq = elements(variable).find((e) => is(e, XSL, "sequence") || is(e, XSL, "value-of"));
    if (!seq || elements(variable).length !== 1) throw new Error(`function ${name}: unsupported variable body`);
    return seq.getAttribute("select");
  };
  const as = fn.getAttribute("as");
  const stmts = elements(fn).filter((e) => !is(e, XSL, "param"));
  return `declare function ${name}(${params.join(", ")})${as ? ` as ${as}` : ""} { ${body(stmts)} };`;
}

// file -> { ns, prolog, patterns } ; `prefixFor` finds the namespace URI of u: in the prolog.
export function compileSchematron(file) {
  const root = parseFile(file);
  expandIncludes(root, file);
  if (!is(root, SCH, "schema")) throw new Error(`${file}: root is not a Schematron <schema>`);

  const ns = {};
  const functions = [];
  const globalLets = [];
  const patterns = [];

  for (const el of elements(root)) {
    if (is(el, SCH, "ns")) ns[el.getAttribute("prefix")] = el.getAttribute("uri");
    else if (is(el, SCH, "let")) globalLets.push([el.getAttribute("name"), el.getAttribute("value")]);
    else if (is(el, XSL, "function")) functions.push(el);
    else if (is(el, SCH, "pattern")) {
      if (el.getAttribute("abstract") === "true" || el.getAttribute("is-a")) throw new Error(`${file}: abstract patterns are not supported`);
      const patternLets = [];
      const rules = [];
      for (const r of elements(el)) {
        if (is(r, SCH, "let")) patternLets.push([r.getAttribute("name"), r.getAttribute("value")]);
        else if (is(r, SCH, "rule")) rules.push(r);
        else if (!is(r, SCH, "title") && !is(r, SCH, "p")) throw new Error(`${file}: unsupported <${r.localName}> in pattern`);
      }
      if (!rules.length) {
        globalLets.push(...patternLets); // a pattern that only declares variables
        continue;
      }
      patterns.push({ id: el.getAttribute("id"), lets: patternLets, rules });
    } else if (!["title", "phase", "p"].includes(el.localName)) {
      throw new Error(`${file}: unsupported <${el.localName}> in schema`);
    }
  }

  // Globals may refer to earlier globals.
  const resolvedGlobals = [];
  for (const [name, value] of globalLets) resolvedGlobals.push([name, substitute(value, resolvedGlobals)]);

  const out = patterns.map((p) => {
    const inPattern = [...resolvedGlobals];
    for (const [name, value] of p.lets) inPattern.push([name, substitute(value, inPattern)]);
    return {
      id: p.id,
      rules: p.rules.map((r) => {
        const inRule = [...inPattern];
        for (const l of elements(r).filter((e) => is(e, SCH, "let"))) inRule.push([l.getAttribute("name"), substitute(l.getAttribute("value"), inRule)]);
        const checks = elements(r).filter((e) => is(e, SCH, "assert") || is(e, SCH, "report")).map((a) => ({
          kind: a.localName,
          id: a.getAttribute("id") || "",
          flag: a.getAttribute("flag") || r.getAttribute("flag") || "fatal",
          test: rewriteFormatNumber(rewriteBigMod(substitute(a.getAttribute("test"), inRule))),
          text: clean(a.textContent),
        }));
        for (const e of elements(r)) {
          if (!is(e, SCH, "let") && !is(e, SCH, "assert") && !is(e, SCH, "report")) throw new Error(`${file}: unsupported <${e.localName}> in rule`);
        }
        return { context: substitute(r.getAttribute("context"), inRule), checks };
      }),
    };
  });

  // Function bodies may read global lets ($XR-IBAN-REGEX) and do the same big-integer mod 97.
  const declared = functions.map((f) => rewriteBigMod(substitute(xqueryFunction(f), resolvedGlobals)));
  const usesBigMod = [...declared, ...out.flatMap((p) => p.rules.flatMap((r) => r.checks.map((c) => c.test)))].some((t) => t.includes("u:bigmod("));
  const usesFmt = out.some((p) => p.rules.some((r) => r.checks.some((c) => c.test.includes("u:fmt("))));
  const prolog = [...declared, ...(usesBigMod ? [BIGMOD] : []), ...(usesFmt ? [FMT] : [])].join("\n");
  const prefixes = new Set([...functions.map((f) => f.getAttribute("name").split(":")[0]), ...(usesBigMod || usesFmt ? ["u"] : [])]);
  if (usesFmt && !ns.u) ns.u = "urn:einvoice-preflight:util"; // prolog namespace for the helper above
  const usesFunction = new RegExp(`(?<![\\w.-])(?:${[...prefixes].join("|")}):[A-Za-z]`);
  for (const p of out) for (const r of p.rules) for (const c of r.checks) if (prolog && usesFunction.test(c.test)) c.xq = true;
  const declarations = [...prefixes].map((p) => `declare namespace ${p} = "${ns[p]}";`).join("\n");
  return { ns, prolog: prolog ? `${declarations}\n${prolog}\n` : "", patterns: out };
}
