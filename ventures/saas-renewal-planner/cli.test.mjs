import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { run } from "./cli.mjs";

const csv = readFileSync(new URL("./fixtures/renewals.csv", import.meta.url), "utf8");
const io = { readFile: async (f) => { if (f === "missing.csv") throw new Error("ENOENT"); return csv; } };

test("plan prints the ranked list", async () => {
  const r = await run(["plan", "r.csv", "--as-of", "2026-10-02"], io);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /1\. Salesforce \[urgent\] notice by 2026-10-16/);
  assert.match(r.output, /\$228,600\.00 a year/);
});

test("plan --json round-trips", async () => {
  const r = await run(["plan", "r.csv", "--as-of", "2026-10-02", "--json"], io);
  assert.equal(JSON.parse(r.output).rows[0].vendor, "Salesforce");
});

test("email and ics subcommands", async () => {
  const e = await run(["email", "r.csv", "--as-of", "2026-10-02", "--vendor", "slack"], io);
  assert.match(e.output, /Subject: Slack renewal on 2026-11-30/);
  assert.match((await run(["ics", "r.csv", "--as-of", "2026-10-02"], io)).output, /BEGIN:VCALENDAR/);
});

test("errors exit 2 with usage", async () => {
  for (const argv of [["plan"], ["plan", "missing.csv"], ["bogus", "r.csv"], ["plan", "r.csv", "--nope"], ["email", "r.csv"], ["email", "r.csv", "--vendor", "Zzz"], ["plan", "r.csv", "--ask", "99"], ["plan", "r.csv", "--ask"]]) {
    const r = await run(argv, io);
    assert.equal(r.exitCode, 2, argv.join(" "));
  }
});
