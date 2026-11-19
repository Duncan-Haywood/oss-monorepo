import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { run, parseArgs, fromHeaderDump } from "./cli.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const capture = () => { const lines = []; return { lines, out: (s) => lines.push(s) }; };

test("cli: a strict policy exits 0, a weak one exits 1 with HIGH lines", async () => {
  const a = capture();
  assert.equal(await run(["script-src 'nonce-q8d1fXo2mZb7J3kVt9rLwA==' 'strict-dynamic'; object-src 'none'; base-uri 'none'"], a), 0);
  const b = capture();
  assert.equal(await run(["script-src 'self' 'unsafe-inline'"], b), 1);
  assert.match(b.lines.join("\n"), /HIGH {3}script-src: script-src allows every inline script/);
});

test("cli: --test reports ALLOWED/BLOCKED with the reason and sets the exit code", async () => {
  const c = capture();
  const code = await run(["script-src 'self' https://cdn.test; object-src 'none'; base-uri 'none'", "--test", "script", "https://evil.test/x.js"], c);
  assert.equal(code, 1);
  assert.match(c.lines.join("\n"), /BLOCKED {2}script https:\/\/evil.test\/x.js\n {2}https:\/\/evil.test\/x.js matches no source in script-src/);
});

test("cli: --inline prints the hash to add; --json is parseable", async () => {
  const c = capture();
  await run(["script-src 'self'", "--inline", "script", "alert('Hello, world.');", "--json"], c);
  const j = JSON.parse(c.lines.join("\n"));
  assert.equal(j.tests[0].allowed, false);
  assert.match(j.tests[0].results[0].why, /sha256-qznLcsROx4GACP2dm0UCKCzCG\+HiZ1guq6ZZDob\/Tng=/);
});

test("cli: reads a curl -sI header dump from stdin, preferring the enforced header", async () => {
  const dump = "HTTP/2 200\r\ncontent-type: text/html\r\ncontent-security-policy-report-only: default-src *\r\ncontent-security-policy: default-src 'self'\r\n\r\n";
  assert.deepEqual(fromHeaderDump(dump), { text: "default-src 'self'", reportOnly: false, found: true });
  const c = capture();
  await run([], { ...c, stdin: async () => "content-security-policy-report-only: default-src 'self'" });
  assert.match(c.lines.join("\n"), /Report-only/);
});

test("cli: --url reads the response header through the injected fetch", async () => {
  const c = capture();
  const fetchImpl = async () => ({ url: "https://site.test/", headers: new Headers({ "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-eval'" }) });
  await run(["--url", "https://site.test/", "--test", "script", "/app.js"], { ...c, fetchImpl });
  const t = c.lines.join("\n");
  assert.match(t, /'unsafe-eval'/);
  assert.match(t, /ALLOWED {2}script \/app.js/);
});

test("cli: bad arguments exit 2 with usage; --help exits 0", async () => {
  assert.throws(() => parseArgs(["--test", "javascript", "x"]), /--test type/);
  const c = capture();
  assert.equal(await run(["--bogus"], c), 2);
  assert.match(c.lines[0], /unknown option --bogus/);
  assert.equal(await run(["--help"], capture()), 0);
});

test("cli: runs as a real process from another directory", () => {
  const r = spawnSync(process.execPath, [path.join(here, "cli.mjs"), "default-src 'self'; object-src 'none'; base-uri 'none'"], { cwd: "/", encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /No high, medium or low findings/);
});
