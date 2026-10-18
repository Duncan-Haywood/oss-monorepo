import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the Dockerfile copies every module the page imports", () => {
  const html = read("./index.html") + read("./calc.mjs");
  const imports = [...html.matchAll(/(?:from |import\()\s*["']\.\/([\w.-]+\.mjs)["']/g)].map((m) => m[1]);
  const copied = read("./Dockerfile").match(/^COPY (.+) \/usr\/share\/nginx\/html\/$/m)[1].split(/\s+/);
  assert.ok(imports.includes("calc.mjs"));
  for (const f of imports) assert.ok(copied.includes(f), `${f} is imported but not copied into the image`);
});

test("every guide the sitemap lists is covered by the Dockerfile glob or copied by name", () => {
  const copied = read("./Dockerfile").match(/^COPY (.+) \/usr\/share\/nginx\/html\/$/m)[1];
  for (const f of fs.readdirSync(new URL(".", import.meta.url)).filter((n) => n.endsWith(".html") && n !== "index.html")) {
    assert.ok(copied.includes("*.html"), `${f} would not be in the image`);
  }
});

test("deploy files serve statically, name no owner account and keep .mjs a JavaScript type", () => {
  assert.match(read("./fly.toml"), /internal_port = 80/);
  assert.match(read("./render.yaml"), /runtime: static/);
  assert.match(read("./Dockerfile"), /text\/javascript mjs/);
  assert.doesNotMatch(read("./render.yaml") + read("./fly.toml") + read("./docker-compose.yml"), /duncan/i);
});
