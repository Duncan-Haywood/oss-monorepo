// build-browser.mjs makes the in-browser copy of the official check. It runs on a
// deployer's machine and fetches a runtime that then executes in visitors'
// browsers, so the download is pinned by SHA-256 and the rest is tested offline.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SAXON_ZIP_SHA256, findRuleSets, ruleSourceDir, verifyDownload, writeBrowserDir,
} from "./build-browser.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "einvoice-browser-test-"));
const rules = (names) => {
  const dir = tmp();
  for (const n of names) writeFileSync(join(dir, n), `{"rule":"${n}"}`);
  return dir;
};

test("rule source: EINVOICE_SEF_DIR wins, else ./schematron beside the script", () => {
  assert.equal(ruleSourceDir({ EINVOICE_SEF_DIR: "/x/rules" }, "/here"), "/x/rules");
  assert.equal(ruleSourceDir({}, "/here"), join("/here", "schematron"));
});

test("rule sets: both UBL and CII are required, the list comes back sorted", () => {
  assert.deepEqual(findRuleSets(rules(["xrechnung.sef.json", "ubl.sef.json", "cii.sef.json", "notes.txt"])),
    ["cii.sef.json", "ubl.sef.json", "xrechnung.sef.json"]);
  assert.throws(() => findRuleSets(rules(["ubl.sef.json"])), /No compiled rules/);
  assert.throws(() => findRuleSets(rules(["cii.sef.json"])), /No compiled rules/);
  assert.throws(() => findRuleSets(join(tmp(), "missing")), /No compiled rules/);
});

test("download: the pinned hash is accepted, anything else is refused", () => {
  assert.match(SAXON_ZIP_SHA256, /^[0-9a-f]{64}$/);
  const f = join(tmp(), "saxon.zip");
  writeFileSync(f, "not the runtime");
  assert.throws(() => verifyDownload(f), /SHA-256 mismatch/);
  const sha = createHash("sha256").update("not the runtime").digest("hex");
  assert.equal(verifyDownload(f, sha), sha);
});

test("writeBrowserDir: creates nested folders, copies runtime and rules, writes the manifest", () => {
  const src = rules(["ubl.sef.json", "cii.sef.json"]);
  const runtime = tmp();
  writeFileSync(join(runtime, "SaxonJS2.rt.js"), "/* rt */");
  writeFileSync(join(runtime, "LICENSE.txt"), "licence");
  const out = join(tmp(), "deep", "browser");
  const sefs = writeBrowserDir({ src, out, runtimeDir: runtime, sefs: findRuleSets(src) });
  assert.deepEqual(sefs, ["cii.sef.json", "ubl.sef.json"]);
  assert.deepEqual(readdirSync(out).sort(),
    ["LICENSE.txt", "SaxonJS2.rt.js", "cii.sef.json", "manifest.json", "ubl.sef.json"]);
  assert.equal(readFileSync(join(out, "manifest.json"), "utf8"),
    '{\n  "files": [\n    "cii.sef.json",\n    "ubl.sef.json"\n  ]\n}\n');
  assert.equal(readFileSync(join(out, "ubl.sef.json"), "utf8"), '{"rule":"ubl.sef.json"}');
  // An existing folder is fine too (rebuilds overwrite in place).
  mkdirSync(out, { recursive: true });
  writeBrowserDir({ src, out, runtimeDir: runtime, sefs: findRuleSets(src) });
  assert.ok(existsSync(join(out, "manifest.json")));
});

test("importing the module does not run the build", () => {
  // The import above would have thrown (no ./schematron in a fresh checkout) or
  // fetched from saxonica.com if the script still ran at import time.
  assert.equal(typeof writeBrowserDir, "function");
});
