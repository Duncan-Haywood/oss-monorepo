#!/usr/bin/env node
// csp-policy-check CLI: lint a Content-Security-Policy and test loads against it.
//
//   node cli.mjs "script-src 'self'; object-src 'none'"
//   curl -sI https://example.com | node cli.mjs            (reads the header from stdin)
//   node cli.mjs --url https://example.com                  (fetches the page's headers)
//   node cli.mjs "<policy>" --test script https://cdn.test/a.js [--nonce N] [--origin https://site.test]
//   node cli.mjs "<policy>" --inline script "alert(1)"      (script | handler | style | style-attr)
//   node cli.mjs "<policy>" --eval
//   --json prints machine-readable output. Exit 1 if any high finding, or a tested load is blocked.
//
// No warranty. This tool is provided free and as-is, without warranty of any
// kind. It is not security, legal or professional advice, and it does not
// replace a qualified professional or a penetration test. You are responsible
// for reviewing and verifying its output before relying on it.
import { analyze, parsePolicyList, checkFetch, checkInline, checkEval, RESOURCE_TYPES } from "./csp.mjs";
import { pathToFileURL } from "node:url";

const HELP = `Usage: csp-policy-check [policy] [--url URL] [--report-only] [--meta] [--json]
         [--test <${Object.keys(RESOURCE_TYPES).join("|")}> <url> [--nonce N] [--dynamic]]
         [--inline <script|handler|style|style-attr> <text> [--nonce N]] [--eval] [--origin URL]
With no policy argument, reads stdin (a bare policy, a header dump such as curl -sI, or a <meta> tag).
--dynamic: the script is inserted by another script (not parser-inserted), as 'strict-dynamic' allows.

No warranty: free and as-is; not security, legal or professional advice. Verify before relying on it.
Runs locally; --url makes one GET request to the URL you give, and nothing is sent anywhere else.`;

export function parseArgs(argv) {
  const o = { json: false, reportOnly: undefined, delivery: undefined, policy: null, url: null, test: null, inline: null, eval: false, nonce: null, origin: null, dynamic: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const need = (n) => { if (i + n >= argv.length) throw new Error(`${a} needs ${n} value${n > 1 ? "s" : ""}`); const v = argv.slice(i + 1, i + 1 + n); i += n; return v; };
    if (a === "--json") o.json = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a === "--report-only") o.reportOnly = true;
    else if (a === "--meta") o.delivery = "meta";
    else if (a === "--url") [o.url] = need(1);
    else if (a === "--test") o.test = need(2);
    else if (a === "--inline") o.inline = need(2);
    else if (a === "--eval") o.eval = true;
    else if (a === "--nonce") [o.nonce] = need(1);
    else if (a === "--origin") [o.origin] = need(1);
    else if (a === "--dynamic") o.dynamic = true;
    else if (a.startsWith("--")) throw new Error(`unknown option ${a}`);
    else if (o.policy === null) o.policy = a;
    else throw new Error(`unexpected argument: ${a}`);
  }
  if (o.test && !Object.hasOwn(RESOURCE_TYPES, o.test[0])) throw new Error(`--test type must be one of ${Object.keys(RESOURCE_TYPES).join(", ")}`);
  return o;
}

/** Pull CSP header lines out of a raw header dump (curl -sI); otherwise return the text as is. */
export function fromHeaderDump(text) {
  const lines = String(text).split(/\r?\n/);
  const enforce = [], report = [];
  for (const l of lines) {
    const m = l.match(/^content-security-policy(-report-only)?\s*:\s*(.*)$/i);
    if (m) (m[1] ? report : enforce).push(m[2].trim());
  }
  if (enforce.length) return { text: enforce.join(", "), reportOnly: false, found: true };
  if (report.length) return { text: report.join(", "), reportOnly: true, found: true };
  return { text: String(text).trim(), reportOnly: undefined, found: false };
}

async function readStdin() {
  if (process.stdin.isTTY) return "";
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s;
}

const SEV = { high: "HIGH  ", medium: "MEDIUM", low: "LOW   ", info: "INFO  " };

export async function run(argv, { stdin = readStdin, fetchImpl = globalThis.fetch, out = console.log } = {}) {
  let o;
  try { o = parseArgs(argv); } catch (e) { out(`error: ${e.message}\n\n${HELP}`); return 2; }
  if (o.help) { out(HELP); return 0; }
  let text = o.policy, reportOnly = o.reportOnly, origin = o.origin;
  if (o.url) {
    let res;
    try { res = await fetchImpl(o.url, { redirect: "follow" }); } catch (e) { out(`error: could not fetch ${o.url}: ${e.message}`); return 2; }
    const enf = res.headers.get("content-security-policy");
    const rep = res.headers.get("content-security-policy-report-only");
    text = enf ?? rep ?? "";
    if (!enf && rep) reportOnly = reportOnly ?? true;
    origin = origin ?? res.url ?? o.url;
    if (!enf && !rep) { out(`${o.url} sent no Content-Security-Policy header (a <meta> policy in the HTML is not read by --url).`); }
  } else if (text === null) {
    const dump = fromHeaderDump(await stdin());
    text = dump.text;
    reportOnly = reportOnly ?? dump.reportOnly;
  }
  const r = analyze(text, { reportOnly, delivery: o.delivery });
  const policies = r.policies;
  const tests = [];
  const opts = { origin: origin || undefined, nonce: o.nonce || undefined, parserInserted: !o.dynamic };
  try {
    if (o.test) tests.push({ what: `${o.test[0]} ${o.test[1]}`, ...checkFetch(policies, o.test[0], o.test[1], opts) });
    if (o.inline) tests.push({ what: `inline ${o.inline[0]}`, ...(await checkInline(policies, o.inline[0], o.inline[1], opts)) });
    if (o.eval) tests.push({ what: "eval()", ...checkEval(policies) });
  } catch (e) { out(`error: ${e.message}`); return 2; }

  if (o.json) {
    out(JSON.stringify({ summary: r.summary, reportOnly: r.reportOnly, delivery: r.delivery, policies: policies.map((p) => Object.fromEntries(p.directives)), findings: r.findings, tests }, null, 2));
  } else {
    out(r.summary);
    for (const f of r.findings) {
      out(`${(Object.hasOwn(SEV, f.severity) ? SEV[f.severity] : f.severity)} ${f.directive ? f.directive + ": " : ""}${f.message}${f.fix ? `\n        fix: ${f.fix}` : ""}`);
    }
    for (const t of tests) {
      out(`\n${t.allowed ? "ALLOWED" : "BLOCKED"}  ${t.what}`);
      t.results.forEach((x, i) => out(`  ${policies.length > 1 ? `policy ${i + 1}: ` : ""}${x.why}`));
    }
  }
  const blocked = tests.some((t) => !t.allowed);
  const high = r.findings.some((f) => f.severity === "high");
  return high || blocked ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
