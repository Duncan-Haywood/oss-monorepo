import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, repair, render, readMap, splitUrl, sampleFile, sampleBrokenFile, findingsCsv, decodeBuffer, parseCsv } from "./calc.mjs";

const csv = (...pairs) => "Redirect from,Redirect to\n" + pairs.map((p) => p.join(",")).join("\n") + "\n";
const codes = (r) => r.findings.map((f) => f.code);

test("a clean map has no findings", () => {
  const r = validate(sampleFile());
  assert.equal(r.findings.length, 0);
  assert.equal(r.summary.redirects, 6);
});

test("detects a three-page loop and a self-redirect", () => {
  const r = validate(csv(["/a", "/b"], ["/b", "/c"], ["/c", "/a"], ["/x", "/x"]));
  assert.equal(codes(r).filter((c) => c === "loop").length, 3);
  assert.ok(codes(r).includes("self"));
  assert.equal(r.flat.length, 0);
});

test("detects chains, names the path, and flattens to the end", () => {
  const r = validate(csv(["/a", "/b"], ["/b", "/c"], ["/c", "/d"]));
  const chains = r.findings.filter((f) => f.code === "chain");
  assert.equal(chains.length, 2);
  assert.match(chains.find((f) => f.line === 2).detail, /\/a → \/b → \/c → \/d\./);
  assert.deepEqual(r.flat.map((x) => [x.from, x.to]), [["/a", "/d"], ["/b", "/d"], ["/c", "/d"]]);
});

test("conflicting duplicates are errors, identical duplicates are warnings", () => {
  const r = validate(csv(["/a", "/x"], ["/a", "/y"], ["/b", "/z"], ["/b", "/z"]));
  assert.equal(r.findings.find((f) => f.code === "conflict").severity, "error");
  assert.equal(r.findings.find((f) => f.code === "duplicate").severity, "warning");
  assert.equal(r.flat.length, 2);
});

test("case-insensitive by default, exact when asked", () => {
  const input = csv(["/A", "/x"], ["/a", "/y"]);
  assert.ok(codes(validate(input)).includes("conflict"));
  assert.ok(!codes(validate(input, { caseSensitive: true })).includes("conflict"));
});

test("fragment, space, relative, wildcard, empty target and bad host are caught", () => {
  const r = validate(csv(["/f#top", "/x"], ["/a b", "/c"], ["rel", "/c"], ["/old/*", "/new"], ["/nope", ""], ["https://other.com/p", "/q"], ["/ok1", "/y"], ["/ok2", "/y"], ["/ok3", "/y"]), { site: "example.com" });
  for (const c of ["fragment", "space", "relative", "wildcard", "no-target", "other-host"]) assert.ok(codes(r).includes(c), c);
});

test("safe fixes: encode space, add leading slash, drop fragment", () => {
  const out = repair(csv(["/a b", "/c"], ["rel", "/c"], ["/f#top", "/x"]));
  assert.match(out.text, /\/a%20b,\/c/);
  assert.match(out.text, /\/rel,\/c/);
  assert.match(out.text, /\/f,\/x/);
  assert.equal(out.changes.filter((c) => /^Line/.test(c)).length, 3);
});

test("homepage mass-redirect warns once past the share; a few rows are info only", () => {
  const many = Array.from({ length: 20 }, (_, i) => [`/old${i}`, i < 6 ? "/" : `/new${i}`]);
  assert.ok(codes(validate(csv(...many))).includes("homepage"));
  const few = Array.from({ length: 20 }, (_, i) => [`/old${i}`, i < 1 ? "/" : `/new${i}`]);
  assert.ok(!codes(validate(csv(...few))).includes("homepage"));
});

test("status codes: temporary flagged, 410 passes through, junk code warned", () => {
  const r = validate("from,to,status\n/a,/b,302\n/c,/d,301\n/e,,410\n/g,/h,999\n");
  assert.ok(codes(r).includes("temporary"));
  assert.ok(codes(r).includes("bad-code"));
  assert.ok(r.flat.some((x) => x.status === 410 && x.from === "/e"));
});

