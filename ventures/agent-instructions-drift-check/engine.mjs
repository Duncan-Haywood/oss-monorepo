// Zero-dependency, deterministic parser + diff for AI-coding-agent
// instruction files (AGENTS.md, CLAUDE.md, .cursorrules, .github/copilot-instructions.md,
// and similar). This module only parses strings and compares them against
// caller-supplied facts (an existence check, a package.json's scripts map) --
// it never touches the filesystem or the network. cli.mjs supplies real
// filesystem facts; index.html supplies facts the visitor's own browser
// reads locally (a folder's file names, a pasted package.json).
//
// This is a drift checker, not an advice engine: it never judges whether an
// instruction is *good*, only whether a thing it points at -- a file path, a
// named npm script, a known interpreter-mismatch shell footgun -- still
// matches what the repo actually has today.

// A file reference has to come from one of the two ways this repo's own
// instruction files actually cite a path -- a markdown link target, or an
// inline `code span` -- never bare prose, which is indistinguishable from an
// ordinary sentence ("the config lives in src") without false positives.
const MD_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;

// A token counts as a path candidate only if, once trimmed of surrounding
// punctuation, it (a) is made only of path-safe characters, (b) has a
// letter-led extension (excludes version numbers like `1.56.0` or `3.11`,
// whose "extension" starts with a digit), and (c) either contains a `/` or
// is one of the handful of bare filenames instruction files name directly
// ("read AGENTS.md and CLAUDE.md first").
const PATH_TOKEN_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*\.[A-Za-z][A-Za-z0-9]{0,6}$/;
const KNOWN_BARE_FILES = new Set([
  "README.md", "LICENSE", "LICENSE.md", "AGENTS.md", "CLAUDE.md",
  "package.json", "Makefile", "Dockerfile", "tsconfig.json", "pyproject.toml",
  ".gitignore", ".env.example",
]);

const LEADING_PUNCT = /^[("'<]+/;
const TRAILING_PUNCT = /[)"'>.,;:!?]+$/;

function isUrlLike(token) {
  return /^(https?:)?\/\//.test(token) || token.startsWith("mailto:") || token.startsWith("#");
}

/** Trims a raw token to a path candidate, or returns null if it doesn't look like one. */
function asPathCandidate(rawToken) {
  const token = rawToken.trim().replace(LEADING_PUNCT, "").replace(TRAILING_PUNCT, "");
  if (!token || isUrlLike(token)) return null;
  if (!PATH_TOKEN_RE.test(token)) return null;
  if (!token.includes("/") && !KNOWN_BARE_FILES.has(token)) return null;
  return token;
}

function addOccurrence(map, key, occurrence) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(occurrence);
}

/**
 * Extracts every file-path-shaped reference from markdown link targets and
 * inline code spans. Returns a Map of path -> [{ line, via }].
 */
export function extractFileRefs(text) {
  const refs = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, i) => {
    let m;
    const linkRe = new RegExp(MD_LINK_RE.source, MD_LINK_RE.flags);
    while ((m = linkRe.exec(line))) {
      const candidate = asPathCandidate(m[2]);
      if (candidate) addOccurrence(refs, candidate, { line: i + 1, via: "link" });
    }
    const codeRe = new RegExp(INLINE_CODE_RE.source, INLINE_CODE_RE.flags);
    while ((m = codeRe.exec(line))) {
      for (const token of m[1].split(/\s+/)) {
        const candidate = asPathCandidate(token);
        if (candidate) addOccurrence(refs, candidate, { line: i + 1, via: "code" });
      }
    }
  });
  return refs;
}

const NPM_RUN_RE = /\bnpm\s+run(?:-script)?\s+([A-Za-z0-9_:.-]+)/g;
const NPM_IMPLICIT_RE = /\bnpm\s+(test|start)\b/g;

/** Extracts every `npm run <script>` / `npm test` / `npm start` reference. Returns Map of script name -> [{ line }]. */
export function extractScriptRefs(text) {
  const refs = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, i) => {
    let m;
    const runRe = new RegExp(NPM_RUN_RE.source, NPM_RUN_RE.flags);
    while ((m = runRe.exec(line))) addOccurrence(refs, m[1], { line: i + 1 });
    const implicitRe = new RegExp(NPM_IMPLICIT_RE.source, NPM_IMPLICIT_RE.flags);
    while ((m = implicitRe.exec(line))) addOccurrence(refs, m[1], { line: i + 1 });
  });
  return refs;
}

