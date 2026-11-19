import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsePolicy, parsePolicyList, extractPolicyText, classifySource, effectiveList,
  urlMatchesExpression, pathPartMatch, checkFetch, checkInline, checkEval,
  inlineHash, lint, analyze, summary,
} from "./csp.mjs";

const U = (s) => new URL(s);
const ORIGIN = U("https://example.com/page");
const ids = (findings) => findings.map((f) => f.id);

// --- Worked examples from the specs (README, "Spec sources") -------------

test("spec example: hash of alert('Hello, world.'); is the value the CSP spec prints", async () => {
  // The CSP Level 2/3 hash-source example: <script>alert('Hello, world.');</script>
  // is allowed by script-src 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='.
  assert.equal(await inlineHash("alert('Hello, world.');"), "'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
  const p = parsePolicyList("script-src 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
  assert.equal((await checkInline(p, "script", "alert('Hello, world.');")).allowed, true);
  assert.equal((await checkInline(p, "script", "alert('Hello, world!');")).allowed, false);
});

test("spec: *.example.com matches subdomains but not example.com itself", () => {
  assert.equal(urlMatchesExpression(U("https://cdn.example.com/a.js"), "*.example.com", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://a.b.example.com/a.js"), "*.example.com", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://example.com/a.js"), "*.example.com", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://notexample.com/a.js"), "*.example.com", ORIGIN), false);
});

test("spec: http://host also matches the https:// upgrade, never the downgrade", () => {
  assert.equal(urlMatchesExpression(U("https://cdn.test/a.js"), "http://cdn.test", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("http://cdn.test/a.js"), "https://cdn.test", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("wss://cdn.test/s"), "ws://cdn.test", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://x.test/"), "http:", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("http://x.test/"), "https:", ORIGIN), false);
});

test("spec: a host with no scheme takes the page's scheme (with the same upgrade)", () => {
  assert.equal(urlMatchesExpression(U("https://cdn.test/a.js"), "cdn.test", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("http://cdn.test/a.js"), "cdn.test", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://cdn.test/a.js"), "cdn.test", U("http://example.com/")), true);
});

test("spec path matching: trailing slash is a prefix, no slash is exact, redirects drop paths", () => {
  assert.equal(urlMatchesExpression(U("https://cdn.test/js/app.js"), "cdn.test/js/", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.test/js/lib/x.js"), "cdn.test/js/", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.test/other.js"), "cdn.test/js/", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://cdn.test/js/app.js"), "cdn.test/js/app.js", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.test/js/app.js2"), "cdn.test/js/app.js", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://cdn.test/js/app.js/x"), "cdn.test/js/app.js", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://cdn.test/elsewhere.js"), "cdn.test/js/app.js", ORIGIN, true), true);
  assert.equal(pathPartMatch("/js/%61pp.js", "/js/app.js"), true);
  assert.equal(pathPartMatch("/", ""), true);
});

test("spec ports: none means default only, * means any, a number matches the default when omitted", () => {
  assert.equal(urlMatchesExpression(U("https://cdn.test:8443/a.js"), "cdn.test", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://cdn.test:8443/a.js"), "cdn.test:*", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.test:8443/a.js"), "cdn.test:8443", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.test/a.js"), "https://cdn.test:443", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.test/a.js"), "cdn.test:8443", ORIGIN), false);
});

test("spec: * matches http(s) and the page's own scheme, not data: or blob:", () => {
  assert.equal(urlMatchesExpression(U("https://any.test/a.js"), "*", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("data:text/javascript,alert(1)"), "*", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("blob:https://example.com/123"), "*", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("data:text/javascript,alert(1)"), "data:", ORIGIN), true);
});

test("spec: 'self' is the page origin plus its secure upgrade", () => {
  assert.equal(urlMatchesExpression(U("https://example.com/a.js"), "'self'", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://cdn.example.com/a.js"), "'self'", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("http://example.com/a.js"), "'self'", ORIGIN), false);
  assert.equal(urlMatchesExpression(U("https://example.com/a.js"), "'self'", U("http://example.com/")), true);
  assert.equal(urlMatchesExpression(U("wss://example.com/s"), "'self'", ORIGIN), true);
  assert.equal(urlMatchesExpression(U("https://example.com:444/a.js"), "'self'", ORIGIN), false);
});

// --- Parsing (CSP3 section 2.2.1) ----------------------------------------

test("parse: directive names lowercase, the first duplicate wins, bad names dropped", () => {
  const p = parsePolicy("  Script-Src 'self' ; ;script-src https://evil.test; img-src *; sc!ript x");
  assert.deepEqual(p.directives.get("script-src"), ["'self'"]);
  assert.deepEqual(p.duplicates, ["script-src"]);
  assert.deepEqual(p.invalidNames, ["sc!ript"]);
  assert.deepEqual(p.order, ["script-src", "img-src"]);
});

test("parse: commas split policies, and every policy must allow a load", () => {
  const ps = parsePolicyList("script-src https://a.test https://b.test, script-src https://a.test");
  assert.equal(ps.length, 2);
  assert.equal(checkFetch(ps, "script", "https://a.test/x.js").allowed, true);
  const b = checkFetch(ps, "script", "https://b.test/x.js");
  assert.equal(b.allowed, false);
  assert.deepEqual(b.results.map((r) => r.allowed), [true, false]);
});

test("extract: header line, report-only header and meta tag are recognised", () => {
  assert.deepEqual(extractPolicyText("Content-Security-Policy: default-src 'self'"), { text: "default-src 'self'", delivery: "header", reportOnly: false });
  assert.equal(extractPolicyText("content-security-policy-report-only: a b").reportOnly, true);
  const m = extractPolicyText(`<meta http-equiv="Content-Security-Policy" content="script-src 'self'; frame-ancestors 'none'">`);
  assert.equal(m.delivery, "meta");
  assert.equal(m.text, "script-src 'self'; frame-ancestors 'none'");
});

test("classify: keywords, nonces, hashes, schemes, hosts and junk", () => {
  assert.equal(classifySource("'SELF'").kind, "keyword");
  assert.equal(classifySource("'nonce-r4nd0m+/='").kind, "nonce");
  assert.equal(classifySource("'sha384-abc_-'").alg, "sha384");
  assert.equal(classifySource("data:").scheme, "data");
  assert.deepEqual(classifySource("https://*.cdn.test:8080/js/"), { kind: "host", scheme: "https", host: "*.cdn.test", port: "8080", path: "/js/" });
  assert.equal(classifySource("'unsafe-everything'").kind, "unknown-keyword");
  assert.equal(classifySource("https://a.test:port").kind, "invalid");
});

// --- Fallback chain (CSP3 section 6.8) -----------------------------------

test("fallback: script-src-elem -> script-src -> default-src; worker-src -> child-src -> script-src", () => {
  const p = parsePolicy("default-src 'none'; script-src 'self'; child-src https://w.test");
  assert.equal(effectiveList(p, "script-src-elem").from, "script-src");
  assert.equal(effectiveList(p, "img-src").from, "default-src");
  assert.equal(effectiveList(p, "worker-src").from, "child-src");
  assert.equal(effectiveList(parsePolicy("script-src 'self'"), "worker-src").from, "script-src");
  assert.equal(effectiveList(p, "base-uri"), null, "base-uri never falls back to default-src");
  assert.equal(effectiveList(p, "form-action"), null);
});

test("fetch: default-src 'none' blocks images, an empty list blocks, no directive allows", () => {
  const p = parsePolicyList("default-src 'none'; script-src 'self'");
  assert.equal(checkFetch(p, "image", "https://example.com/a.png").allowed, false);
  assert.equal(checkFetch(p, "script", "/app.js", { origin: "https://example.com/" }).allowed, true);
  assert.equal(checkFetch(parsePolicyList("img-src"), "image", "https://example.com/a.png").allowed, false);
  assert.equal(checkFetch(parsePolicyList("img-src 'self'"), "script", "https://evil.test/a.js").allowed, true);
  assert.equal(checkFetch(parsePolicyList("default-src 'none'"), "form", "https://evil.test/").allowed, true);
});

// --- Scripts: nonce, strict-dynamic, inline, eval -------------------------

test("strict-dynamic ignores the host list; a nonce or a non-parser-inserted script passes", () => {
  const p = parsePolicyList("script-src 'nonce-R4nd0mR4nd0mR4nd0m==' 'strict-dynamic' https: 'unsafe-inline'");
  assert.equal(checkFetch(p, "script", "https://cdn.test/a.js").allowed, false);
  assert.equal(checkFetch(p, "script", "https://cdn.test/a.js", { nonce: "R4nd0mR4nd0mR4nd0m==" }).allowed, true);
  assert.equal(checkFetch(p, "script", "https://cdn.test/a.js", { parserInserted: false }).allowed, true);
  assert.equal(checkFetch(p, "script", "https://cdn.test/a.js", { nonce: "wrong" }).allowed, false);
});

test("inline: 'unsafe-inline' runs everything until a nonce or hash is added", async () => {
  assert.equal((await checkInline(parsePolicyList("script-src 'unsafe-inline'"), "script", "x()")).allowed, true);
  const withNonce = parsePolicyList("script-src 'unsafe-inline' 'nonce-abcdefghijklmnopqrstuv'");
  const r = await checkInline(withNonce, "script", "x()");
  assert.equal(r.allowed, false);
  assert.match(r.results[0].why, /ignored/);
  assert.equal((await checkInline(withNonce, "script", "x()", { nonce: "abcdefghijklmnopqrstuv" })).allowed, true);
  assert.equal((await checkInline(parsePolicyList("default-src 'self'"), "script", "x()")).allowed, false);
});

test("inline handlers: a hash matches an onclick only with 'unsafe-hashes'; nonces never do", async () => {
  const h = await inlineHash("doSomething()");
  assert.equal((await checkInline(parsePolicyList(`script-src ${h}`), "handler", "doSomething()")).allowed, false);
  assert.equal((await checkInline(parsePolicyList(`script-src 'unsafe-hashes' ${h}`), "handler", "doSomething()")).allowed, true);
  assert.equal((await checkInline(parsePolicyList(`script-src 'nonce-abcdefghijklmnopqrstuv'`), "handler", "x()", { nonce: "abcdefghijklmnopqrstuv" })).allowed, false);
});

test("hashes compare base64url and base64 as the same value", async () => {
  const h = (await inlineHash("alert('Hello, world.');")).replace(/\+/g, "-").replace(/\//g, "_");
  assert.equal((await checkInline(parsePolicyList(`script-src ${h}`), "script", "alert('Hello, world.');")).allowed, true);
});

test("eval needs 'unsafe-eval' in script-src or default-src; wasm accepts 'wasm-unsafe-eval'", () => {
  assert.equal(checkEval(parsePolicyList("script-src 'self'")).allowed, false);
  assert.equal(checkEval(parsePolicyList("default-src 'self' 'unsafe-eval'")).allowed, true);
  assert.equal(checkEval(parsePolicyList("script-src 'wasm-unsafe-eval'"), true).allowed, true);
  assert.equal(checkEval(parsePolicyList("script-src 'wasm-unsafe-eval'")).allowed, false);
  assert.equal(checkEval(parsePolicyList("img-src *")).allowed, true);
});

// --- Findings ------------------------------------------------------------

test("lint: the web.dev / CCS 2016 strict policy draws no high or medium findings", () => {
  const r = analyze("script-src 'nonce-q8d1fXo2mZb7J3kVt9rLwA==' 'strict-dynamic' https: 'unsafe-inline'; object-src 'none'; base-uri 'none'");
  assert.deepEqual(r.findings.filter((f) => f.severity === "high" || f.severity === "medium"), []);
  assert.ok(ids(r.findings).includes("unsafe-inline-fallback"));
});

test("lint: unsafe-inline, wildcard, data:, unquoted keyword, http host all flagged high/medium", () => {
  const f = ids(analyze("script-src self 'unsafe-inline' * data: http://cdn.test").findings);
  for (const id of ["unsafe-inline", "unquoted-keyword", "script-wildcard", "script-data", "script-http-host", "no-object-src", "no-base-uri"]) assert.ok(f.includes(id), id);
});

test("lint: strict-dynamic without a nonce blocks every script", () => {
  assert.ok(ids(analyze("script-src 'strict-dynamic' https:").findings).includes("strict-dynamic-no-nonce"));
});

test("lint: no script-src at all is the top finding; empty input says so", () => {
  const r = analyze("img-src 'self'");
  assert.equal(r.findings[0].id, "no-script-src");
  assert.equal(analyze("   ").findings[0].id, "empty");
});

test("lint: typos, duplicates, deprecated names, meta-only limits, short nonces", () => {
  const f = analyze(`<meta http-equiv="Content-Security-Policy" content="scirpt-src 'self'; default-src 'self'; default-src *; frame-ancestors 'none'; plugin-types application/pdf; script-src 'nonce-abc'">`).findings;
  const byId = Object.fromEntries(f.map((x) => [x.id, x]));
  assert.match(byId["unknown-directive"].message, /Did you mean script-src\?/);
  assert.ok(byId["duplicate"]);
  assert.ok(byId["meta-ignored"]);
  assert.ok(byId["deprecated"]);
  assert.ok(byId["short-nonce"]);
  assert.ok(!byId["no-frame-ancestors"], "meta policies cannot set frame-ancestors, so do not advise it there");
});

test("lint: report-only is said first in plain terms; 'none' mixed with sources noted", () => {
  const r = analyze("Content-Security-Policy-Report-Only: default-src 'none' 'self'; script-src 'self'; object-src 'none'; base-uri 'self'");
  assert.ok(ids(r.findings).includes("report-only"));
  assert.ok(ids(r.findings).includes("none-with-others"));
});

test("summary is an observation, not a verdict of safety", () => {
  assert.match(summary([]), /No findings of the kinds this tool checks/);
  assert.match(summary([{ severity: "high" }]), /1 high-severity finding:/);
});

test("a hash, like a nonce, switches 'unsafe-inline' off for other inline scripts", async () => {
  const p = parsePolicyList("script-src 'unsafe-inline' 'sha256-qznLcsROx4GACP2dm0UCKCzCG+HiZ1guq6ZZDob/Tng='");
  assert.equal((await checkInline(p, "script", "injected()")).allowed, false);
  assert.equal((await checkInline(p, "script", "alert('Hello, world.');")).allowed, true);
  assert.ok(!ids(lint(p)).includes("unsafe-inline"));
});

test("names that are Object.prototype keys are not mistaken for directives or types", () => {
  assert.ok(ids(analyze("constructor 'self'; toString x; script-src 'self'").findings).filter((i) => i === "unknown-directive").length === 2);
  assert.throws(() => checkFetch(parsePolicyList("script-src 'self'"), "constructor", "https://a.test/"), /unknown resource type/);
});

test("missing base-uri is medium where scripts run, low where the script list is only 'none'", () => {
  const sev = (pol) => analyze(pol).findings.find((f) => f.id === "no-base-uri").severity;
  assert.equal(sev("default-src 'none'; style-src 'unsafe-inline'"), "low");
  assert.equal(sev("default-src 'none'; script-src 'self'"), "medium");
  assert.equal(sev("script-src 'nonce-q8d1fXo2mZb7J3kVt9rLwA==' 'strict-dynamic'"), "medium");
});
