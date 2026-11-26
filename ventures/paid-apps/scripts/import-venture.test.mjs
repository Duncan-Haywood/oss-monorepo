import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  importVenture,
  licenceText,
  listFiles,
  parseArgs,
  thirdPartyLicences,
} from "./import-venture.mjs";

const MIT = "MIT License\n\nCopyright (c) 2026 Duncan Haywood\n\nPermission is hereby granted...\n";

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "import-venture-"));
  const oss = path.join(base, "oss");
  const v = path.join(oss, "ventures", "demo-tool");
  fs.mkdirSync(path.join(v, "vendor", "lib"), { recursive: true });
  fs.mkdirSync(path.join(v, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(v, "LICENSE"), MIT);
  fs.writeFileSync(path.join(v, "engine.mjs"), "export const x = 1;\n");
  fs.writeFileSync(path.join(v, "vendor", "lib", "LICENSE-lib"), "BSD\n");
  fs.writeFileSync(path.join(v, "node_modules", "x", "index.js"), "junk\n");
  fs.mkdirSync(path.join(oss, "portfolio", "monetization"), { recursive: true });
  fs.writeFileSync(
    path.join(oss, "portfolio", "monetization", "transition.json"),
    JSON.stringify({ proprietary: [{ venture: "demo-tool", model: "one-off" }] }),
  );
  const g = (/** @type {string[]} */ a) =>
    execFileSync("git", ["-C", oss, ...a], { stdio: "pipe" });
  g(["init", "-q"]);
  g(["add", "-A"]);
  g(["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "-m", "init"]);
  const priv = path.join(base, "priv");
  fs.mkdirSync(path.join(priv, "apps"), { recursive: true });
  return { oss, priv, v };
}

test("parseArgs needs a slug and --from", () => {
  assert.throws(() => parseArgs([]));
  assert.throws(() => parseArgs(["demo"]));
  assert.throws(() => parseArgs(["../evil", "--from", "x"]));
  assert.throws(() => parseArgs(["demo", "--from", "x", "--model", "free"]));
  assert.deepEqual(parseArgs(["demo", "--from", "x", "--dry-run"]), {
    slug: "demo",
    from: "x",
    model: "",
    dryRun: true,
  });
});

test("listFiles skips dependencies and build output", () => {
  const { v } = fixture();
  assert.deepEqual(listFiles(v), ["LICENSE", "engine.mjs", "vendor/lib/LICENSE-lib"]);
});

test("only nested licence files count as third party", () => {
  assert.deepEqual(
    thirdPartyLicences(["LICENSE", "a/LICENSE.md", "b/COPYING", "c/licence-x.mjs"]),
    ["a/LICENSE.md", "b/COPYING"],
  );
});

test("import copies the tree, keeps the MIT baseline and records provenance", () => {
  const { oss, priv } = fixture();
  const s = importVenture({ slug: "demo-tool", from: oss, model: "", dryRun: false }, priv);
  const app = path.join(priv, "apps", "demo-tool");
  assert.equal(s.model, "one-off");
  assert.deepEqual(s.licences, ["vendor/lib/LICENSE-lib"]);
  assert.ok(fs.existsSync(path.join(app, "engine.mjs")));
  assert.ok(!fs.existsSync(path.join(app, "node_modules")));
  const lic = fs.readFileSync(path.join(app, "LICENSE"), "utf8");
  assert.match(lic, /stays\s+available under it/);
  assert.match(lic, /All rights reserved/);
  assert.match(lic, /Permission is hereby granted/);
  const prov = fs.readFileSync(path.join(app, "PROVENANCE.md"), "utf8");
  assert.match(prov, new RegExp(s.commit));
  assert.match(prov, new RegExp(s.tree));
  assert.match(prov, /vendor\/lib\/LICENSE-lib/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(app, "biome.json"), "utf8")).root, false);
});

test("import refuses to overwrite, and refuses a dirty source", () => {
  const { oss, priv, v } = fixture();
  const opts = { slug: "demo-tool", from: oss, model: "", dryRun: false };
  fs.writeFileSync(path.join(v, "engine.mjs"), "changed\n");
  assert.throws(() => importVenture(opts, priv), /uncommitted/);
  execFileSync("git", ["-C", oss, "checkout", "--", "."]);
  importVenture(opts, priv);
  assert.throws(() => importVenture(opts, priv), /already exists/);
});

test("dry run writes nothing", () => {
  const { oss, priv } = fixture();
  importVenture({ slug: "demo-tool", from: oss, model: "", dryRun: true }, priv);
  assert.ok(!fs.existsSync(path.join(priv, "apps", "demo-tool")));
});

test("licence text names the commit", () => {
  assert.match(
    licenceText({ slug: "s", commit: "abc", date: "2026-11-24", mitNotice: MIT }),
    /commit abc/,
  );
});
