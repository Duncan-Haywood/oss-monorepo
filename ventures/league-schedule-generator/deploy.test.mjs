import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the Dockerfile copies every module server.mjs reaches, not only the ones it names", () => {
  // Followed import by import: calc.mjs re-exports feature modules (dates.mjs, schedule.mjs, ...) since
  // 2026-11-23, and an image missing one of them starts and then fails on its first import.
  const copied = read("./Dockerfile").match(/^COPY .+$/gm).flatMap((l) => {
    const [, files, to] = l.match(/^COPY (.+) (\.\/\S*)$/);
    return files.split(/\s+/).map((f) => (to === "./" ? f : to.slice(2) + f.split("/").pop()));
  });
  const seen = new Set();
  const todo = ["server.mjs"];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
    for (const m of read("./" + f).matchAll(/^(?:import|export)\b[^;]*?from "\.\/([\w./-]+)"/gm)) todo.push(dir + m[1]);
  }
  assert.ok(seen.size >= 30, `only ${seen.size} modules reached`);
  for (const f of seen) assert.ok(copied.includes(f), `${f} is reached from server.mjs but not copied into the image`);
});

test("no one-click self-deploy template ships (hosted only since 2026-11-27)", () => {
  for (const f of ["./docker-compose.yml", "./render.yaml", "./fly.toml"]) {
    assert.ok(!fs.existsSync(new URL(f, import.meta.url)), `${f} is back; the league page is not offered for self-hosting`);
  }
});
