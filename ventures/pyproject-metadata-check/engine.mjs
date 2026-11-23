// pyproject.toml metadata checker. analyze(text, { files }) reads a pyproject.toml
// and reports what a build backend, an installer or PyPI will refuse or quietly
// get wrong, each finding with the line it came from. `files` (optional) is the
// list of paths in the project folder, used to check readme and license-files.
//
// Sources for each rule: the "pyproject.toml specification" and "Core metadata
// specifications" on packaging.python.org, PEP 517/518 (build-system), PEP 621
// ([project]), PEP 639 (license, license-files), PEP 685 (extras), PEP 735
// (dependency-groups), PEP 508/440 (dependencies and versions), and the
// behaviour of pip, setuptools and PyPI where it goes further, as the finding
// says. No I/O, no network, no dependencies.

import { parseToml, lineOf } from "./toml.mjs";
import { parseVersion, parseSpecifierSet, parseRequirement, parseLicenseExpression, markerItems, RE_NAME, canonicalName } from "./pep.mjs";
import { CLASSIFIERS, DEPRECATED_CLASSIFIERS, SPDX_VERSION, CLASSIFIERS_VERSION } from "./data.mjs";

export { SPDX_VERSION, CLASSIFIERS_VERSION };

export const PROJECT_FIELDS = [
  "name", "version", "description", "readme", "requires-python", "license", "license-files",
  "authors", "maintainers", "keywords", "classifiers", "urls", "entry-points", "scripts",
  "gui-scripts", "dependencies", "optional-dependencies", "dynamic", "import-names", "import-namespaces",
];
const DYNAMIC_OK = PROJECT_FIELDS.filter((f) => f !== "name" && f !== "dynamic");

// Keys people write in [project] that belong elsewhere or are spelled another way.
const KEY_HINTS = {
  requires_python: "requires-python", python_requires: "requires-python", "python-requires": "requires-python", python: "requires-python",
  author: "authors (an array of tables: authors = [{ name = \"...\", email = \"...\" }])",
  maintainer: "maintainers (an array of tables)", author_email: "authors", "author-email": "authors",
  license_file: "license-files", "license-file": "license-files", license_files: "license-files",
  homepage: "[project.urls] (Homepage = \"https://...\")", url: "[project.urls]", repository: "[project.urls]", documentation: "[project.urls]",
  "project-urls": "[project.urls]", project_urls: "[project.urls]",
  "dev-dependencies": "[dependency-groups] (PEP 735) or an extra in [project.optional-dependencies]",
  dev_dependencies: "[dependency-groups] (PEP 735)", "extras-require": "[project.optional-dependencies]", extras_require: "[project.optional-dependencies]",
  optional_dependencies: "optional-dependencies", "install-requires": "dependencies", install_requires: "dependencies", requires: "dependencies",
  entry_points: "entry-points", console_scripts: "scripts", "console-scripts": "scripts", gui_scripts: "gui-scripts",
  summary: "description", long_description: "readme", "long-description": "readme", packages: "[tool.<your backend>] (for setuptools, [tool.setuptools])",
  classifier: "classifiers", keyword: "keywords",
};
const TOP_LEVEL = ["build-system", "project", "tool", "dependency-groups"];
const TOP_HINTS = { projects: "project", "build_system": "build-system", buildsystem: "build-system", "build-systems": "build-system", "dependency_groups": "dependency-groups", tools: "tool", metadata: "project" };

// build-backend -> the distribution that provides it.
const BACKENDS = {
  "setuptools.build_meta": "setuptools", "setuptools.build_meta:__legacy__": "setuptools",
  "hatchling.build": "hatchling", "flit_core.buildapi": "flit-core", "poetry.core.masonry.api": "poetry-core",
  "pdm.backend": "pdm-backend", "maturin": "maturin", "scikit_build_core.build": "scikit-build-core",
  "mesonpy": "meson-python", "uv_build": "uv-build", "whey": "whey", "sipbuild.api": "sip", "pbr.build": "pbr",
};

const README_TYPES = ["text/markdown", "text/x-rst", "text/plain"];
const EMAIL = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]+$/;
// Entry-point object reference (packaging.python.org "Entry points specification").
const OBJ_REF = /^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*(\s*:\s*[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)*)?(\s*\[[^\]]*\])?$/;

// Marker values that look right to a person and never match (PEP 508's values
// are those of os.name, sys.platform and platform.system()).
const MARKER_FIX = {
  sys_platform: { windows: "win32", win: "win32", win64: "win32", macos: "darwin", osx: "darwin", mac: "darwin", Darwin: "darwin", Linux: "linux", linux2: "linux" },
  platform_system: { windows: "Windows", linux: "Linux", darwin: "Darwin", macos: "Darwin", osx: "Darwin", mac: "Darwin", win32: "Windows" },
  os_name: { windows: "nt", win32: "nt", linux: "posix", darwin: "posix", macos: "posix", Windows: "nt" },
};

const typeName = (v) => (Array.isArray(v) ? "an array" : v === null || v === undefined ? "missing" : typeof v === "object" ? (v.$toml ? "a date/time" : "a table") : typeof v === "bigint" ? "an integer" : `a ${typeof v}`);
const isTable = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !v.$toml;
const has = (o, k) => isTable(o) && Object.prototype.hasOwnProperty.call(o, k);

