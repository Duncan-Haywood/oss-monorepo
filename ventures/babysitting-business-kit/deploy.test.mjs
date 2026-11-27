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

test("every variable the server reads is documented in the README", () => {
  const code = ["./server.mjs", "./backup.mjs", "./automations-server.mjs", "./content.mjs", "./byok.mjs", "./network-server.mjs"].map(read).join("\n");
  const used = new Set([...code.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
  const readme = read("./README.md");
  for (const k of used) if (!/^(RENDER_GIT_COMMIT|FLY_IMAGE_REF|APP_COMMIT)$/.test(k)) assert.ok(readme.includes(`\`${k}\``), `${k} is read by the server but missing from the README`);
});

test("the admin page carries the clauses and stays out of search; no self-host guide is offered", () => {
  const t = read("./admin.html");
  assert.match(t, /No warranty/);
  assert.match(t, /not legal, tax, or financial advice/i);
  assert.match(t, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(t, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(read("./sitemap.xml"), /admin\.html|self-host/);
  for (const f of ["./llms.txt", "./index.html", "./admin.html", "./README.md"]) assert.doesNotMatch(read(f), /self-host\.html|render\.yaml|fly\.toml|docker-compose/, f);
  for (const f of ["./self-host.html", "./render.yaml", "./fly.toml", "./docker-compose.yml"]) assert.equal(fs.existsSync(new URL(f, import.meta.url)), false, f);
});
