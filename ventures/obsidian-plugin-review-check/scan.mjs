// Detects the patterns behind common Obsidian community-plugin review delays:
// a manifest.json left with the sample-plugin template's own placeholder
// values, a manifest version with no matching entry in versions.json (the
// release-visibility mechanism Obsidian's own release docs describe), and the
// two JavaScript/TypeScript source patterns Obsidian's developer guidelines
// name explicitly -- innerHTML/outerHTML/insertAdjacentHTML assignment (a
// cross-site-scripting risk their security guidance calls out by name) and a
// direct document/window event listener that skips the Component API's
// auto-cleanup (registerDomEvent) -- plus a leftover console.log left in
// source, a common review note on its own.
//
// Field names and the manifest/versions.json mechanism are reproduced from
// Obsidian's own published developer documentation (docs.obsidian.md:
// "Manifest", "Release your plugin", "Submit your plugin",
// "Understand the plugin guidelines") as of 2026-09. Obsidian can add, rename,
// or reinterpret any of these at any time -- this is evidence of what the
// manifest and source say today, not a determination that a community-plugin
// submission will be approved. Re-check against
// https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines before relying
// on it for a submission.
//
// Runs entirely on file contents already in memory -- no network access, so
// the same module works unmodified from the CLI (check.mjs, reading from
// disk) and the browser tool (index.html, reading File objects the visitor
// picked).

// manifest.json fields Obsidian's own "Manifest" reference
// (docs.obsidian.md/Reference/Manifest, read 2026-11-18) marks **Yes** under
// Required. `isDesktopOnly` is a required *boolean* there, so it is checked
// apart from the string fields (quality audit 2026-11-17, defect 1: it used
// to be reported as optional). `authorUrl` and `fundingUrl` are optional.
export const MANIFEST_REQUIRED_FIELDS = ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly'];
export const MANIFEST_REQUIRED_BOOLEAN_FIELDS = ['isDesktopOnly'];
export const MANIFEST_RECOMMENDED_FIELDS = ['authorUrl', 'fundingUrl'];

/**
 * Value rules the same "Manifest" reference states for a plugin:
 *   - `id`: "must contain only lowercase letters and hyphens, can't end with
 *     `plugin`, and can't contain `obsidian`". Digits are accepted here too:
 *     many listed plugin ids carry them, so flagging them would be noise.
 *   - `name`: "Do not include the word 'Obsidian'" and "plugins may not
 *     contain the word 'Plugin'".
 *   - `version`: "Semantic Versioning ... in the format `x.y.z`".
 * Quality audit 2026-11-17, defect 2: a manifest breaking all of these used
 * to report clean. Each violation fails the check.
 *
 * @param {Record<string, unknown>|null} data
 * @returns {{field: string, value: string, rule: string}[]}
 */
export function manifestRuleViolations(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  const str = (k) => (typeof data[k] === 'string' ? data[k].trim() : null);
  const id = str('id');
  if (id) {
    if (!/^[a-z0-9-]+$/.test(id)) out.push({ field: 'id', value: id, rule: 'must contain only lowercase letters (and digits) and hyphens' });
    if (/obsidian/i.test(id)) out.push({ field: 'id', value: id, rule: "can't contain \"obsidian\"" });
    if (/plugin$/i.test(id)) out.push({ field: 'id', value: id, rule: "can't end with \"plugin\"" });
  }
  const name = str('name');
  if (name) {
    if (/obsidian/i.test(name)) out.push({ field: 'name', value: name, rule: 'must not include the word "Obsidian"' });
    if (/plugin/i.test(name)) out.push({ field: 'name', value: name, rule: 'plugins may not contain the word "Plugin"' });
  }
  const version = str('version');
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    out.push({ field: 'version', value: version, rule: 'must be x.y.z (Semantic Versioning, no "v" prefix or suffix)' });
  }
  for (const key of MANIFEST_REQUIRED_BOOLEAN_FIELDS) {
    if (data[key] !== undefined && typeof data[key] !== 'boolean') {
      out.push({ field: key, value: String(data[key]), rule: 'must be true or false (a JSON boolean, not a string)' });
    }
  }
  return out;
}

