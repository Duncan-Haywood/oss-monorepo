// Zero-dependency, deterministic diff between an .env.example file's
// declared variable names and the environment-variable names actually
// referenced in a set of source files. No filesystem or network access here
// -- callers (cli.mjs for the CLI, index.html for the browser page) supply
// plain text; this module only parses strings and compares sets.
//
// This is a linter, not a secrets scanner: it never reads or reports the
// *value* on either side, only variable *names*.

// Each pattern's capture group is the variable name. Matched line by line
// (not across a whole file) because every one of these call shapes fits on
// one line in real code, and line-by-line keeps the match trivially
// explainable and the false-positive rate near zero.
const LANGUAGE_PATTERNS = [
  { language: "JavaScript / TypeScript", example: "process.env.FOO", regex: /process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g },
  { language: "JavaScript / TypeScript", example: 'process.env["FOO"]', regex: /process\.env\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g },
  { language: "Python", example: 'os.getenv("FOO")', regex: /os\.getenv\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g },
  { language: "Python", example: 'os.environ["FOO"]', regex: /os\.environ\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g },
  { language: "Python", example: 'os.environ.get("FOO")', regex: /os\.environ\.get\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g },
  { language: "Ruby", example: 'ENV["FOO"]', regex: /ENV\[\s*["']([A-Za-z_][A-Za-z0-9_]*)["']\s*\]/g },
  { language: "Ruby", example: 'ENV.fetch("FOO")', regex: /ENV\.fetch\(\s*["']([A-Za-z_][A-Za-z0-9_]*)["']/g },
  { language: "Java", example: 'System.getenv("FOO")', regex: /System\.getenv\(\s*"([A-Za-z_][A-Za-z0-9_]*)"\s*\)/g },
];

// One row per language for the docs table -- collapsed from LANGUAGE_PATTERNS
// so the page doesn't have to repeat "JavaScript / TypeScript" four times.
export const CHECKED_LANGUAGES = [...new Set(LANGUAGE_PATTERNS.map((p) => p.language))].map((language) => ({
  language,
  examples: LANGUAGE_PATTERNS.filter((p) => p.language === language).map((p) => p.example).join(", "),
}));

const DECLARATION = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

/**
 * Parses an .env.example-style file into a Map of declared variable name ->
 * { line }. Blank lines and lines starting with `#` (after trimming) are
 * skipped; an optional leading `export ` is tolerated. The *value* after `=`
 * is never read or returned.
 */
export function parseExampleFile(text) {
  const declared = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const match = DECLARATION.exec(line);
    if (match && !declared.has(match[1])) declared.set(match[1], { line: i + 1 });
  });
  return declared;
}

/**
 * Scans one source file's text for environment-variable read patterns.
 * Returns a Map of variable name -> array of { file, line } occurrences.
 */
export function scanSource(text, filename = "") {
  const referenced = new Map();
  const lines = String(text ?? "").split(/\r?\n/);
  for (const { regex } of LANGUAGE_PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    lines.forEach((line, i) => {
      let match;
      while ((match = re.exec(line))) {
        const name = match[1];
        if (!referenced.has(name)) referenced.set(name, []);
        referenced.get(name).push({ file: filename, line: i + 1 });
        if (match.index === re.lastIndex) re.lastIndex += 1; // guard zero-width match loops
      }
    });
  }
  return referenced;
}

/** Merges several scanSource() results (e.g. one per file) into one Map. */
export function mergeReferenced(maps) {
  const merged = new Map();
  for (const map of maps) {
    for (const [name, occurrences] of map) {
      if (!merged.has(name)) merged.set(name, []);
      merged.get(name).push(...occurrences);
    }
  }
  return merged;
}

/**
 * Compares declared (from parseExampleFile) against referenced (from
 * scanSource/mergeReferenced) and returns:
 *   missing -- referenced in code, absent from the example file (the bug
 *              that crashes a fresh clone right after install)
 *   unused  -- declared in the example file, referenced nowhere scanned
 *              (stale onboarding documentation)
 *   matched -- declared and referenced; present on both sides
 */
export function diffEnv({ declared, referenced }) {
  const missing = [];
  for (const [name, occurrences] of referenced) {
    if (!declared.has(name)) missing.push({ name, occurrences });
  }
  missing.sort((a, b) => a.name.localeCompare(b.name));

  const unused = [...declared.keys()].filter((name) => !referenced.has(name)).sort();
  const matched = [...declared.keys()].filter((name) => referenced.has(name)).sort();

  return { missing, unused, matched };
}

export function summarize(report) {
  if (report.missing.length === 0 && report.unused.length === 0) {
    return {
      status: "ok",
      text: report.matched.length > 0
        ? `${report.matched.length} variable(s) match -- nothing missing, nothing stale.`
        : "No environment-variable reads found in the scanned source, and the example file declares none.",
    };
  }
  if (report.missing.length > 0) {
    return {
      status: "missing",
      text: `${report.missing.length} variable(s) read in code but missing from the example file` +
        (report.unused.length > 0 ? `, and ${report.unused.length} declared but never read.` : "."),
    };
  }
  return {
    status: "unused",
    text: `${report.unused.length} variable(s) declared in the example file but never read anywhere scanned.`,
  };
}
