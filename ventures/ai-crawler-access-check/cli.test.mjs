import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const ROBOTS = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nAllow: /\n";
const LLMS = "# Example\n\n> Summary\n\n## Docs\n\n[a](https://example.test/a)\n";

function stubFetch(map) {
  return async (url) => {
    for (const [suffix, text] of Object.entries(map)) {
      if (url.endsWith(suffix)) return { text, status: 200, found: text !== null };
    }
    return { text: "", status: 404, found: false };
  };
}

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("no domain and no --robots-file exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("audits a fetched domain and reports bot statuses", async () => {
  const fetchTextImpl = stubFetch({ "/robots.txt": ROBOTS, "/llms.txt": LLMS });
  const { exitCode, output } = await run(["example.test"], { fetchTextImpl });
  assert.equal(exitCode, 0);
  assert.match(output, /Auditing https:\/\/example\.test/);
  assert.match(output, /GPTBot.*blocked/s);
  assert.match(output, /llms\.txt: structurally valid/);
});

test("--json emits machine-readable output", async () => {
  const fetchTextImpl = stubFetch({ "/robots.txt": ROBOTS, "/llms.txt": null });
  const { exitCode, output } = await run(["example.test", "--json"], { fetchTextImpl });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.origin, "https://example.test");
  assert.ok(Array.isArray(parsed.bots));
  assert.equal(parsed.llmsTxt, null);
});

test("reads robots/llms from local files instead of the network", async () => {
  const files = { "./r.txt": ROBOTS, "./l.txt": LLMS };
  const readFile = async (p) => {
    if (!(p in files)) throw new Error(`unexpected read of ${p}`);
    return files[p];
  };
  const { exitCode, output } = await run(["--robots-file", "./r.txt", "--llms-file", "./l.txt"], { readFile });
  assert.equal(exitCode, 0);
  assert.match(output, /Auditing local files/);
  assert.match(output, /llms\.txt: structurally valid/);
});

test("--fail-if-blocked exits 1 when the named bot is blocked", async () => {
  const fetchTextImpl = stubFetch({ "/robots.txt": ROBOTS, "/llms.txt": null });
  const { exitCode, output } = await run(["example.test", "--fail-if-blocked", "GPTBot"], { fetchTextImpl });
  assert.equal(exitCode, 1);
  assert.match(output, /GATE: GPTBot is blocked/);
});

test("--fail-if-blocked passes when the named bot is allowed", async () => {
  const fetchTextImpl = stubFetch({ "/robots.txt": ROBOTS, "/llms.txt": null });
  const { exitCode } = await run(["example.test", "--fail-if-blocked", "ClaudeBot"], { fetchTextImpl });
  assert.equal(exitCode, 0);
});

test("--fail-if-allowed exits 1 when the named bot is allowed", async () => {
  const fetchTextImpl = stubFetch({ "/robots.txt": ROBOTS, "/llms.txt": null });
  const { exitCode, output } = await run(["example.test", "--fail-if-allowed", "ClaudeBot"], { fetchTextImpl });
  assert.equal(exitCode, 1);
  assert.match(output, /GATE: ClaudeBot is allowed/);
});

test("unknown bot token in a gate flag exits 2", async () => {
  const fetchTextImpl = stubFetch({ "/robots.txt": ROBOTS, "/llms.txt": null });
  const { exitCode, output } = await run(["example.test", "--fail-if-blocked", "NotARealBot"], { fetchTextImpl });
  assert.equal(exitCode, 2);
  assert.match(output, /unknown bot token/);
});

test("missing robots.txt is treated as allow-everything, not an error", async () => {
  const fetchTextImpl = stubFetch({ "/llms.txt": null });
  const { exitCode, output } = await run(["example.test"], { fetchTextImpl });
  assert.equal(exitCode, 0);
  assert.match(output, /No robots\.txt found/);
  assert.match(output, /GPTBot.*allowed/s);
});

test("table columns widen to fit the longest operator and token names", async () => {
  const { output } = await run(["--robots-file", new URL("./robots.txt", import.meta.url).pathname]);
  const rows = output.split("\n").filter((l) => /Common Crawl Foundation|Google-CloudVertexBot/.test(l));
  assert.equal(rows.length, 2);
  for (const r of rows) assert.match(r, /\S {2,}\S/);
});