// The exact placeholder values the official `obsidian-sample-plugin` GitHub
// template ships with. A community-plugin submission that still carries any
// of these has not customized the template it was generated from -- a
// leftover reviewers name explicitly.
export const SAMPLE_PLUGIN_DEFAULTS = {
  id: 'sample-plugin',
  name: 'Sample Plugin',
  description: 'Demonstrates some of the capabilities of the Obsidian API.',
  author: 'Obsidian',
};

/**
 * @param {string|null|undefined} text manifest.json contents, or null/absent.
 */
export function parseManifest(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      found: false,
      data: null,
      parseError: false,
      missingRequired: [...MANIFEST_REQUIRED_FIELDS],
      missingRecommended: [...MANIFEST_RECOMMENDED_FIELDS],
    };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return {
      found: true,
      data: null,
      parseError: true,
      missingRequired: [...MANIFEST_REQUIRED_FIELDS],
      missingRecommended: [...MANIFEST_RECOMMENDED_FIELDS],
    };
  }
  const missingRequired = MANIFEST_REQUIRED_FIELDS.filter((key) =>
    MANIFEST_REQUIRED_BOOLEAN_FIELDS.includes(key)
      ? data?.[key] === undefined || data?.[key] === null
      : typeof data?.[key] !== 'string' || data[key].trim() === '',
  );
  const missingRecommended = MANIFEST_RECOMMENDED_FIELDS.filter((key) => data?.[key] === undefined);
  return { found: true, data, parseError: false, missingRequired, missingRecommended };
}

/**
 * @param {string|null|undefined} text versions.json contents, or null/absent.
 */
export function parseVersions(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { found: false, data: null, parseError: false };
  }
  try {
    const data = JSON.parse(text);
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      return { found: true, data: null, parseError: true };
    }
    return { found: true, data, parseError: false };
  } catch {
    return { found: true, data: null, parseError: true };
  }
}

/**
 * Which of the sample-plugin template's own placeholder values are still
 * present, verbatim, in a parsed manifest.
 *
 * @param {Record<string, unknown>|null} manifestData
 */
export function detectSamplePluginDefaults(manifestData) {
  if (!manifestData) return [];
  return Object.entries(SAMPLE_PLUGIN_DEFAULTS)
    .filter(([field, value]) => manifestData[field] === value)
    .map(([field, value]) => ({ field, value }));
}

/**
 * Whether the manifest's own `version` has a matching key in versions.json --
 * the mechanism Obsidian's release documentation describes for how an
 * installed app decides a release is compatible. A version missing here is a
 * plugin that will not show as updatable to some or all users even though it
 * was tagged and released.
 *
 * @param {Record<string, unknown>|null} manifestData
 * @param {Record<string, unknown>|null} versionsData
 */
export function checkVersionsEntry(manifestData, versionsData) {
  const version = typeof manifestData?.version === 'string' ? manifestData.version.trim() : null;
  if (!version || !versionsData) return { status: 'not-checked', version };
  if (Object.prototype.hasOwnProperty.call(versionsData, version)) {
    return { status: 'present', version, minAppVersion: versionsData[version] };
  }
  return { status: 'missing', version };
}

const UNSAFE_DOM_ASSIGNMENT = /\.\s*(?:innerHTML|outerHTML)\s*\+?=(?!=)/;
const UNSAFE_DOM_CALL = /\.\s*insertAdjacentHTML\s*\(/;
const GLOBAL_LISTENER = /\b(?:document|window)\.addEventListener\s*\(/;
const CONSOLE_LOG = /\bconsole\.log\s*\(/;

/** Strips `//` and `/* *\/` comments and string-literal contents from a line
 * of JS/TS well enough to avoid flagging a code example inside a comment or a
 * string -- a heuristic, not a parser, same tradeoff every other line-level
 * scanner in this portfolio makes. */
function stripCommentsAndStrings(line) {
  return line
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/\/\/.*$/, '');
}

function scanLines(files, pattern) {
  const findings = [];
  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const lines = file.content.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      const stripped = stripCommentsAndStrings(lines[i]);
      if (pattern.test(stripped)) {
        findings.push({ path: file.path, line: i + 1, snippet: lines[i].trim().slice(0, 160) });
      }
    }
  }
  return findings;
}

