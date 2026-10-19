import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
const copied = () => read("./Dockerfile").match(/^COPY (.+) \/usr\/share\/nginx\/html\/$/m)[1].split(/\s+/);

test("the Dockerfile copies every module and page the site loads", () => {
  const pages = fs.readdirSync(new URL(".", import.meta.url)).filter((n) => n.endsWith(".html"));
  const files = copied();
  const globToRe = (g) => new RegExp("^" + g.replace(/[.]/g, "\\.").replace(/\*/g, ".*") + "$");
  const inImage = (f) => files.some((c) => globToRe(c).test(f));
  for (const p of pages) {
    assert.ok(inImage(p), `${p} would not be in the image`);
    for (const m of read("./" + p).matchAll(/from\s+'\.\/([\w.-]+\.mjs)'/g)) {
      assert.ok(inImage(m[1]), `${m[1]} is imported by ${p} but not copied into the image`);
    }
  }
});

test("deploy files serve statically, name no owner account and keep .mjs a JavaScript type", () => {
  assert.match(read("./fly.toml"), /internal_port = 80/);
  assert.match(read("./render.yaml"), /runtime: static/);
  assert.match(read("./Dockerfile"), /text\/javascript mjs/);
  assert.doesNotMatch(read("./render.yaml") + read("./fly.toml") + read("./docker-compose.yml"), /duncan/i);
});
