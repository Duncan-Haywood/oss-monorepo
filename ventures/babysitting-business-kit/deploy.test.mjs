import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the Dockerfile copies every file the server imports or serves", () => {
  const server = read("./server.mjs");
  const imports = [...server.matchAll(/from "\.\/([\w.-]+)"/g)].map((m) => m[1]);
  const served = [...new Set([...server.matchAll(/"(\w[\w.-]+\.(?:html|mjs))"/g)].map((m) => m[1]))];
  const copied = read("./Dockerfile").match(/^COPY (.+) \.\/$/m)[1].split(/\s+/);
  for (const f of [...imports, ...served]) assert.ok(copied.includes(f), `${f} is needed but not copied into the image`);
});

test("render.yaml generates the secrets, keeps state on a disk and ships with automation off", () => {
  const t = read("./render.yaml");
  assert.match(t, /key: ADMIN_KEY\s+generateValue: true/);
  assert.match(t, /key: CAL_TOKEN\s+generateValue: true/);
  assert.match(t, /disk:/);
  assert.match(t, /key: AUTO_REPLY\s+value: "0"/);
  assert.match(t, /key: AUTO_FOLLOW_UP\s+value: "0"/);
  assert.doesNotMatch(t, /duncan/i);
});
