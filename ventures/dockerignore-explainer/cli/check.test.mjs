import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { main } from "./check.mjs";

const sink = () => {
  const s = { text: "", write: (t) => (s.text += t) };
  return s;
};

function ctx(files) {
  const d = mkdtempSync(join(tmpdir(), "dockerignore-cli-"));
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, ".."), { recursive: true });
    writeFileSync(join(d, p), body);
  }
  return d;
}

test("reports a COPY source the rules exclude, and --strict exits 1", () => {
  const d = ctx({ ".dockerignore": "config\n", Dockerfile: "FROM x\nCOPY config/app.yml /app/\n", "config/app.yml": "a: 1\n", ".env": "X=1\n" });
  try {
    const out = sink();
    assert.equal(main([d], out, sink()), 0);
    assert.match(out.text, /\[high\] COPY config\/app\.yml is excluded/);
    assert.equal(main([d, "--strict"], sink(), sink()), 1);
    const fixed = sink();
    main([d, "--fixed"], fixed, sink());
    assert.match(fixed.text, /^!config\/app\.yml$/m);
    const js = sink();
    main([d, "--json"], js, sink());
    assert.ok(JSON.parse(js.text).findings.length >= 2);
    const w = sink();
    main([d, "--why", "config/app.yml"], w, sink());
    assert.match(w.text, /config\/: not sent/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("reads <Dockerfile>.dockerignore before .dockerignore, like BuildKit", () => {
  const d = ctx({ ".dockerignore": "", "app.Dockerfile": "FROM x\nCOPY a /\n", "app.Dockerfile.dockerignore": "a\n", a: "1" });
  try {
    const out = sink();
    main([d, "-f", join(d, "app.Dockerfile")], out, sink());
    assert.match(out.text, /app\.Dockerfile\.dockerignore/);
    assert.match(out.text, /COPY a is excluded/);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test("bad usage exits 2", () => {
  assert.equal(main(["--nope"], sink(), sink()), 2);
  assert.equal(main(["/no/such/dir/at/all"], sink(), sink()), 2);
});
