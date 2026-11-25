// Turns Schematron source into the plain JSON the JS evaluator runs
// (plain-schematron.mjs). Build-time only (Node, slimdom): the page and the
// server never parse .sch files.
//
// What it handles, because the four rule sets need exactly this and no more:
//   - <include href> (the XRechnung common.sch of global <let>s);
//   - <let> at schema, pattern and rule level, by substituting the value for
//     $name in later lets, contexts and tests (no variable binding at run time).
//     A schema or pattern <let> is evaluated once with the document node as its
//     context (it compiles to a global xsl:variable), so a value with a relative
//     path is substituted as root(.)/(value): pasted bare into a rule, its path
//     would start from the rule's node instead. Until 2026-11-14 it was pasted
//     bare, and Peppol's DK-R-* and IS-R-* rules, whose country lets read
//     ubl-invoice:Invoice/..., never fired (eval/peppol-unit-tests.mjs);
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

// A value that reads the document by a relative path (a prefixed step that is not a
// function call, e.g. ubl-invoice:Invoice/cac:...). Constants and absolute paths
// mean the same from any node and are left alone.
const RELATIVE_STEP = /(?<![\w.$'"-])[A-Za-z_][\w.-]*:[A-Za-z_][\w.-]*(?![\w.-]*\s*\()/;
export function fromRoot(value) {
  const bare = value.replace(/'[^']*'|"[^"]*"/g, "''");
  return RELATIVE_STEP.test(bare) && !/^\s*\//.test(value) ? `root(.)/(${value})` : value;
}

function substitute(text, lets) {
  let out = text;
  for (const [name, value] of [...lets].reverse()) {
    out = out.replace(new RegExp(`\\$${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`, "g"), () => `(${value})`);
  }
  return out;
}

// True when `$name` occurs inside a predicate ([...]) of `test`, outside string literals.
export function usedInPredicate(test, name) {
  const ref = new RegExp(`^\\$${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`);
  let depth = 0;
  let quote = "";
  for (let i = 0; i < test.length; i++) {
    const c = test[i];
    if (quote) { if (c === quote) quote = ""; continue; }
    if (c === "'" || c === '"') quote = c;
    else if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === "$" && depth > 0 && ref.test(test.slice(i))) return true;
  }
  return false;
}

// A rule <let> is evaluated once, at the rule's context node. Pasting its text into the
// test is the same thing only where the test reads it at that node: inside a predicate
// the context is another node, and a relative value (FNFE-MPE's BR-FR-MV-03
// `$invcurrency` = ../../cbc:DocumentCurrencyCode, read inside TaxAmount[...]) then
// reads the wrong element (and BR-FR-MV-05 reads $grouplineID inside a predicate of
// another let, $sumsubline). When the test, or a rule let it uses, reads a rule let
// inside a predicate, every rule let the test needs is bound with an XPath 3.1
// `let ... return` at the context node, in declaration order, as XSLT evaluates them.
// Otherwise the text is substituted as before, so sets that never read a rule let inside
// a predicate compile to the same text.
//   rawLets: [name, value] of the rule's own lets, as written (unsubstituted);
//   outer: the pattern and schema lets, already resolved.
function bindInPredicates(test, rawLets, outer) {
  const refs = (text, name) => new RegExp(`\\$${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w.-])`).test(text);
  // the rule lets this test needs, transitively (a later let shadows an earlier one)
  const need = new Set();
  const visit = (text, before) => {
    for (let i = before - 1; i >= 0; i--) {
      const [name, value] = rawLets[i];
      if (need.has(i) || !refs(text, name) || rawLets.slice(i + 1, before).some(([n]) => n === name)) continue;
      need.add(i);
      visit(value, i);
    }
  };
  visit(test, rawLets.length);
  const used = [...need].sort((a, b) => a - b);
  const inPredicate = used.some((i) => usedInPredicate(test, rawLets[i][0]) || used.some((j) => j > i && usedInPredicate(rawLets[j][1], rawLets[i][0])));
  if (!inPredicate) {
    const inRule = [...outer];
    for (const [name, value] of rawLets) inRule.push([name, substitute(value, inRule)]);
    return substitute(test, inRule);
  }
  const names = new Set(used.map((i) => rawLets[i][0]));
  const keep = outer.filter(([n]) => !names.has(n)); // a rule let shadows a same-named outer one
  const chain = used.map((i) => `let $${rawLets[i][0]} := (${substitute(rawLets[i][1], keep)}) return `).join("");
  return `${chain}(${substitute(test, keep)})`;
}

// IBAN mod-97 checks (DE-R-019/020) cast a 24-digit string to xs:integer, which
// fontoxpath keeps in a double. Run them as a digit-by-digit remainder instead.
const BIGMOD = 'declare function u:bigmod($digits as xs:string, $m as xs:integer) as xs:integer { fold-left(string-to-codepoints($digits), 0, function($acc, $c) { ($acc * 10 + $c - 48) mod $m }) };';
// fn:format-number is not in fontoxpath. The only pictures the rule sets use ('0.00', '#.00') mean
// two decimals, half-to-even, and the rules compare two such strings; '#.00' drops a zero integer part.
const FMT = 'declare function u:fmt($n as item()*, $pic as xs:string) as xs:string { if (empty($n)) then "NaN" else let $x := xs:double($n) return if ($x != $x) then "NaN" else let $c := xs:integer(round-half-to-even(abs($x) * 100)) return concat(if ($x < 0 and $c > 0) then "-" else "", if ($c idiv 100 > 0 or starts-with($pic, "0")) then string($c idiv 100) else "", ".", substring(string(100 + $c mod 100), 2)) };';
const rewriteFormatNumber = (test) => test.replace(/(?<![\w:.-])format-number\(/g, "u:fmt(");
// fontoxpath 3.34's format-integer ignores a zero-padded picture: format-integer(1, '00') is
// "1", not "01". Peppol BIS 3.1.0's PEPPOL-COMMON-R058 (u:mod89-LU_VAT) compares two check
// digits that way, so a valid Luxembourg VAT number whose check digits are 00-09 got a
// false warning (OpenPeppol's own unit test LU00000101, 2026-11-18). All-zero pictures are
// padded here; any other picture goes to format-integer as before.
const FMT_INT = 'declare function u:format-integer($n as xs:integer?, $pic as xs:string) as xs:string { if (empty($n)) then "" else if (matches($pic, "^0+$")) then let $s := string(abs($n)) return concat(if ($n < 0) then "-" else "", string-join(for $i in (string-length($s) + 1 to string-length($pic)) return "0", ""), $s) else format-integer($n, $pic) };';
const FMT_INT_CALL = /(?<![\w.\-:$])(?:fn:)?format-integer(?=\s*\()/g;
export const rewriteFormatInteger = (text) => text.replace(FMT_INT_CALL, "u:format-integer");
// fontoxpath 3.34 has neither adjust-date-to-timezone nor adjust-dateTime-to-timezone, so a
// rule calling one was always skipped ("not checked"): Oman's IBR-171-OM, an issue date
// in the future by Oman time (2026-11-17). Calls are renamed to these XQuery copies of
// F&O 3.1 sections 10.7.1-2 (an empty $tz drops the zone without moving the clock).
const TZ = [
  "declare function u:tz-string($tz as xs:dayTimeDuration) as xs:string { let $m := xs:integer($tz div xs:dayTimeDuration('PT1M')) let $a := abs($m) return concat(if ($m < 0) then '-' else '+', substring(string(100 + $a idiv 60), 2), ':', substring(string(100 + $a mod 60), 2)) };",
  "declare function u:adjust-dateTime-to-timezone($v as xs:dateTime?, $tz as xs:dayTimeDuration?) as xs:dateTime? { if (empty($v)) then () else let $local := xs:dateTime(replace(string($v), '(Z|[+\\-]\\d\\d:\\d\\d)$', '')) return if (empty($tz)) then $local else let $src := timezone-from-dateTime($v) let $shifted := if (empty($src)) then $local else $local + ($tz - $src) return xs:dateTime(concat(string($shifted), u:tz-string($tz))) };",
  "declare function u:adjust-date-to-timezone($v as xs:date?, $tz as xs:dayTimeDuration?) as xs:date? { if (empty($v)) then () else let $d := replace(string($v), '(Z|[+\\-]\\d\\d:\\d\\d)$', '') return if (empty($tz)) then xs:date($d) else let $dt := u:adjust-dateTime-to-timezone(xs:dateTime(concat($d, 'T00:00:00', substring-after(string($v), $d))), $tz) return xs:date(concat(substring(string($dt), 1, 10), u:tz-string($tz))) };",
].join("\n");
const TZ_CALL = /(?<![\w.\-:$])(?:fn:)?(adjust-date(?:Time)?-to-timezone)(?=\s*\()/g;
export const rewriteTimezone = (text) => text.replace(TZ_CALL, "u:$1");

// current() is XSLT's, not XPath's; fontoxpath does not know it. In a Schematron assert it
// is the rule's context node, so the test is bound to it with a let (Oman's
// ALIGNED-IBRP-S-08-OM reads the subtotal's rate inside a predicate over the lines).
const CURRENT_CALL = /(?<![\w.\-:$])(?:fn:)?current\s*\(\s*\)/g;
export const rewriteCurrent = (test) => (test.search(CURRENT_CALL) >= 0 ? `let $schematron-current := . return (${test.replace(CURRENT_CALL, "$schematron-current")})` : test);

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
  let decl = `declare function ${name}(${params.join(", ")})${as ? ` as ${as}` : ""} { ${body(stmts)} };`;
  // fontoxpath does not implement a `let` whose variable has a prefix ("let expressions
  // with namespace usage"), and one such let breaks the whole prolog. FNFE-MPE's BR-FR
  // functions declare `$custom:eas-codes` and the like: rename them to `$custom_eas-codes`
  // inside that function (they are local; nothing outside can name them).
  const prefixed = new Set([...decl.matchAll(/\blet \$([\w.-]+:[\w.-]+)/g)].map((m) => m[1]));
  for (const v of prefixed) decl = decl.replace(new RegExp(`\\$${v.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}(?![\\w.-])`, "g"), `$${v.replace(":", "_")}`);
  return decl;
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
  const rootedGlobals = resolvedGlobals.map(([name, value]) => [name, fromRoot(value)]);

  // The ISO skeleton writes a pattern's <let> as a top-level xsl:variable, so a later
  // pattern can read it (FNFE-MPE's BR-FR-MV-02..14 read BR-FR-MV-01's $invoiceID, and
  // FNFE's own XSLT has it at the top level). Earlier patterns' lets are in scope here
  // too, behind the pattern's own; with no clash this changes nothing for other sets.
  const earlier = [];
  const out = patterns.map((p) => {
    const inPattern = [...rootedGlobals, ...earlier];
    for (const [name, value] of p.lets) earlier.push([name, fromRoot(substitute(value, [...rootedGlobals, ...earlier]))]);
    for (const [name, value] of p.lets) inPattern.push([name, fromRoot(substitute(value, inPattern))]);
    return {
      id: p.id,
      rules: p.rules.map((r) => {
        const inRule = [...inPattern];
        for (const l of elements(r).filter((e) => is(e, SCH, "let"))) inRule.push([l.getAttribute("name"), substitute(l.getAttribute("value"), inRule)]);
        const rawLets = elements(r).filter((e) => is(e, SCH, "let")).map((l) => [l.getAttribute("name"), l.getAttribute("value")]);
        const checks = elements(r).filter((e) => is(e, SCH, "assert") || is(e, SCH, "report")).map((a) => ({
          kind: a.localName,
          id: a.getAttribute("id") || "",
          flag: a.getAttribute("flag") || r.getAttribute("flag") || "fatal",
          test: rewriteFormatInteger(rewriteCurrent(rewriteTimezone(rewriteFormatNumber(rewriteBigMod(bindInPredicates(a.getAttribute("test"), rawLets, inPattern)))))),
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
  // A function's own parameters and variables shadow a global of the same name: Oman's
  // PINT set has a global $lines and u:vatBase($cat, $lines, ...), and pasting the global
  // into the parameter list broke the whole prolog, so every rule that read it was skipped
  // (2026-11-17, eval/pint-zatca-whitespace-2026-11-17.md).
  const declared = functions.map((f) => {
    const local = new Set(elements(f).filter((e) => is(e, XSL, "param")).map((e) => e.getAttribute("name")));
    const walk = (n) => { for (const e of elements(n)) { if (is(e, XSL, "variable")) local.add(e.getAttribute("name")); walk(e); } };
    walk(f);
    return rewriteFormatInteger(rewriteTimezone(rewriteBigMod(substitute(xqueryFunction(f), resolvedGlobals.filter(([name]) => !local.has(name))))));
  });
  const usesBigMod = [...declared, ...out.flatMap((p) => p.rules.flatMap((r) => r.checks.map((c) => c.test)))].some((t) => t.includes("u:bigmod("));
  const usesFmt = out.some((p) => p.rules.some((r) => r.checks.some((c) => c.test.includes("u:fmt("))));
  const usesTz = [...declared, ...out.flatMap((p) => p.rules.flatMap((r) => r.checks.map((c) => c.test)))].some((t) => /\bu:adjust-date(?:Time)?-to-timezone\(/.test(t));
  const usesFmtInt = [...declared, ...out.flatMap((p) => p.rules.flatMap((r) => r.checks.map((c) => c.test)))].some((t) => t.includes("u:format-integer("));
  const prolog = [...declared, ...(usesBigMod ? [BIGMOD] : []), ...(usesFmt ? [FMT] : []), ...(usesFmtInt ? [FMT_INT] : []), ...(usesTz ? [TZ] : [])].join("\n");
  const prefixes = new Set([...functions.map((f) => f.getAttribute("name").split(":")[0]), ...(usesBigMod || usesFmt || usesFmtInt || usesTz ? ["u"] : [])]);
  if ((usesFmt || usesFmtInt || usesTz) && !ns.u) ns.u = "urn:einvoice-preflight:util"; // prolog namespace for the helpers above
  const usesFunction = new RegExp(`(?<![\\w.-])(?:${[...prefixes].join("|")}):[A-Za-z]`);
  for (const p of out) for (const r of p.rules) for (const c of r.checks) if (prolog && usesFunction.test(c.test)) c.xq = true;
  const declarations = [...prefixes].map((p) => `declare namespace ${p} = "${ns[p]}";`).join("\n");
  return { ns, prolog: prolog ? `${declarations}\n${prolog}\n` : "", patterns: out };
}
