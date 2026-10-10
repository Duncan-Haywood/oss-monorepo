import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleText } from "./calc.mjs";

const cli = new URL("./cli.mjs", import.meta.url).pathname;
const tmp = (name, body) => { const f = join(mkdtempSync(join(tmpdir(), "iam-")), name); writeFileSync(f, body); return f; };

test("cli exits 1 with findings on the sample, 0 on a tight policy, 2 on junk", () => {
  const r = spawnSync("node", [cli, tmp("p.json", sampleText())], { encoding: "utf8" });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /\[CRITICAL\]/);
  const ok = tmp("ok.json", JSON.stringify({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" }] }));
  assert.equal(spawnSync("node", [cli, ok], { encoding: "utf8" }).status, 0);
  assert.equal(spawnSync("node", [cli, tmp("bad.json", "nope")], { encoding: "utf8" }).status, 2);
});