// PEP 639 glob: * and ? within a path part, ** across parts, [...] classes.
export function globToRegExp(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      i++;
      if (pattern[i + 1] === "/") { i++; re += "(?:[^/]*/)*"; } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "[") {
      const end = pattern.indexOf("]", i + 1);
      if (end < 0) { re += "\\["; continue; }
      re += "[" + pattern.slice(i + 1, end).replace(/\\/g, "\\\\") + "]";
      i = end;
    } else re += c.replace(/[.+^${}()|\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// Lower bound of a requires-python set, as [major, minor] (null when unbounded).
function lowerBound(specs) {
  let best = null;
  for (const { op, version } of specs) {
    if (![">=", ">", "~=", "=="].includes(op)) continue;
    const v = parseVersion(version.replace(/\.\*$/, ""));
    if (!v) continue;
    const r = [Number(v.release[0]), Number(v.release[1] ?? 0)];
    // ">3.8" still admits 3.8.1, so the minor version stays allowed.
    if (!best || r[0] > best[0] || (r[0] === best[0] && r[1] > best[1])) best = r;
  }
  return best;
}

export function analyze(text, { files = null } = {}) {
  // Agents (platform/agents/tools.mjs) pass one object: { text, files }.
  if (text && typeof text === "object" && typeof text.text === "string") ({ text, files = null } = text);
  const findings = [];
  let parsed;
  try {
    parsed = parseToml(String(text ?? ""));
  } catch (e) {
    const line = e.line ?? null;
    return {
      ok: false,
      findings: [{ severity: "high", id: "toml-syntax", line, path: null, message: `Not valid TOML: ${e.reason ?? e.message}. pip, build and every backend stop here.`, fix: "Fix the syntax at that line; a common cause is an unquoted string value or a key set twice." }],
      summary: null,
      metadata: null,
    };
  }
  const { data, lines } = parsed;
  const at = (path) => lineOf(lines, path);
  const add = (severity, id, path, message, fix) => findings.push({ severity, id, line: path ? at(path) : null, path: path ? path.join(".") : null, message, fix: fix ?? null });
  const fileSet = Array.isArray(files) ? new Set(files.map((f) => f.replace(/^\.\//, "").replace(/\\/g, "/"))) : null;

  // ---- top level ----
  for (const k of Object.keys(data)) {
    if (TOP_LEVEL.includes(k)) continue;
    const hint = TOP_HINTS[k.toLowerCase()];
    add("medium", "unknown-top-level", [k], `[${k}] is not a table the pyproject.toml specification defines${hint ? `; did you mean [${hint}]?` : ""}. Tools read only [build-system], [project], [dependency-groups] and [tool.*]; this table is ignored.`, hint ? `Rename it to [${hint}].` : "Move tool settings under [tool.<name>].");
  }

  // ---- [build-system] ----
  const bs = data["build-system"];
  const tool = isTable(data.tool) ? data.tool : {};
  let backend = null;
  if (bs === undefined) {
    if (has(data, "project")) add("medium", "no-build-system", null, "No [build-system] table. pip and python -m build then assume setuptools' legacy backend (setuptools.build_meta:__legacy__), whatever tool you meant to build with.", 'Add [build-system] with requires and build-backend, for example requires = ["hatchling"] and build-backend = "hatchling.build".');
  } else if (!isTable(bs)) {
    add("high", "build-system-type", ["build-system"], `build-system must be a table, not ${typeName(bs)}.`);
  } else {
    if (!has(bs, "requires")) add("high", "build-requires-missing", ["build-system"], "[build-system] has no requires key. PEP 518 makes it required when the table exists, and pip refuses to build.", 'Add requires = ["<your backend>"].');
    else if (!Array.isArray(bs.requires) || bs.requires.some((r) => typeof r !== "string")) add("high", "build-requires-type", ["build-system", "requires"], "build-system.requires must be an array of strings.");
    else {
      bs.requires.forEach((r) => {
        const p = parseRequirement(r);
        if (p.error) add("high", "build-requires-invalid", ["build-system", "requires"], `build-system.requires entry ${JSON.stringify(r)} is not a valid dependency specifier: ${p.error}.`);
      });
    }
    for (const k of Object.keys(bs)) if (!["requires", "build-backend", "backend-path"].includes(k)) add("medium", "build-system-key", ["build-system", k], `build-system.${k} is not a PEP 517/518 key and is ignored.`, k === "build_backend" || k === "backend" ? "Spell it build-backend." : null);
    if (has(bs, "build-backend")) {
      backend = bs["build-backend"];
      if (typeof backend !== "string") add("high", "build-backend-type", ["build-system", "build-backend"], "build-backend must be a string such as \"hatchling.build\".");
      else {
        const dist = BACKENDS[backend];
        const reqNames = Array.isArray(bs.requires) ? bs.requires.map((r) => parseRequirement(r)).filter((p) => !p.error).map((p) => canonicalName(p.name)) : [];
        if (dist && Array.isArray(bs.requires) && !reqNames.includes(canonicalName(dist)) && !has(bs, "backend-path")) {
          add("high", "backend-not-required", ["build-system", "build-backend"], `build-backend is ${backend}, but build-system.requires does not list ${dist}. In an isolated build (pip's default) the backend is not installed, so the build fails with ModuleNotFoundError.`, `Add "${dist}" to build-system.requires.`);
        }
        if (backend === "poetry.masonry.api") add("medium", "poetry-full-backend", ["build-system", "build-backend"], "poetry.masonry.api builds through the whole Poetry application. Poetry's documentation uses poetry-core as the build backend, which is smaller and faster to install.", 'Use requires = ["poetry-core"] and build-backend = "poetry.core.masonry.api".');
        if (backend === "setuptools.build_meta:__legacy__") add("info", "legacy-backend", ["build-system", "build-backend"], "setuptools.build_meta:__legacy__ is the backend kept for projects that still need setup.py's own directory on sys.path. New projects normally use setuptools.build_meta.");
      }
    } else if (isTable(bs) && Array.isArray(bs.requires)) {
      add("info", "no-build-backend", ["build-system"], "No build-backend: front-ends then use setuptools.build_meta:__legacy__, so this only works if requires installs setuptools.", "Name the backend explicitly.");
    }
  }

  // Backend-specific configuration that the chosen backend will never read.
  const backendDist = typeof backend === "string" ? BACKENDS[backend] ?? null : bs === undefined || (isTable(bs) && !has(bs, "build-backend")) ? "setuptools" : null;
  if (backendDist && backendDist !== "poetry-core" && isTable(tool.poetry) && isTable(tool.poetry.dependencies) && Object.keys(tool.poetry.dependencies).some((k) => k !== "python")) {
    add("medium", "poetry-deps-ignored", ["tool", "poetry", "dependencies"], `[tool.poetry.dependencies] lists packages, but the build backend is ${backendDist}, which does not read [tool.poetry]. A wheel built from this file will not require them.`, "List them in [project] dependencies.");
  }
  if (backendDist && backendDist !== "setuptools" && isTable(tool.setuptools)) add("low", "setuptools-config-ignored", ["tool", "setuptools"], `[tool.setuptools] is configured, but the build backend is ${backendDist}; it is not read.`);
  if (backendDist && backendDist !== "hatchling" && isTable(tool.hatch) && isTable(tool.hatch.build)) add("low", "hatch-config-ignored", ["tool", "hatch", "build"], `[tool.hatch.build] is configured, but the build backend is ${backendDist}; it is not read.`);

  // ---- [project] ----
  const project = data.project;
  if (project === undefined) {
    if (isTable(tool.poetry) && (has(tool.poetry, "name") || has(tool.poetry, "dependencies"))) {
      add("info", "poetry-legacy-metadata", ["tool", "poetry"], "No [project] table: the metadata is in Poetry 1's [tool.poetry], which only Poetry reads. Poetry 2 reads the standard [project] table, which other tools (and this checker) understand.", "Run poetry check, or move name, version, description, authors and dependencies into [project].");
    } else if (isTable(bs)) {
      const legacy = fileSet && (fileSet.has("setup.py") || fileSet.has("setup.cfg"));
      add(fileSet && !legacy ? "high" : "info", "no-project", null, legacy ? "No [project] table: the metadata comes from setup.py or setup.cfg, which this checker does not read." : fileSet ? "A [build-system] but no [project] table, and no setup.py or setup.cfg in the file list: the package has no name or version." : "A [build-system] but no [project] table. Fine if the metadata lives in setup.py or setup.cfg (this checker does not read those); otherwise the package has no name or version.", legacy ? "Moving the metadata into [project] lets every tool read it without running setup.py." : "Add [project] with at least name and version.");
    } else {
      add("info", "no-project", null, "No [project] table. That is fine if this file only configures tools (ruff, pytest, mypy, black); there is no package metadata to check.");
    }
    return finish();
  }
  if (!isTable(project)) {
    add("high", "project-type", ["project"], `project must be a table, not ${typeName(project)}.`);
    return finish();
  }
  const P = (k) => ["project", k];

  for (const k of Object.keys(project)) {
    if (PROJECT_FIELDS.includes(k)) continue;
    const hint = KEY_HINTS[k] ?? KEY_HINTS[k.toLowerCase()];
    add("high", "unknown-project-key", P(k), `project.${k} is not a [project] field. setuptools and flit_core refuse to build; hatchling drops it silently, so whatever it was meant to say never reaches the package.${hint ? ` Did you mean ${hint}?` : ""}`, hint ? `Use ${hint}.` : `Move it under [tool.<your backend>] if it is backend configuration.`);
  }

  // dynamic
  let dynamic = [];
  if (has(project, "dynamic")) {
    if (!Array.isArray(project.dynamic) || project.dynamic.some((d) => typeof d !== "string")) add("high", "dynamic-type", P("dynamic"), "dynamic must be an array of field names (strings).");
    else {
      dynamic = project.dynamic;
      const seen = new Set();
      for (const d of dynamic) {
        if (seen.has(d)) add("low", "dynamic-duplicate", P("dynamic"), `${JSON.stringify(d)} is listed twice in dynamic.`);
        seen.add(d);
        if (d === "name") add("high", "dynamic-name", P("dynamic"), "name cannot be dynamic: the specification requires it to be given statically so tools can read it without building.", "Write name in [project].");
        else if (!DYNAMIC_OK.includes(d)) add("high", "dynamic-unknown", P("dynamic"), `dynamic lists ${JSON.stringify(d)}, which is not a [project] field.${KEY_HINTS[d] ? ` Did you mean ${KEY_HINTS[d]}?` : ""}`);
        else if (has(project, d)) add("high", "dynamic-and-static", P(d), `${d} is written in [project] and also listed in dynamic. The specification says a backend must raise an error; setuptools, hatchling and flit_core all do.`, `Either remove ${d} from dynamic or remove the static value.`);
      }
    }
  }
  const isDyn = (k) => dynamic.includes(k);
  const str = (k, sev = "high") => {
    if (!has(project, k)) return undefined;
    if (typeof project[k] !== "string") {
      add(sev, `${k}-type`, P(k), `project.${k} must be a string, not ${typeName(project[k])}.`);
      return undefined;
    }
    return project[k];
  };

  // name
  const name = str("name");
  let normName = null;
  if (!has(project, "name")) add("high", "name-missing", ["project"], "project.name is missing. It is the one field every tool requires.");
  else if (name !== undefined) {
    if (!RE_NAME.test(name)) add("high", "name-invalid", P("name"), `${JSON.stringify(name)} is not a valid project name: letters, digits, ".", "_" and "-" only, starting and ending with a letter or digit.`);
    else {
      normName = canonicalName(name);
      if (normName !== name) add("info", "name-not-normalized", P("name"), `PyPI and pip treat ${JSON.stringify(name)} as ${JSON.stringify(normName)}; the wheel file name uses ${normName.replace(/-/g, "_")}. That is fine, just know it is one name.`);
    }
  }

  // version
  const version = str("version");
  if (!has(project, "version") && !isDyn("version")) add("high", "version-missing", ["project"], "No version, and version is not listed in dynamic. A backend cannot build without one.", 'Add version = "0.1.0", or dynamic = ["version"] if your backend computes it (from git tags or __version__).');
  if (version !== undefined) {
    const v = parseVersion(version);
    if (!v) add("high", "version-invalid", P("version"), `${JSON.stringify(version)} is not a PEP 440 version. Backends refuse to build and PyPI refuses the upload.`, 'Use a form like 1.2.3, 1.2.3rc1 or 1.2.3.post1 ("v1.2", "1.2-beta" with letters are common mistakes; some are accepted and normalised, these are not).');
    else {
      if (v.normalized !== version) add("low", "version-not-normalized", P("version"), `Version ${JSON.stringify(version)} normalises to ${JSON.stringify(v.normalized)}; that is what the wheel, the sdist and PyPI will show, so a git tag or __version__ written the first way will not match.`, `Write version = "${v.normalized}".`);
      if (v.local) add("high", "version-local", P("version"), `${JSON.stringify(version)} has a local version label (+${v.local.join(".")}). PyPI rejects uploads with local versions.`, "Drop the +... part for a release you publish.");
    }
  }

  // description
  const description = str("description");
  if (backendDist === "flit-core" && !has(project, "description") && !isDyn("description")) add("high", "flit-description", ["project"], "flit_core refuses to build without a description (or description listed in dynamic, read from the module docstring).", 'Add description = "One line about the package."');
  if (description !== undefined) {
    if (/[\r\n]/.test(description)) add("medium", "description-multiline", P("description"), "description has a line break. It becomes the one-line Summary field of the metadata: setuptools warns (\"Invalid config\") and hatchling and flit_core write it as it is, which can break the metadata file's header format.", "Keep description to one sentence; the long text goes in readme.");
    if (description.length > 512) add("medium", "description-long", P("description"), `description is ${description.length} characters. PyPI rejects a summary over 512 characters.`);
  }

  // readme
  let readmeType = null;
  let readmeFile = null;
  if (has(project, "readme")) {
    const r = project.readme;
    if (typeof r === "string") {
      readmeFile = r;
      const lower = r.toLowerCase();
      if (lower.endsWith(".md")) readmeType = "text/markdown";
      else if (lower.endsWith(".rst")) readmeType = "text/x-rst";
      else add("low", "readme-extension", P("readme"), `readme = ${JSON.stringify(r)}: the specification only infers the content type from .md (Markdown) or .rst (reStructuredText). setuptools, hatchling and flit_core treat other names as plain text; other backends may refuse.`, `Use the table form: readme = { file = "${r}", content-type = "text/plain" }.`);
    } else if (isTable(r)) {
      const hasFile = has(r, "file"), hasText = has(r, "text");
      if (hasFile && hasText) add("high", "readme-file-and-text", P("readme"), "readme has both file and text; the specification allows exactly one.");
      if (!hasFile && !hasText) add("high", "readme-empty", P("readme"), "readme table has neither file nor text.");
      if (hasFile && typeof r.file !== "string") add("high", "readme-file-type", P("readme"), "readme.file must be a string path.");
      if (hasFile && typeof r.file === "string") readmeFile = r.file;
      for (const k of Object.keys(r)) if (!["file", "text", "content-type"].includes(k)) add("high", "readme-key", P("readme"), `readme.${k} is not a readme key (file, text, content-type).${k === "content_type" || k === "type" ? " Spell it content-type." : ""}`);
      if (!has(r, "content-type")) add("medium", "readme-content-type-missing", P("readme"), "The readme table has no content-type. The specification requires one in the table form, and setuptools, hatchling and flit_core all refuse to build without it.", 'Add content-type = "text/markdown" (or "text/x-rst").');
      else if (typeof r["content-type"] !== "string") add("high", "readme-content-type", P("readme"), "readme.content-type must be a string.");
      else {
        const ct = r["content-type"];
        const base = ct.split(";")[0].trim().toLowerCase();
        readmeType = ct;
        if (!README_TYPES.includes(base)) add("high", "readme-content-type", P("readme"), `content-type ${JSON.stringify(ct)} is not one PyPI renders; it rejects uploads with any type other than text/markdown, text/x-rst or text/plain.`, base === "markdown" || base === "text/md" ? 'Use "text/markdown".' : base === "rst" || base === "text/rst" ? 'Use "text/x-rst".' : null);
        else if (readmeFile && /\.md$/i.test(readmeFile) && base === "text/x-rst") add("medium", "readme-type-mismatch", P("readme"), `${readmeFile} looks like Markdown but content-type says reStructuredText; PyPI will show the raw source or reject the upload if it does not parse.`);
        else if (readmeFile && /\.rst$/i.test(readmeFile) && base === "text/markdown") add("medium", "readme-type-mismatch", P("readme"), `${readmeFile} looks like reStructuredText but content-type says Markdown; PyPI will render it as Markdown.`);
      }
    } else add("high", "readme-type", P("readme"), `readme must be a path string or a table, not ${typeName(r)}.`);
    if (readmeFile && fileSet && !fileSet.has(readmeFile.replace(/^\.\//, ""))) add("high", "readme-missing", P("readme"), `readme points at ${readmeFile}, which is not in the file list. The build fails (paths are relative to pyproject.toml and case-sensitive on Linux).`);
  } else if (!isDyn("readme")) add("low", "no-readme", ["project"], "No readme: the project's PyPI page will be blank.", 'Add readme = "README.md".');

  // requires-python
  const rp = str("requires-python");
  let rpSpecs = null;
  if (rp !== undefined) {
    const set = parseSpecifierSet(rp);
    if (set.error) add("high", "requires-python-invalid", P("requires-python"), `requires-python = ${JSON.stringify(rp)} is not a PEP 440 specifier set (${set.error}).${/[\^~](?!=)/.test(rp) ? " ^ and ~ are Poetry's own range syntax, not PEP 440." : ""}`, rp.startsWith("^") ? `Write ">=${rp.slice(1)}".` : 'Write it like ">=3.9".');
    else {
      rpSpecs = set.specs;
      const caps = set.specs.filter((s) => s.op === "<" || s.op === "<=" || (s.op === "==" && s.version.endsWith(".*")) || (s.op === "==" && !s.version.endsWith(".*")));
      const compatCap = set.specs.filter((s) => s.op === "~=");
      if (caps.length) add("medium", "requires-python-cap", P("requires-python"), `requires-python has an upper bound (${caps.map((s) => s.op + s.version).join(", ")}). pip installs the newest release whose requires-python matches, so on a newer Python your users silently get an older release of your package, or an error, even if this release would work there. Poetry and PDM also force the cap onto every project that depends on yours.`, "Use only a lower bound, like \">=3.9\", unless you know this release cannot work on newer Pythons.");
      else if (compatCap.length) add("low", "requires-python-compatible", P("requires-python"), `${compatCap.map((s) => "~=" + s.version).join(", ")} means "at least this, and below the next major" (~=3.9 is >=3.9, ==3.*), so it is an upper bound in disguise.`, `Write ">=${compatCap[0].version}" if a cap is not intended.`);
      if (!set.specs.some((s) => [">=", ">", "~=", "=="].includes(s.op))) add("low", "requires-python-no-lower", P("requires-python"), "requires-python has no lower bound, so installers will try this release on every old Python.");
    }
  } else if (!isDyn("requires-python")) add("low", "no-requires-python", ["project"], "No requires-python. Installers will try this release on any Python version, including ones your code does not run on.", 'Add requires-python = ">=3.9" (or your real floor).');

  // classifiers
  const classifiers = [];
  if (has(project, "classifiers")) {
    const c = project.classifiers;
    if (!Array.isArray(c) || c.some((x) => typeof x !== "string")) add("high", "classifiers-type", P("classifiers"), "classifiers must be an array of strings.");
    else {
      const known = new Set(CLASSIFIERS);
      const seen = new Set();
      for (const x of c) {
        classifiers.push(x);
        if (seen.has(x)) add("low", "classifier-duplicate", P("classifiers"), `Classifier listed twice: ${x}`);
        seen.add(x);
        if (x.startsWith("Private ::")) { add("info", "classifier-private", P("classifiers"), `"${x}" is a Private classifier: PyPI refuses any upload carrying it, which is its purpose (it stops an accidental public release).`); continue; }
        if (has(DEPRECATED_CLASSIFIERS, x)) {
          const to = DEPRECATED_CLASSIFIERS[x];
          add("medium", "classifier-deprecated", P("classifiers"), `"${x}" is deprecated; PyPI rejects uploads using it.${to.length ? ` Use ${to.map((t) => `"${t}"`).join(" or ")}.` : ""}`);
          continue;
        }
        if (!known.has(x)) {
          const near = CLASSIFIERS.find((k) => k.toLowerCase() === x.toLowerCase() || k.replace(/\s+/g, "") === x.replace(/\s+/g, ""));
          add("high", "classifier-unknown", P("classifiers"), `"${x}" is not a classifier PyPI knows (trove-classifiers ${CLASSIFIERS_VERSION}); PyPI rejects the upload.${near ? ` Did you mean "${near}"?` : ""}`);
        }
      }
    }
  }
  const licenseClassifiers = classifiers.filter((x) => x.startsWith("License ::"));

  // classifier Python versions against requires-python
  if (rpSpecs) {
    const lb = lowerBound(rpSpecs);
    const pyc = classifiers.map((x) => /^Programming Language :: Python :: (\d+)\.(\d+)$/.exec(x)).filter(Boolean);
    const below = lb ? pyc.filter((m) => +m[1] < lb[0] || (+m[1] === lb[0] && +m[2] < lb[1])) : [];
    if (below.length) add("low", "classifier-below-requires-python", P("classifiers"), `Classifiers name Python ${below.map((m) => `${m[1]}.${m[2]}`).join(", ")}, but requires-python (${rp}) excludes ${below.length > 1 ? "them" : "it"}. PyPI shows both, and they disagree.`, "Remove the old Python classifiers or lower requires-python.");
  }

  // license
  let licenseExpression = null;
  const lic = project.license;
  if (has(project, "license")) {
    if (typeof lic === "string") {
      const p = parseLicenseExpression(lic);
      if (p.error) {
        const looksName = /\s/.test(lic) && !/\b(AND|OR|WITH)\b/i.test(lic);
        add("high", "license-expression-invalid", P("license"), `license = ${JSON.stringify(lic)} is not a valid SPDX license expression (${p.error}; SPDX list ${SPDX_VERSION}). Since PEP 639 a string here must be an SPDX expression; setuptools, hatchling and flit_core all refuse other text.${looksName ? " It looks like a licence name rather than an identifier." : ""}`, commonLicense(lic));
      } else {
        licenseExpression = p.normalized;
        if (p.normalized !== lic) add("low", "license-not-canonical", P("license"), `license ${JSON.stringify(lic)} is valid; the canonical spelling is ${JSON.stringify(p.normalized)}.`, `Write license = "${p.normalized}".`);
        for (const d of p.deprecated) add("low", "license-deprecated-id", P("license"), `${d} is a deprecated SPDX identifier.${/^(L?GPL|AGPL|GFDL)-[0-9.]+$/.test(d) ? ` Say which you mean: ${d}-only or ${d}-or-later.` : d.endsWith("+") ? "" : ""}`);
        const refuses = backendDist === "setuptools" || backendDist === "flit-core";
        if (licenseClassifiers.length) add(refuses ? "high" : "medium", "license-classifier-conflict", P("classifiers"), `license is an SPDX expression and classifiers still include ${licenseClassifiers.map((x) => `"${x}"`).join(", ")}. PEP 639 deprecates licence classifiers and lets backends refuse the pair: setuptools (84 tested) and flit_core stop the build${refuses ? "" : `; ${backendDist ?? "your backend"} ${backendDist === "hatchling" ? "accepts it today" : "may not"}, but the two can disagree on PyPI`}.`, "Delete the License :: classifiers; the expression replaces them.");
      }
    } else if (isTable(lic)) {
      const hf = has(lic, "file"), ht = has(lic, "text");
      if (hf && ht) add("high", "license-table-both", P("license"), "license table has both file and text; only one is allowed.");
      if (!hf && !ht) add("high", "license-table-empty", P("license"), "license table has neither file nor text.");
      for (const k of Object.keys(lic)) if (k !== "file" && k !== "text") add("high", "license-table-key", P("license"), `license.${k} is not allowed (file or text).`);
      if (hf && typeof lic.file === "string" && fileSet && !fileSet.has(lic.file.replace(/^\.\//, ""))) add("high", "license-file-missing", P("license"), `license.file points at ${lic.file}, which is not in the file list.`);
      add("medium", "license-table-deprecated", P("license"), "The table form (license = { file = ... } or { text = ... }) is deprecated by PEP 639. setuptools warns that support will be removed; hatchling and flit_core still accept it.", `Use an SPDX expression${guessFromClassifiers(licenseClassifiers)} and list the file in license-files.`);
      if (has(project, "license-files")) add("high", "license-files-with-table", P("license-files"), "license-files cannot be combined with the table form of license; PEP 639 says tools must raise an error, and setuptools and flit_core do (hatchling accepts it).", "Change license to an SPDX expression string.");
    } else add("high", "license-type", P("license"), `license must be an SPDX expression string, not ${typeName(lic)}.`);
  } else if (!isDyn("license")) {
    if (licenseClassifiers.length) add("low", "license-classifier-only", P("classifiers"), `The licence is given only as a classifier (${licenseClassifiers.join(", ")}). PEP 639 deprecates licence classifiers in favour of a license expression.`, `Add license = "${guessFromClassifiers(licenseClassifiers).replace(/^ such as /, "").replace(/"/g, "") || "MIT"}" and drop the classifier.`);
    else add("low", "no-license", ["project"], "No license and no licence classifier: the PyPI page will show no licence, and people who check before depending on a package will skip it.", 'Add license = "MIT" (or your SPDX identifier) and license-files = ["LICENSE"].');
  }

  // license-files
  if (has(project, "license-files")) {
    const lf = project["license-files"];
    if (!Array.isArray(lf) || lf.some((x) => typeof x !== "string")) add("high", "license-files-type", P("license-files"), isTable(lf) ? "license-files is a table (the old paths/globs draft); PEP 639 made it an array of glob patterns." : "license-files must be an array of glob strings.", 'Write license-files = ["LICEN[CS]E*"].');
    else {
      for (const g of lf) {
        if (g.startsWith("/") || g.split("/").includes("..")) add("high", "license-files-path", P("license-files"), `license-files pattern ${JSON.stringify(g)} leaves the project folder (leading / or ..); PEP 639 says tools must raise an error.`);
        else if (g.includes("\\")) add("high", "license-files-backslash", P("license-files"), `license-files pattern ${JSON.stringify(g)} uses a backslash; patterns use / on every platform.`);
        else if (/[^A-Za-z0-9._\-/*?[\]!^]/.test(g)) add("medium", "license-files-chars", P("license-files"), `license-files pattern ${JSON.stringify(g)} uses characters outside PEP 639's glob syntax (letters, digits, . _ - / * ? ** [ ]).`);
        else if (fileSet) {
          const re = globToRegExp(g);
          if (![...fileSet].some((f) => re.test(f))) add(backendDist === "flit-core" ? "high" : "medium", "license-files-no-match", P("license-files"), `license-files pattern ${JSON.stringify(g)} matches no file in the list, so no licence file ships. PEP 639 says a build must fail when a pattern matches nothing: flit_core does, setuptools only warns and hatchling is silent.`);
        }
      }
    }
  }

  // people
  for (const role of ["authors", "maintainers"]) {
    if (!has(project, role)) continue;
    const list = project[role];
    if (!Array.isArray(list) || list.some((x) => !isTable(x))) {
      add("high", `${role}-type`, P(role), `${role} must be an array of tables like [{ name = "Ada", email = "ada@example.org" }].${Array.isArray(list) && list.some((x) => typeof x === "string") ? ' The "Name <email>" strings are Poetry 1 syntax.' : ""}`);
      continue;
    }
    list.forEach((p) => {
      for (const k of Object.keys(p)) if (k !== "name" && k !== "email") add("high", `${role}-key`, P(role), `${role} entry has key ${JSON.stringify(k)}; only name and email are allowed.`);
      if (!has(p, "name") && !has(p, "email")) add("medium", `${role}-empty`, P(role), `An empty entry in ${role}.`);
      if (has(p, "name") && typeof p.name === "string" && p.name.includes(",")) add("medium", `${role}-comma`, P(role), `${role} name ${JSON.stringify(p.name)} has a comma. The specification forbids it because the metadata joins people with commas; setuptools, hatchling and flit_core write it anyway, so PyPI and every tool read it as two people.`, "Give each person their own entry.");
      if (has(p, "email") && (typeof p.email !== "string" || !EMAIL.test(p.email))) add("medium", `${role}-email`, P(role), `${role} email ${JSON.stringify(p.email)} is not a valid address. setuptools refuses to build; hatchling and flit_core accept it.`);
    });
  }

  // keywords
  if (has(project, "keywords")) {
    const k = project.keywords;
    if (!Array.isArray(k) || k.some((x) => typeof x !== "string")) add("high", "keywords-type", P("keywords"), typeof k === "string" ? "keywords is a string; it must be an array of strings." : "keywords must be an array of strings.", typeof k === "string" ? `Write keywords = [${k.split(/[,\s]+/).filter(Boolean).map((w) => JSON.stringify(w)).join(", ")}].` : null);
    else if (k.some((x) => x.includes(","))) add("low", "keywords-comma", P("keywords"), "A keyword contains a comma; the metadata joins keywords with commas, so it becomes two.");
  }

  // urls
  if (has(project, "urls")) {
    const u = project.urls;
    if (!isTable(u)) add("high", "urls-type", P("urls"), "urls must be a table of label = \"https://...\".");
    else for (const [label, url] of Object.entries(u)) {
      if (typeof url !== "string") { add("high", "url-type", ["project", "urls", label], `urls.${label} must be a string.`); continue; }
      if (label.length > 32) add("medium", "url-label-long", ["project", "urls", label], `The URL label "${label}" is ${label.length} characters; core metadata limits a Project-URL label to 32.`);
      if (!/^https?:\/\/[^\s/]+\.[^\s]*$/.test(url) && !/^https?:\/\/localhost/.test(url)) add("medium", "url-invalid", ["project", "urls", label], `urls.${label} = ${JSON.stringify(url)} is not an http(s) URL; PyPI will not link it.`);
      else if (url.startsWith("http://")) add("low", "url-http", ["project", "urls", label], `urls.${label} uses http://; use https:// if the site serves it.`);
    }
  }

  // dependencies
  const deps = [];
  const checkDeps = (list, path, where, extraName) => {
    if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) {
      add("high", "dependencies-type", path, `${where} must be an array of strings (PEP 508 dependency specifiers).${isTable(list) ? " A table of name = version is Poetry's [tool.poetry.dependencies] syntax." : ""}`);
      return [];
    }
    const out = [];
    const seen = new Map();
    for (const d of list) {
      const p = parseRequirement(d);
      if (p.error) {
        const hint = /^\s*[\w.-]+\s*\^/.test(d) ? " ^ is Poetry's caret syntax; PEP 508 has no ^." : /^\s*[\w.-]+\s*=[^=]/.test(d) ? " A single = is not an operator; use == or >=." : /^\s*[\w.-]+\s+[0-9]/.test(d) ? " A version needs an operator, like >=." : "";
        add("high", "dependency-invalid", path, `${where}: ${JSON.stringify(d)} is not a valid dependency specifier: ${p.error}.${hint}`);
        continue;
      }
      const spec = parseSpecifierSet(p.specifier);
      if (spec.error) { add("high", "dependency-invalid", path, `${where}: ${JSON.stringify(d)}: ${spec.error}.`); continue; }
      out.push({ ...p, raw: d, specs: spec.specs });
      const cn = canonicalName(p.name);
      if (p.url) add("high", "dependency-direct-url", path, `${where}: ${JSON.stringify(d)} is a direct URL reference. PyPI rejects uploads whose dependencies point at a URL, and pip only installs them from a local checkout or a non-PyPI index.`, "Publish the dependency to PyPI and depend on it by version, or keep the URL in a dependency group for local development.");
      if (normName && cn === normName && !extraName) add("medium", "dependency-self", path, `${where} lists the project itself (${p.name}).`);
      for (const [v, op, val] of markerItems(p.marker).map((it) => [it[0].variable ?? it[2].variable, it[1], it[0].value ?? it[2].value])) {
        if (!v) continue;
        if (v === "extra" && !extraName) add("medium", "dependency-extra-marker", path, `${where}: ${JSON.stringify(d)} has an extra marker in the main dependencies, where no extra is ever active, so it is never installed.`, "Put it in [project.optional-dependencies] under that extra.");
        const fix = MARKER_FIX[v]?.[val];
        if (fix && (op === "==" || op === "!=")) add("medium", "marker-value", path, `${where}: ${JSON.stringify(d)} compares ${v} with ${JSON.stringify(val)}, which ${v} never equals (it is ${JSON.stringify(fix)} on that platform), so the marker is ${op === "==" ? "always false" : "always true"}.`, `Use ${v} ${op} "${fix}".`);
        if (v === "python_version" && typeof val === "string" && /^\d+\.\d+\.\d+/.test(val)) add("low", "marker-python-version", path, `${where}: ${JSON.stringify(d)} compares python_version (major.minor only, like "3.10") with ${JSON.stringify(val)}.`, "Use python_full_version for a three-part version.");
      }
      const key = cn + "|" + (p.marker ? JSON.stringify(p.marker) : "");
      if (seen.has(key)) add("low", "dependency-duplicate", path, `${where} lists ${p.name} twice (${JSON.stringify(seen.get(key))} and ${JSON.stringify(d)}).`);
      seen.set(key, d);
    }
    return out;
  };
  if (has(project, "dependencies")) deps.push(...checkDeps(project.dependencies, P("dependencies"), "dependencies"));
  const exact = deps.filter((d) => d.specs.length === 1 && d.specs[0].op === "==" && !d.specs[0].version.endsWith(".*"));
  if (deps.length >= 3 && exact.length === deps.length) add("low", "dependencies-all-pinned", P("dependencies"), "Every dependency is pinned with ==. In a library that forces every user's environment to exactly these versions, and two such libraries cannot be installed together. Pins belong in a lock file.", "Use lower bounds (>=) here; keep exact pins in a lock file or requirements.txt.");

  // optional-dependencies
  const extras = {};
  if (has(project, "optional-dependencies")) {
    const od = project["optional-dependencies"];
    if (!isTable(od)) add("high", "optional-dependencies-type", P("optional-dependencies"), "optional-dependencies must be a table of extra = [dependencies].");
    else {
      const norm = new Map();
      for (const [ex, list] of Object.entries(od)) {
        const path = ["project", "optional-dependencies", ex];
        if (!RE_NAME.test(ex)) add("high", "extra-invalid", path, `Extra name ${JSON.stringify(ex)} is not valid (letters, digits, . _ -, starting and ending with a letter or digit).`);
        else {
          const n = canonicalName(ex);
          if (norm.has(n)) add("high", "extra-collision", path, `Extras ${JSON.stringify(norm.get(n))} and ${JSON.stringify(ex)} are the same extra after PEP 685 normalisation (${n}).`);
          else if (n !== ex) add("low", "extra-not-normalized", path, `Extra ${JSON.stringify(ex)} is published as ${JSON.stringify(n)} (PEP 685); pip install <package>[${ex}] still works, but lock files and the PyPI page show ${n}.`, `Name it ${n}.`);
          norm.set(n, ex);
        }
        extras[ex] = checkDeps(list, path, `optional-dependencies.${ex}`, ex);
      }
      // self-references to extras that do not exist
      for (const [ex, list] of Object.entries(extras)) for (const d of list) {
        if (normName && canonicalName(d.name) === normName) for (const e of d.extras) if (!norm.has(canonicalName(e))) add("medium", "extra-self-unknown", ["project", "optional-dependencies", ex], `optional-dependencies.${ex} includes ${d.name}[${e}], but this project has no extra named ${e}.`);
      }
    }
  }

  // scripts and entry points
  for (const kind of ["scripts", "gui-scripts"]) {
    if (!has(project, kind)) continue;
    const t = project[kind];
    if (!isTable(t)) { add("high", `${kind}-type`, P(kind), `${kind} must be a table of command = "module:function".`); continue; }
    for (const [cmd, ref] of Object.entries(t)) {
      const path = ["project", kind, cmd];
      if (typeof ref !== "string") { add("high", "script-type", path, `${kind}.${cmd} must be a string "module:function".`); continue; }
      if (!OBJ_REF.test(ref.trim())) add("high", "script-invalid", path, `${kind}.${cmd} = ${JSON.stringify(ref)} is not an object reference ("package.module:function").${ref.includes("/") || ref.endsWith(".py") ? " It looks like a file path; use the dotted module name." : ""}`);
      else if (!ref.includes(":")) add("high", "script-no-callable", path, `${kind}.${cmd} = ${JSON.stringify(ref)} names a module but no function. pip refuses to install it ("A callable suffix is required").`, `Write "${ref}:main" (or the function's name).`);
      else if (/\[/.test(ref)) add("low", "script-extras", path, `${kind}.${cmd} uses [extras] in an entry point; the entry points specification deprecates them and installers ignore them.`);
      if (/\s/.test(cmd)) add("medium", "script-name", path, `Command name ${JSON.stringify(cmd)} has whitespace; installers write it as a file name.`);
    }
  }
  if (has(project, "entry-points")) {
    const ep = project["entry-points"];
    if (!isTable(ep)) add("high", "entry-points-type", P("entry-points"), "entry-points must be a table of groups, each a table of name = \"module:object\".");
    else for (const [group, entries] of Object.entries(ep)) {
      const path = ["project", "entry-points", group];
      if (group === "console_scripts" || group === "gui_scripts") add("high", "entry-points-scripts", path, `[project.entry-points.${group}] is not allowed: the specification says a backend must raise an error, and hatchling and flit_core do (setuptools accepts it).`, `Use [project.${group === "console_scripts" ? "scripts" : "gui-scripts"}].`);
      if (!isTable(entries)) { add("high", "entry-points-type", path, `entry-points.${group} must be a table.`); continue; }
      for (const [n, ref] of Object.entries(entries)) if (typeof ref !== "string" || !OBJ_REF.test(ref.trim())) add("high", "entry-point-invalid", [...path, n], `entry-points.${group}.${n} = ${JSON.stringify(ref)} is not an object reference ("package.module:object").`);
    }
  }

  return finish();

  function checkGroups() {
  // dependency-groups (PEP 735)
  const dg = data["dependency-groups"];
  if (dg !== undefined) {
    if (!isTable(dg)) add("high", "dependency-groups-type", ["dependency-groups"], "dependency-groups must be a table of group = [requirements or { include-group = \"name\" }].");
    else {
      const norm = new Map();
      for (const g of Object.keys(dg)) {
        if (!RE_NAME.test(g)) add("high", "group-name-invalid", ["dependency-groups", g], `Dependency group name ${JSON.stringify(g)} is not valid.`);
        const n = canonicalName(g);
        if (norm.has(n)) add("high", "group-collision", ["dependency-groups", g], `Groups ${JSON.stringify(norm.get(n))} and ${JSON.stringify(g)} are the same group after normalisation; PEP 735 makes that an error.`);
        norm.set(n, g);
      }
      const includes = new Map();
      for (const [g, list] of Object.entries(dg)) {
        const path = ["dependency-groups", g];
        if (!Array.isArray(list)) { add("high", "group-type", path, `dependency-groups.${g} must be an array.`); continue; }
        includes.set(canonicalName(g), []);
        for (const item of list) {
          if (typeof item === "string") {
            const p = parseRequirement(item);
            if (p.error) add("high", "group-requirement-invalid", path, `dependency-groups.${g}: ${JSON.stringify(item)} is not a valid dependency specifier: ${p.error}.`);
            else if (parseSpecifierSet(p.specifier).error) add("high", "group-requirement-invalid", path, `dependency-groups.${g}: ${JSON.stringify(item)}: ${parseSpecifierSet(p.specifier).error}.`);
          } else if (isTable(item) && Object.keys(item).length === 1 && typeof item["include-group"] === "string") {
            const target = canonicalName(item["include-group"]);
            if (!norm.has(target)) add("high", "group-include-unknown", path, `dependency-groups.${g} includes group ${JSON.stringify(item["include-group"])}, which does not exist.`);
            else includes.get(canonicalName(g)).push(target);
          } else add("high", "group-item", path, `dependency-groups.${g} has an entry that is neither a requirement string nor { include-group = "name" }.`);
        }
      }
      // cycles
      const state = new Map();
      const cyc = new Set();
      const visit = (n, stack) => {
        if (state.get(n) === 1) { cyc.add(stack.slice(stack.indexOf(n)).concat(n).map((x) => norm.get(x)).join(" -> ")); return; }
        if (state.get(n) === 2) return;
        state.set(n, 1);
        for (const m of includes.get(n) ?? []) visit(m, stack.concat(n));
        state.set(n, 2);
      };
      for (const n of includes.keys()) visit(n, []);
      for (const c of cyc) add("high", "group-cycle", ["dependency-groups"], `Dependency groups include each other in a cycle (${c}); PEP 735 makes that an error.`);
    }
  }

  }

  function finish() {
    checkGroups();
    const order = { high: 0, medium: 1, low: 2, info: 3 };
    findings.sort((a, b) => order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0));
    const count = (s) => findings.filter((f) => f.severity === s).length;
    const proj = isTable(data.project) ? data.project : null;
    return {
      ok: count("high") === 0,
      findings,
      totals: { high: count("high"), medium: count("medium"), low: count("low"), info: count("info") },
      summary: proj
        ? {
            name: typeof proj.name === "string" ? proj.name : null,
            normalizedName: normName,
            version: typeof proj.version === "string" ? proj.version : dynamic.includes("version") ? "(dynamic)" : null,
            backend: typeof backend === "string" ? backend : null,
            requiresPython: typeof proj["requires-python"] === "string" ? proj["requires-python"] : null,
            license: licenseExpression,
            dependencies: deps.length,
            extras: Object.keys(extras),
            dynamic,
          }
        : null,
      metadata: proj ? coreMetadata(proj, { normName, deps, extras, licenseExpression, readmeType, dynamic }) : null,
      fileListGiven: !!fileSet,
    };
  }
}

function commonLicense(text) {
  const t = text.toLowerCase().replace(/licen[cs]e|the|version|v(?=\d)/g, " ").replace(/\s+/g, " ").trim();
  const map = [
    [/^mit$/, "MIT"], [/^apache ?2(\.0)?$/, "Apache-2.0"], [/^bsd( ?3| 3-clause| new)?$/, "BSD-3-Clause"], [/^bsd ?2( clause|-clause)?$/, "BSD-2-Clause"],
    [/^gpl ?v?3(\.0)?\+?$|^gnu general public 3/, "GPL-3.0-only (or GPL-3.0-or-later)"], [/^gpl ?v?2(\.0)?\+?$/, "GPL-2.0-only (or GPL-2.0-or-later)"],
    [/^lgpl ?v?3/, "LGPL-3.0-only (or LGPL-3.0-or-later)"], [/^lgpl ?v?2\.1/, "LGPL-2.1-only (or LGPL-2.1-or-later)"], [/^mpl ?2(\.0)?$|^mozilla public 2/, "MPL-2.0"],
    [/^agpl ?v?3/, "AGPL-3.0-only (or AGPL-3.0-or-later)"], [/^isc$/, "ISC"], [/^unlicen[cs]e$|^public domain$/, "Unlicense (or LicenseRef-Public-Domain)"],
    [/^proprietary|^all rights reserved|^private/, "LicenseRef-Proprietary"],
  ];
  for (const [re, id] of map) if (re.test(t)) return `Write license = "${id.split(" ")[0]}"${id.includes("(") ? ` ${id.slice(id.indexOf("("))}` : ""}.`;
  return "Find the SPDX identifier at spdx.org/licenses, or use LicenseRef-<name> for a licence that has none.";
}

function guessFromClassifiers(cls) {
  // Keyed on the classifier's tail, which identifies it in PyPI's list.
  const map = [["MIT License", "MIT"], ["Apache Software License", "Apache-2.0"], [":: BSD License", "BSD-3-Clause"], ["(ISCL)", "ISC"], ["(MPL 2.0)", "MPL-2.0"], ["(GPLv3)", "GPL-3.0-only"], ["(GPLv3+)", "GPL-3.0-or-later"], ["(LGPLv3)", "LGPL-3.0-only"], ["(Unlicense)", "Unlicense"]];
  for (const c of cls) for (const [tail, id] of map) if (c.startsWith("License :: OSI Approved") && c.endsWith(tail)) return ` such as "${id}"`;
  return "";
}

// The core metadata (METADATA / PKG-INFO) fields a backend would write from
// this [project] table, per the specification's mapping. A preview: backends
// differ in field order and in how they combine markers.
function coreMetadata(p, { normName, deps, extras, licenseExpression, readmeType, dynamic }) {
  const out = [["Metadata-Version", licenseExpression || has(p, "license-files") ? "2.4" : "2.1 or later (backend's choice)"]];
  const push = (k, v) => out.push([k, v]);
  if (typeof p.name === "string") push("Name", p.name);
  if (typeof p.version === "string") push("Version", parseVersion(p.version)?.normalized ?? p.version);
  for (const d of dynamic) push("Dynamic", d === "version" ? "(Version is filled in by the backend)" : d);
  if (typeof p.description === "string") push("Summary", p.description.replace(/\s*[\r\n]+\s*/g, " "));
  const people = (role, field) => {
    if (!Array.isArray(p[role])) return;
    const names = p[role].filter((x) => isTable(x) && typeof x.name === "string" && typeof x.email !== "string").map((x) => x.name);
    const emails = p[role].filter((x) => isTable(x) && typeof x.email === "string").map((x) => (typeof x.name === "string" ? `${x.name} <${x.email}>` : x.email));
    if (names.length) push(field, names.join(", "));
    if (emails.length) push(field + "-email", emails.join(", "));
  };
  people("authors", "Author");
  people("maintainers", "Maintainer");
  if (licenseExpression) push("License-Expression", licenseExpression);
  else if (isTable(p.license) && typeof p.license.text === "string") push("License", p.license.text.split("\n")[0] + (p.license.text.includes("\n") ? " ..." : ""));
  if (Array.isArray(p["license-files"])) for (const g of p["license-files"]) push("License-File", `(each file matching ${g})`);
  if (Array.isArray(p.keywords)) push("Keywords", p.keywords.join(","));
  if (Array.isArray(p.classifiers)) for (const c of p.classifiers) push("Classifier", c);
  if (isTable(p.urls)) for (const [k, v] of Object.entries(p.urls)) push("Project-URL", `${k}, ${v}`);
  if (typeof p["requires-python"] === "string") push("Requires-Python", p["requires-python"]);
  const bare = (d) => d.raw.split(";")[0].trim();
  const markerText = (d) => (d.raw.includes(";") ? d.raw.slice(d.raw.indexOf(";") + 1).trim() : "");
  for (const d of deps) push("Requires-Dist", d.raw.trim());
  for (const [ex, list] of Object.entries(extras)) {
    const n = canonicalName(ex);
    push("Provides-Extra", n);
    for (const d of list) {
      const m = markerText(d);
      push("Requires-Dist", `${bare(d)}; ${m ? `(${m}) and ` : ""}extra == "${n}"`);
    }
  }
  if (readmeType) push("Description-Content-Type", readmeType);
  if (has(p, "readme")) push("(body)", "the readme text follows the headers");
  return { fields: out, text: out.map(([k, v]) => `${k}: ${v}`).join("\n"), note: normName ? `Wheel file name starts ${normName.replace(/-/g, "_")}-` : null };
}

export const EXAMPLE = `[build-system]
requires = ["setuptools>=61"]
build-backend = "hatchling.build"

[project]
name = "Acme_Widgets"
version = "v1.4"
description = "Widgets for Acme.\\nNow with gadgets."
readme = "README.txt"
requires-python = ">=3.8,<3.13"
license = "MIT License"
authors = [{ name = "Ada Lovelace, Charles Babbage", email = "ada@example" }]
classifiers = [
  "License :: OSI Approved :: MIT License",
  "Programming Language :: Python :: 3.7",
  "Programming Language :: Python :: 3.12",
  "Topic :: Software Development :: Widgets",
]
dependencies = [
  "requests ^2.31",
  "pywin32>=306; sys_platform == 'windows'",
  "acme-core @ git+https://github.com/acme/acme-core@v2",
]
homepage = "https://acme.example"

[project.optional-dependencies]
Dev_Tools = ["pytest>=8"]

[project.scripts]
acme = "acme_widgets.cli"
`;
