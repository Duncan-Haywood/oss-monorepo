import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the Dockerfile copies every module server.mjs imports", () => {
  const imports = [...read("./server.mjs").matchAll(/from "\.\/([\w.-]+)"/g)].map((m) => m[1]);
  const copied = read("./Dockerfile").match(/^COPY (.+) \.\/$/m)[1].split(/\s+/);
  for (const f of imports) assert.ok(copied.includes(f), `${f} is imported but not copied into the image`);
});

test("every deploy file requires both secrets and keeps state on a disk", () => {
  for (const f of ["./docker-compose.yml", "./render.yaml"]) {
    const t = read(f);
    assert.match(t, /ADMIN_KEY/, f);
    assert.match(t, /LEAGUE_TOKEN/, f);
  }
  assert.match(read("./fly.toml"), /\[mounts\]/);
  assert.match(read("./render.yaml"), /disk:/);
  assert.doesNotMatch(read("./render.yaml") + read("./fly.toml"), /duncan/i);
});
