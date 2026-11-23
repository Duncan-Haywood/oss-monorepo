import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, EXAMPLE, globToRegExp } from "./engine.mjs";

const BS = '[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n\n';
const GOOD = `${BS}[project]
name = "acme-widgets"
version = "1.4.0"
description = "Widgets for Acme."
readme = "README.md"
requires-python = ">=3.9"
license = "MIT"
license-files = ["LICEN[CS]E*"]
authors = [{ name = "Ada Lovelace", email = "ada@example.org" }]
classifiers = ["Programming Language :: Python :: 3.12", "Topic :: Software Development :: Libraries"]
dependencies = ["requests>=2.31", "pywin32>=306; sys_platform == 'win32'"]

[project.optional-dependencies]
docs = ["sphinx>=7"]

[project.urls]
Homepage = "https://acme.example.org"

[project.scripts]
acme = "acme_widgets.cli:main"

[dependency-groups]
test = ["pytest>=8"]
dev = [{ include-group = "test" }, "ruff"]
`;
const FILES = ["pyproject.toml", "README.md", "LICENSE", "acme_widgets/__init__.py"];
const ids = (r, sev) => r.findings.filter((f) => !sev || sev.includes(f.severity)).map((f) => f.id);
const project = (extra, bs = BS) => `${bs}[project]\nname = "demo"\nversion = "1.0"\ndescription = "Demo."\nreadme = "README.md"\nrequires-python = ">=3.9"\nlicense = "MIT"\n${extra}`;
const one = (extra, opts) => analyze(project(extra), opts ?? { files: ["README.md", "LICENSE"] });

test("a well-formed pyproject has no findings above info", () => {
  const r = analyze(GOOD, { files: FILES });
  assert.deepEqual(ids(r, ["high", "medium", "low"]), []);
  assert.equal(r.ok, true);
  assert.equal(r.summary.name, "acme-widgets");
  assert.deepEqual(r.summary.extras, ["docs"]);
  assert.match(r.metadata.text, /^Requires-Dist: sphinx>=7; extra == "docs"$/m);
  assert.match(r.metadata.text, /^License-Expression: MIT$/m);
  assert.match(r.metadata.text, /^Author-email: Ada Lovelace <ada@example.org>$/m);
});