// Known interpreter-mismatch footguns: a bare tool name that, on a machine
// with a `uv tool install` or pipx-isolated copy on PATH, silently resolves
// to an interpreter that does not have the repository's own dependencies
// installed -- passing or failing for a reason that has nothing to do with
// the code being checked. `python3 -m <tool>` always resolves against the
// same interpreter the repo's own dependencies were installed into.
const FOOTGUN_RULES = [
  {
    tool: "pytest",
    bad: /(^|[\s`])pytest\b/,
    good: /-m\s+pytest\b/,
    message: "bare `pytest` can resolve to an isolated interpreter (e.g. a `uv tool install`) missing this repo's dependencies -- prefer `python3 -m pytest`.",
  },
  {
    tool: "mypy",
    bad: /(^|[\s`])mypy\b/,
    good: /-m\s+mypy\b/,
    message: "bare `mypy` can resolve to an isolated interpreter missing this repo's stubs -- prefer `python3 -m mypy`.",
  },
];

/**
 * Scans fenced code blocks (```...```) for known interpreter-mismatch
 * footguns. Restricted to fenced blocks, not prose, because that is the one
 * place an instruction file states a command meant to be run verbatim --
 * scanning prose too would flag a sentence merely discussing pytest.
 */
export function detectFootguns(text) {
  const found = [];
  const lines = String(text ?? "").split(/\r?\n/);
  let inFence = false;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inFence = !inFence;
      return;
    }
    if (!inFence || line.startsWith("#")) return;
    for (const rule of FOOTGUN_RULES) {
      if (rule.bad.test(raw) && !rule.good.test(raw)) {
        found.push({ line: i + 1, tool: rule.tool, snippet: raw.trim(), message: rule.message });
      }
    }
  });
  return found;
}

/** Runs all three extractors over one instruction file's text. */
export function parseInstructions(text) {
  return {
    fileRefs: extractFileRefs(text),
    scriptRefs: extractScriptRefs(text),
    footguns: detectFootguns(text),
  };
}

/**
 * Compares extracted file references against a caller-supplied existence
 * check. `exists(path)` may be sync or return a boolean; it is the only way
 * this module ever learns a fact about the filesystem.
 */
export function diffFileRefs(fileRefs, exists) {
  const missing = [];
  const matched = [];
  for (const [ref, occurrences] of fileRefs) {
    if (exists(ref)) matched.push({ ref, occurrences });
    else missing.push({ ref, occurrences });
  }
  missing.sort((a, b) => a.ref.localeCompare(b.ref));
  matched.sort((a, b) => a.ref.localeCompare(b.ref));
  return { missing, matched };
}

/** Compares extracted script references against a package.json scripts map (or null if none was supplied). */
export function diffScriptRefs(scriptRefs, definedScripts) {
  if (!definedScripts) return { missing: [], matched: [], skipped: true };
  const missing = [];
  const matched = [];
  for (const [name, occurrences] of scriptRefs) {
    if (Object.prototype.hasOwnProperty.call(definedScripts, name)) matched.push({ name, occurrences });
    else missing.push({ name, occurrences });
  }
  missing.sort((a, b) => a.name.localeCompare(b.name));
  return { missing, matched, skipped: false };
}

export function summarize({ fileDiff, scriptDiff, footguns }) {
  const problems = fileDiff.missing.length + (scriptDiff.skipped ? 0 : scriptDiff.missing.length) + footguns.length;
  if (problems === 0) {
    const checked = fileDiff.matched.length + (scriptDiff.skipped ? 0 : scriptDiff.matched.length);
    return {
      status: "ok",
      text: checked > 0
        ? `${checked} reference(s) checked -- nothing broken, no known footguns.`
        : "No file or npm-script references found to check.",
    };
  }
  const parts = [];
  if (fileDiff.missing.length > 0) parts.push(`${fileDiff.missing.length} file reference(s) point at a path that does not exist`);
  if (!scriptDiff.skipped && scriptDiff.missing.length > 0) parts.push(`${scriptDiff.missing.length} npm script reference(s) are not defined in package.json`);
  if (footguns.length > 0) parts.push(`${footguns.length} known interpreter-mismatch footgun(s)`);
  return { status: "drift", text: parts.join("; ") + "." };
}