test("new-site list: a target that is not on the new site is an error; a chain end is what counts", () => {
  const r = validate(csv(["/a", "/b"], ["/b", "/c"], ["/old", "/missing"]), { newUrls: "https://x.com/c\n/other/\n" });
  const miss = r.findings.filter((f) => f.code === "target-missing");
  assert.equal(miss.length, 1);
  assert.match(miss[0].detail, /\/old ends at \/missing/);
});

test("old-site list: uncovered URLs are counted and named", () => {
  const r = validate(csv(["/a", "/b"]), { oldUrls: "https://x.com/a\nhttps://x.com/a/\n/zzz\n/yyy\n" });
  assert.equal(r.summary.uncovered, 2);
  assert.match(r.findings.find((f) => f.code === "uncovered").detail, /\/zzz/);
});

test("absolute same-host targets are normalised so chains still form", () => {
  const r = validate("Redirect from,Redirect to\nhttps://www.example.com/a,https://example.com/b\n/b,/c\n");
  assert.ok(codes(r).includes("chain"));
  assert.equal(r.summary.site, "example.com");
});

test("accepts headers from other tools, space and arrow syntax, semicolons, no header", () => {
  assert.equal(readMap("source_url,target_url,regex,type,code\n/a,/b,0,url,301\n").rows[0].code, "301");
  assert.equal(readMap("/a /b 301\n/c /d\n").rows.length, 2);
  assert.equal(readMap("/a -> /b\n").rows[0].to, "/b");
  const semi = readMap("Redirect from;Redirect to\n/a;/b\n");
  assert.equal(semi.delim, ";");
  assert.equal(validate("Redirect from;Redirect to\n/a;/b\n").findings[0].code, "delimiter");
  assert.equal(readMap("/a,/b\n/c,/d\n").header, false);
});

test("empty and unterminated input never throw", () => {
  assert.equal(validate("").findings[0].code, "empty");
  assert.match(readMap('a,b\n"/x,/y\n').error, /never closed/);
  assert.equal(repair("").error, "The file is empty.");
});

test("render: each format", () => {
  const flat = [{ from: "/a", to: "/b", status: 301 }, { from: "/g", to: "", status: 410 }, { from: "/q\"x", to: "/z", status: 308 }];
  assert.equal(render(flat, "shopify"), "Redirect from,Redirect to\r\n/a,/b\r\n/q\"\"x,/z\r\n".replace('/q""x', '"/q""x"'));
  assert.match(render(flat, "netlify"), /^\/a {2}\/b {2}301!\n\/g {2}\/410\.html {2}410!/);
  assert.match(render(flat, "apache"), /Redirect 301 \/a \/b\nRedirect gone \/g\nRedirect 308/);
  const nginx = render(flat, "nginx");
  assert.match(nginx, /"\/a" "\/b";/);
  assert.match(nginx, /"\/q\\"x" "\/z";/);
  assert.match(nginx, /\$is_gone/);
  assert.match(render(flat, "csv"), /from,to,status/);
});

test("utf-16 and BOM input decode", () => {
  const u16 = new Uint8Array([0xff, 0xfe, ...Buffer.from("from,to\n/a,/b\n", "utf16le")]);
  assert.match(decodeBuffer(u16), /^from,to/);
  assert.ok(validate("﻿from,to\n/a,/b\n").findings.some((f) => f.code === "bom"));
});

test("splitUrl handles hosts, schemes, queries and fragments", () => {
  assert.deepEqual(splitUrl("https://Example.com:443/a?b=1#c"), { host: "example.com", scheme: "https:", path: "/a?b=1", fragment: "#c" });
  assert.equal(splitUrl("example.com/x").path, "/x");
  assert.equal(splitUrl("/p").host, "");
  assert.equal(splitUrl("?q=1").path, "/?q=1");
});

test("a large map resolves quickly", () => {
  const rows = Array.from({ length: 20000 }, (_, i) => [`/p${i}`, `/p${i + 1}`]);
  const t = Date.now();
  const r = validate(csv(...rows));
  assert.ok(Date.now() - t < 5000, "slow");
  assert.equal(r.summary.chains, 19999);
});

test("findings CSV and samples", () => {
  assert.match(findingsCsv(validate(sampleBrokenFile())), /^severity,line,code,title,detail/);
  assert.ok(validate(sampleBrokenFile()).summary.errors >= 6);
  assert.equal(parseCsv('a,"b,c"\n').rows[0].cells[1], "b,c");
});