/**
 * Lines assigning `.innerHTML`/`.outerHTML` or calling `.insertAdjacentHTML(`
 * -- the cross-site-scripting pattern Obsidian's own developer guidelines
 * name explicitly, recommending the DOM API or Obsidian's `createEl` family
 * instead. A line-level heuristic: it cannot confirm the assigned value is
 * actually untrusted, only that the API known to be risky was used.
 *
 * @param {{path: string, content: string}[]} files
 */
export function detectUnsafeDom(files) {
  const assignments = scanLines(files, UNSAFE_DOM_ASSIGNMENT);
  const calls = scanLines(files, UNSAFE_DOM_CALL);
  return [...assignments, ...calls].sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}

/**
 * Lines calling `document.addEventListener(`/`window.addEventListener(`
 * directly. Informational, not a blocking finding: Obsidian's `Component`
 * API's `registerDomEvent` removes the listener automatically when a plugin
 * unloads, which a direct call does not -- but a direct call paired with its
 * own manual cleanup is not wrong, and this scan cannot tell the two apart.
 *
 * @param {{path: string, content: string}[]} files
 */
export function detectGlobalListeners(files) {
  return scanLines(files, GLOBAL_LISTENER);
}

/**
 * Leftover `console.log(` calls. Informational: debug logging left in a
 * shipped build is a common first-review note, not a documented rejection
 * cause on its own.
 *
 * @param {{path: string, content: string}[]} files
 */
export function detectConsoleLog(files) {
  return scanLines(files, CONSOLE_LOG);
}

/**
 * Combines every check above into one report.
 *
 * @param {{
 *   manifest: ReturnType<typeof parseManifest>,
 *   versions: ReturnType<typeof parseVersions>,
 *   samplePluginDefaults: ReturnType<typeof detectSamplePluginDefaults>,
 *   versionsEntry: ReturnType<typeof checkVersionsEntry>,
 *   unsafeDom: ReturnType<typeof detectUnsafeDom>,
 *   globalListeners: ReturnType<typeof detectGlobalListeners>,
 *   consoleLog: ReturnType<typeof detectConsoleLog>,
 * }} input
 */
export function buildReport({
  manifest,
  versions,
  samplePluginDefaults,
  versionsEntry,
  unsafeDom,
  globalListeners,
  consoleLog,
}) {
  const manifestRules = manifest.found && !manifest.parseError ? manifestRuleViolations(manifest.data) : [];
  const ok =
    manifest.found &&
    !manifest.parseError &&
    manifest.missingRequired.length === 0 &&
    manifestRules.length === 0 &&
    samplePluginDefaults.length === 0 &&
    versionsEntry.status === 'present' &&
    unsafeDom.length === 0;

  // Gated on a found, parseable manifest -- same reasoning as the required
  // list: reporting "recommended fields missing" on top of "no manifest.json
  // found at all" or "manifest.json is not valid JSON" is a confusing
  // restatement of the same fact, not new information.
  const manifestUsable = manifest.found && !manifest.parseError;

  return {
    manifestFound: manifest.found,
    manifestParseError: manifest.parseError,
    missingRequiredManifest: manifestUsable ? manifest.missingRequired : [],
    missingRecommendedManifest: manifestUsable ? manifest.missingRecommended : [],
    versionsFound: versions.found,
    versionsParseError: versions.parseError,
    manifestRules,
    samplePluginDefaults,
    versionsEntry,
    unsafeDom,
    globalListeners,
    consoleLog,
    ok,
  };
}