test("the example shows each headline problem with its line", () => {
  const r = analyze(EXAMPLE, { files: ["README.md", "LICENSE"] });
  const byId = Object.fromEntries(r.findings.map((f) => [f.id, f]));
  for (const id of ["backend-not-required", "license-expression-invalid", "classifier-unknown", "dependency-invalid", "dependency-direct-url", "unknown-project-key", "script-no-callable", "readme-missing", "requires-python-cap", "marker-value", "authors-comma", "authors-email", "version-not-normalized", "extra-not-normalized", "classifier-below-requires-python", "description-multiline"]) assert.ok(byId[id], id);
  assert.equal(byId["backend-not-required"].line, 3);
  assert.equal(byId["unknown-project-key"].line, 24);
  assert.equal(byId["script-no-callable"].line, 30);
  assert.match(byId["license-expression-invalid"].fix, /license = "MIT"/);
  assert.match(byId["unknown-project-key"].message, /\[project\.urls\]/);
  assert.match(byId["marker-value"].fix, /"win32"/);
  assert.match(byId["dependency-invalid"].message, /Poetry's caret/);
  assert.equal(r.ok, false);
});

test("TOML errors stop with the line", () => {
  const r = analyze('[project]\nname = "a"\nname = "b"\n');
  assert.equal(r.findings[0].id, "toml-syntax");
  assert.equal(r.findings[0].line, 3);
  assert.equal(analyze("[project\n").findings[0].id, "toml-syntax");
});

test("build-system rules", () => {
  assert.ok(ids(analyze('[project]\nname="a"\nversion="1"\n')).includes("no-build-system"));
  assert.ok(ids(analyze('[build-system]\nbuild-backend = "hatchling.build"\n[project]\nname="a"\nversion="1"\n')).includes("build-requires-missing"));
  assert.ok(ids(analyze('[build-system]\nrequires = ["poetry"]\nbuild-backend = "poetry.masonry.api"\n[project]\nname="a"\nversion="1"\n')).includes("poetry-full-backend"));
  assert.ok(!ids(analyze('[build-system]\nrequires = ["setuptools>=61", "wheel"]\nbuild-backend = "setuptools.build_meta"\n[project]\nname="a"\nversion="1"\n')).includes("backend-not-required"));
  assert.ok(ids(analyze('[build-system]\nrequires = ["setuptools"]\nbuild-backend = "hatchling.build"\n[tool.poetry.dependencies]\npython = "^3.9"\nrequests = "^2"\n[project]\nname="a"\nversion="1"\n')).includes("poetry-deps-ignored"));
});

test("files without [project]: tool config, Poetry 1, setup.py projects", () => {
  assert.deepEqual(analyze("[tool.ruff]\nline-length = 100\n").findings.map((f) => [f.id, f.severity]), [["no-project", "info"]]);
  assert.ok(ids(analyze('[tool.poetry]\nname = "a"\n')).includes("poetry-legacy-metadata"));
  const sp = '[build-system]\nrequires = ["setuptools"]\nbuild-backend = "setuptools.build_meta"\n';
  assert.equal(analyze(sp, { files: ["setup.py"] }).findings[0].severity, "info");
  assert.equal(analyze(sp, { files: ["README.md"] }).findings[0].severity, "high");
});

test("name, version and dynamic", () => {
  assert.ok(ids(analyze(`${BS}[project]\nversion = "1"\n`)).includes("name-missing"));
  assert.ok(ids(analyze(`${BS}[project]\nname = "-bad"\nversion = "1"\n`)).includes("name-invalid"));
  assert.ok(ids(analyze(`${BS}[project]\nname = "a"\n`)).includes("version-missing"));
  assert.ok(!ids(analyze(`${BS}[project]\nname = "a"\ndynamic = ["version"]\n`)).includes("version-missing"));
  assert.ok(ids(analyze(`${BS}[project]\nname = "a"\nversion = "1.0+local"\n`)).includes("version-local"));
  assert.ok(ids(analyze(`${BS}[project]\nname = "a"\nversion = "one"\n`)).includes("version-invalid"));
  const r = analyze(`${BS}[project]\nname = "a"\nversion = "1"\ndynamic = ["version", "name", "nope"]\n`);
  for (const id of ["dynamic-and-static", "dynamic-name", "dynamic-unknown"]) assert.ok(ids(r).includes(id), id);
});

test("readme rules", () => {
  assert.ok(ids(analyze(project("").replace('readme = "README.md"', 'readme = { file = "README.md" }'), { files: ["README.md"] })).includes("readme-content-type-missing"));
  assert.ok(ids(analyze(project("").replace('readme = "README.md"', 'readme = { file = "README.md", content-type = "markdown" }'))).includes("readme-content-type"));
  assert.ok(ids(analyze(project("").replace('readme = "README.md"', 'readme = { file = "a.md", text = "x", content-type = "text/markdown" }'))).includes("readme-file-and-text"));
  assert.ok(ids(analyze(project(""), { files: ["readme.md"] })).includes("readme-missing"));
  assert.ok(!ids(analyze(project(""))).includes("readme-missing"), "no file list, no file check");
});

test("requires-python", () => {
  const rp = (v) => ids(analyze(project("").replace('">=3.9"', JSON.stringify(v))));
  assert.ok(rp("^3.9").includes("requires-python-invalid"));
  assert.ok(rp(">=3.9,<3.13").includes("requires-python-cap"));
  assert.ok(rp("~=3.9").includes("requires-python-compatible"));
  assert.ok(rp("!=3.0.*").includes("requires-python-no-lower"));
  assert.deepEqual(rp(">=3.9").filter((i) => i.startsWith("requires")), []);
});

test("license rules (PEP 639), with the backend deciding the classifier conflict's severity", () => {
  const lic = (v, extra = "", bs = BS) => analyze(project(extra, bs).replace('license = "MIT"', v), { files: ["README.md", "LICENSE"] });
  assert.ok(ids(lic('license = "MIT License"')).includes("license-expression-invalid"));
  assert.ok(ids(lic('license = "mit"')).includes("license-not-canonical"));
  assert.ok(ids(lic('license = "GPL-3.0"')).includes("license-deprecated-id"));
  assert.ok(ids(lic('license = { text = "MIT" }')).includes("license-table-deprecated"));
  assert.ok(ids(lic('license = { text = "MIT" }\nlicense-files = ["LICENSE"]')).includes("license-files-with-table"));
  assert.ok(ids(lic('license = "MIT"\nlicense-files = ["COPYING*"]')).includes("license-files-no-match"));
  assert.ok(ids(lic('license = "MIT"\nlicense-files = ["../LICENSE"]')).includes("license-files-path"));
  const cls = 'classifiers = ["License :: OSI Approved :: MIT License"]\n';
  assert.equal(lic('license = "MIT"', cls).findings.find((f) => f.id === "license-classifier-conflict").severity, "medium");
  const st = '[build-system]\nrequires = ["setuptools>=77"]\nbuild-backend = "setuptools.build_meta"\n\n';
  assert.equal(lic('license = "MIT"', cls, st).findings.find((f) => f.id === "license-classifier-conflict").severity, "high");
  assert.ok(ids(lic("", cls)).includes("license-classifier-only"));
  assert.ok(ids(lic("")).includes("no-license"));
});

test("classifiers: unknown, deprecated, private, Python versions", () => {
  const r = one('classifiers = ["Topic :: Nope", "programming language :: python :: 3", "Private :: Do Not Upload", "Programming Language :: Python :: 3.8"]\n');
  assert.ok(ids(r).includes("classifier-unknown"));
  assert.ok(r.findings.some((f) => f.id === "classifier-unknown" && /Did you mean "Programming Language :: Python :: 3"/.test(f.message)));
  assert.ok(ids(r).includes("classifier-private"));
  assert.ok(ids(r).includes("classifier-below-requires-python"));
});

test("dependencies: syntax, direct URLs, markers, extras, duplicates, pins", () => {
  const r = one('dependencies = ["requests ^2", "flask = 3", "x @ https://e.org/x.whl", "pywin32; platform_system == \'windows\'", "pytest; extra == \'test\'", "a>=1", "a>=2", "demo", "b; python_version < \'3.8.1\'"]\n');
  for (const id of ["dependency-invalid", "dependency-direct-url", "marker-value", "dependency-extra-marker", "dependency-duplicate", "dependency-self", "marker-python-version"]) assert.ok(ids(r).includes(id), id);
  assert.ok(ids(one('dependencies = ["a==1", "b==2", "c==3"]\n')).includes("dependencies-all-pinned"));
  const ex = one('[project.optional-dependencies]\nDev_Tools = ["pytest"]\ndev-tools = ["ruff"]\n"bad extra" = []\nall = ["demo[docs]"]\n');
  for (const id of ["extra-collision", "extra-invalid", "extra-self-unknown"]) assert.ok(ids(ex).includes(id), id);
});

test("scripts and entry points", () => {
  const r = one('[project.scripts]\na = "pkg.cli"\nb = "pkg/cli.py"\nc = "pkg.cli:main"\n[project.entry-points.console_scripts]\nd = "pkg:main"\n');
  for (const id of ["script-no-callable", "script-invalid", "entry-points-scripts"]) assert.ok(ids(r).includes(id), id);
  assert.equal(r.findings.filter((f) => f.id.startsWith("script")).length, 2);
});

test("unknown keys get a suggestion", () => {
  const r = one('python_requires = ">=3.9"\nauthor = "Ada"\n');
  assert.match(r.findings.find((f) => f.path === "project.python_requires").message, /requires-python/);
  assert.match(r.findings.find((f) => f.path === "project.author").message, /authors/);
  assert.ok(ids(analyze('[projects]\nname = "a"\n')).includes("unknown-top-level"));
});

test("dependency groups (PEP 735): includes, cycles, collisions", () => {
  const r = analyze('[dependency-groups]\na = [{ include-group = "b" }]\nb = [{ include-group = "a" }]\nc = [{ include-group = "nope" }, "bad ^1"]\nC = []\n');
  for (const id of ["group-cycle", "group-include-unknown", "group-requirement-invalid", "group-collision"]) assert.ok(ids(r).includes(id), id);
});

test("flit_core needs a description", () => {
  const flit = '[build-system]\nrequires = ["flit_core>=3.4"]\nbuild-backend = "flit_core.buildapi"\n[project]\nname = "a"\nversion = "1"\n';
  assert.ok(ids(analyze(flit)).includes("flit-description"));
  assert.ok(!ids(analyze(flit + 'dynamic = ["description"]\n')).includes("flit-description"));
});

test("PEP 639 globs", () => {
  assert.ok(globToRegExp("LICEN[CS]E*").test("LICENSE.txt"));
  assert.ok(globToRegExp("licenses/**/*.txt").test("licenses/a/b/MIT.txt"));
  assert.ok(globToRegExp("licenses/**/*.txt").test("licenses/MIT.txt"));
  assert.ok(!globToRegExp("*.txt").test("a/b.txt"));
});

// Each case in eval/backend-claims.json was built with real setuptools, hatchling and
// flit_core (eval/backend_claims.py). This keeps the engine's words in line with what
// they did: a rule that names a backend as refusing must match the recorded result.
test("rule text agrees with the recorded backend behaviour", () => {
  const claims = JSON.parse(readFileSync(new URL("./eval/backend-claims.json", import.meta.url), "utf8"));
  const src = readFileSync(new URL("./engine.mjs", import.meta.url), "utf8");
  for (const [id, by] of Object.entries(claims.cases)) {
    if (id === "control-ok") { for (const b of Object.values(by)) assert.equal(b.result, "ok"); continue; }
    const m = src.match(new RegExp(`"${id}"[^\\n]*`));
    if (!m) continue;
    const line = m[0];
    if (/setuptools, hatchling and flit_core all (refuse|do)/.test(line)) for (const b of Object.values(by)) assert.equal(b.result, "error", id);
    if (/hatchling (drops it silently|accepts it|is silent|and flit_core accept it)/.test(line)) assert.equal(by.hatchling.result, "ok", id);
    if (/setuptools (refuses|and flit_core refuse)/.test(line)) assert.equal(by.setuptools.result, "error", id);
    if (/setuptools (only )?warns/.test(line)) assert.equal(by.setuptools.result, "warning", id);
    if (/setuptools accepts it/.test(line)) assert.equal(by.setuptools.result, "ok", id);
    if (/flit_core (does|refuses|and)/.test(line) || /and flit_core (stop|do\b)/.test(line)) assert.equal(by.flit_core.result, "error", id);
  }
  assert.equal(claims.cases["license-classifier-conflict"].hatchling.result, "ok");
  assert.equal(claims.cases["license-classifier-conflict"].setuptools.result, "error");
});
