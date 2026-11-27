// Detects the patterns behind common WordPress.org plugin-directory review
// rejections and warnings: a readme.txt "Stable tag" that does not match the
// main plugin file's own "Version" header, missing readme.txt/plugin-header
// fields the directory expects, a $_GET/$_POST/$_REQUEST/$_COOKIE/$_SERVER
// value echoed with no escaping function on the same line, and $_POST
// processing with no nonce-verification call anywhere in the file.
//
// Field names and the escaping/nonce function lists are reproduced from
// WordPress.org's own published plugin-developer documentation ("Plugin
// Header requirements", "How Your readme.txt Works", "Detailed Plugin
// Guidelines", "Security -- Data Validation") as of 2026-09. WordPress can
// add, rename, or reinterpret any of these at any time -- this is evidence of
// what the code and metadata say today, not a determination that Plugin
// Review will pass. Re-check against
// https://developer.wordpress.org/plugins/wordpress-org/ before relying on
// it for a submission.
//
// Runs entirely on file contents already in memory -- no network access, so
// the same module works unmodified from the CLI (check.mjs, reading from
// disk) and the browser tool (index.html, reading File objects the visitor
// picked).

// readme.txt fields the Plugin Directory's own readme parser reads. License
// is required: Plugin Check errors with no_license when it is missing
// (Plugin_Readme_Check::check_license), and a GPL-compatible licence is the
// directory's first guideline. Stable tag is what the directory serves.
// License URI is optional in the readme docs and Plugin Check does not check
// it, so it is reported as recommended (quality audit
// 2026-11-26-wordpress-plugin-review-check, defect 4). The other recommended
// fields are what every accepted plugin carries; their absence is a common
// first-review note, not a block, so they do not count toward `ok`.
export const REQUIRED_README_FIELDS = [
  { key: 'stableTag', label: 'Stable tag', pattern: /^Stable tag:\s*(.+)$/im },
  { key: 'license', label: 'License', pattern: /^License:\s*(.+)$/im },
];

export const RECOMMENDED_README_FIELDS = [
  { key: 'licenseUri', label: 'License URI', pattern: /^License URI:\s*(.+)$/im },
  { key: 'contributors', label: 'Contributors', pattern: /^Contributors:\s*(.+)$/im },
  { key: 'tags', label: 'Tags', pattern: /^Tags:\s*(.+)$/im },
  { key: 'requiresAtLeast', label: 'Requires at least', pattern: /^Requires at least:\s*(.+)$/im },
  { key: 'testedUpTo', label: 'Tested up to', pattern: /^Tested up to:\s*(.+)$/im },
];

/**
 * @param {string|null|undefined} text readme.txt contents, or null if none
 *   was supplied.
 */
export function parseReadme(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      found: false,
      headers: {},
      missingRequired: REQUIRED_README_FIELDS.map((f) => f.key),
      missingRecommended: RECOMMENDED_README_FIELDS.map((f) => f.key),
    };
  }
  const headers = {};
  const missingRequired = [];
  const missingRecommended = [];
  for (const f of REQUIRED_README_FIELDS) {
    const m = text.match(f.pattern);
    if (m) headers[f.key] = m[1].trim();
    else missingRequired.push(f.key);
  }
  for (const f of RECOMMENDED_README_FIELDS) {
    const m = text.match(f.pattern);
    if (m) headers[f.key] = m[1].trim();
    else missingRecommended.push(f.key);
  }
  return { found: true, headers, missingRequired, missingRecommended };
}

// Main plugin file header block: a comment (usually `/** ... */`) at the top
// of the file WordPress core parses with `get_plugin_data()`. "Plugin Name"
// is the one field WordPress will not list the plugin in the Plugins screen
// without; "Version" is what the Stable tag cross-check below needs and what
// WordPress uses to detect an available update.
export const REQUIRED_PLUGIN_HEADER_FIELDS = [
  { key: 'pluginName', label: 'Plugin Name', pattern: /^(?:[ \t]*[*/]*[ \t]*)Plugin Name:\s*(.+)$/im },
  { key: 'version', label: 'Version', pattern: /^(?:[ \t]*[*/]*[ \t]*)Version:\s*(.+)$/im },
  // Plugin Check errors with plugin_header_no_license when this is missing
  // (Plugin_Header_Fields_Check).
  { key: 'license', label: 'License', pattern: /^(?:[ \t]*[*/]*[ \t]*)License:\s*(.+)$/im },
];

export const RECOMMENDED_PLUGIN_HEADER_FIELDS = [
  { key: 'requiresAtLeast', label: 'Requires at least', pattern: /^(?:[ \t]*[*/]*[ \t]*)Requires at least:\s*(.+)$/im },
  { key: 'requiresPHP', label: 'Requires PHP', pattern: /^(?:[ \t]*[*/]*[ \t]*)Requires PHP:\s*(.+)$/im },
  { key: 'textDomain', label: 'Text Domain', pattern: /^(?:[ \t]*[*/]*[ \t]*)Text Domain:\s*(.+)$/im },
];

const PLUGIN_NAME_LINE = /^[ \t]*[*/]*[ \t]*Plugin Name:\s*.+$/im;

/**
 * Finds the file in `files` that carries a plugin header block, if any.
 * WordPress reads the *first* header comment it finds in a plugin's PHP
 * files, so the first match in file order wins here too.
 *
 * @param {{path: string, content: string}[]} files
 */
export function findPluginHeaderFile(files) {
  for (const file of files) {
    if (typeof file.content === 'string' && PLUGIN_NAME_LINE.test(file.content)) return file;
  }
  return null;
}

/**
 * @param {{path: string, content: string}|null} file
 */
export function parsePluginHeader(file) {
  if (!file) {
    return {
      found: false,
      path: null,
      headers: {},
      missingRequired: REQUIRED_PLUGIN_HEADER_FIELDS.map((f) => f.key),
      missingRecommended: RECOMMENDED_PLUGIN_HEADER_FIELDS.map((f) => f.key),
    };
  }
  const headers = {};
  const missingRequired = [];
  const missingRecommended = [];
  for (const f of REQUIRED_PLUGIN_HEADER_FIELDS) {
    const m = file.content.match(f.pattern);
    if (m) headers[f.key] = m[1].trim();
    else missingRequired.push(f.key);
  }
  for (const f of RECOMMENDED_PLUGIN_HEADER_FIELDS) {
    const m = file.content.match(f.pattern);
    if (m) headers[f.key] = m[1].trim();
    else missingRecommended.push(f.key);
  }
  return { found: true, path: file.path, headers, missingRequired, missingRecommended };
}

// PHP functions that turn raw output safe to print. Reproduced from
// WordPress core's own escaping API (esc_*), the sanitization API
// (sanitize_*), and the common scalar casts (absint/intval/floatval) --
// wordpress.org's plugin-review guidance treats any of these as "this value
// was made safe" for output purposes.
const ESCAPING_FUNCTIONS = /\b(?:esc_html(?:_e|_x)?|esc_attr(?:_e|_x)?|esc_url(?:_raw)?|esc_js|esc_textarea|esc_xml|wp_kses(?:_post|_data)?|sanitize_text_field|sanitize_key|sanitize_email|sanitize_file_name|sanitize_html_class|absint|intval|floatval|boolval|wp_json_encode|rawurlencode|number_format(?:_i18n)?)\s*\(/;
const OUTPUT_STATEMENT = /\b(?:echo|print|printf)\b/;
const SUPERGLOBAL = /\$_(?:GET|POST|REQUEST|COOKIE|SERVER)\b/;

/**
 * Lines that print a superglobal value with no escaping function called on
 * the same line. This is a line-level heuristic, not a data-flow analysis --
 * see the module doc and the README for what that does and does not catch.
 *
 * @param {{path: string, content: string}[]} files
 */
export function detectUnescapedOutput(files) {
  const findings = [];
  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const lines = file.content.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (OUTPUT_STATEMENT.test(line) && SUPERGLOBAL.test(line) && !ESCAPING_FUNCTIONS.test(line)) {
        findings.push({ path: file.path, line: i + 1, snippet: line.trim().slice(0, 160) });
      }
    }
  }
  return findings;
}

// Functions that verify a WordPress nonce. Reproduced from WP core's nonce
// API as of 2026-09.
const NONCE_CHECK_FUNCTIONS = /\b(?:check_admin_referer|check_ajax_referer|wp_verify_nonce)\s*\(/;
const POST_USAGE = /\$_POST\b/;

/**
 * Files that read `$_POST` anywhere but call no nonce-verification function
 * anywhere in the same file. File-level, not flow-level: a nonce check in one
 * function does not prove the `$_POST` read in another is guarded, and a
 * check that exists is not proof it runs before the read it is meant to
 * guard -- see the README's "what this is and isn't".
 *
 * @param {{path: string, content: string}[]} files
 */
export function detectMissingNonceChecks(files) {
  const findings = [];
  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    if (!POST_USAGE.test(file.content)) continue;
    if (NONCE_CHECK_FUNCTIONS.test(file.content)) continue;
    const lines = file.content.split(/\r\n|\r|\n/);
    const firstLine = lines.findIndex((l) => POST_USAGE.test(l));
    findings.push({
      path: file.path,
      line: firstLine + 1,
      snippet: (lines[firstLine] ?? '').trim().slice(0, 160),
    });
  }
  return findings;
}

// Licence checks. Plugin Check (WordPress/plugin-check, read 2026-11-27)
// raises three licence errors once both licences are present:
//   - readme licence not an SPDX-style identifier  -> invalid_license
//   - header licence not GPL-compatible            -> plugin_header_invalid_license
//   - readme and header name different licences    -> license_mismatch
// This is our own implementation of those outcomes, not a copy of Plugin
// Check's code (which is GPL; this venture is FSL-1.1-MIT): licences are
// reduced to a family and major version, and the compatible families are
// those the FSF lists as GPL-compatible
// (https://www.gnu.org/licenses/license-list.html). Before this, any
// License value passed (quality audit
// 2026-11-26-wordpress-plugin-review-check, defect 1).

// [family key, pattern on the lowercased text, GPL-compatible]. Order
// matters: the narrower families come before the ones they contain.
const LICENSE_FAMILIES = [
  ['AGPL', /\bagpl(?:v?\d|\b)|affero/, true],
  ['LGPL', /\blgpl(?:v?\d|\b)|lesser general public|library general public/, true],
  ['GPL', /\bgpl(?:v?\d|\b)|gnu general public|^gnu\b/, true],
  ['EUPL', /\beupl(?:v?\d|\b)|european union public/, true],
  ['MPL', /\bmpl(?:v?\d|\b)|mozilla public/, true],
  ['Apache', /\bapache\b/, true],
  ['MIT', /\bmit\b|\bexpat\b/, true],
  ['BSD', /\bbsd\b/, true],
  ['ISC', /\bisc\b/, true],
  ['CC0', /\bcc0\b/, true],
  ['Unlicense', /\bunlicense\b/, true],
  ['WTFPL', /\bwtfpl\b|do what the f\S* you want/, true],
  ['Zlib', /\bzlib\b/, true],
  ['Artistic', /\bartistic\b/, true],
  ['BlueOak', /blue\s*oak/, true],
  ['OpenLDAP', /\bopenldap\b/, true],
];

/**
 * Reduces a licence string to a comparable form: "GPL2", "GPL3", "MIT",
 * "Apache2" ... for a known family, otherwise the trimmed text with spaces
 * collapsed. "or later", "+", "-or-later", "-only" and licence URLs are
 * ignored, so "GPLv2 or later" and "GPL-2.0-or-later" compare equal, as they
 * do in Plugin Check.
 */
export function normalizeLicense(license) {
  const raw = String(license ?? '').trim().replace(/\s+/g, ' ').replace(/\.$/, '');
  const text = raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(?:\s+or\s+later|-or-later|-only|\+)\s*$/g, '')
    .trim();
  for (const [family, pattern] of LICENSE_FAMILIES) {
    if (!pattern.test(text)) continue;
    const version = text.match(/(\d+)(?:\.\d+)*/);
    if (family === 'BSD') {
      if (/\b3\b|3-clause|new|modified|revised/.test(text)) return 'BSD3';
      if (/\b2\b|2-clause|simplified|freebsd/.test(text)) return 'BSD2';
      return 'BSD';
    }
    const versioned = ['AGPL', 'LGPL', 'GPL', 'EUPL', 'MPL', 'Apache', 'Artistic'].includes(family);
    return versioned && version ? `${family}${version[1]}` : family;
  }
  return raw;
}

/** SPDX-style shape: one token of letters, digits, ".", "-", "+", or several joined by " or ". */
export function isValidLicenseIdentifier(normalized) {
  return /^[a-z0-9.+-]+(?: or [a-z0-9.+-]+)*$/i.test(normalized);
}

const COMPATIBLE = new Set(LICENSE_FAMILIES.filter(([, , ok]) => ok).map(([f]) => f));
// Versions the FSF lists as incompatible with every GPL version.
const INCOMPATIBLE_VERSIONS = new Set(['MPL1', 'Apache1', 'Artistic1', 'EUPL1']);

/** True for a normalised licence in a GPL-compatible family and version. */
export function isGplCompatibleLicense(normalized) {
  if (INCOMPATIBLE_VERSIONS.has(normalized)) return false;
  const family = normalized.replace(/\d+$/, '');
  return COMPATIBLE.has(family) || COMPATIBLE.has(normalized);
}

/**
 * The licence problems Plugin Check would report, as codes in its own names.
 * Missing fields are reported by the required-field lists, not here.
 */
export function checkLicenses(readmeLicense, headerLicense) {
  const issues = [];
  const readme = readmeLicense ? normalizeLicense(readmeLicense) : '';
  const header = headerLicense ? normalizeLicense(headerLicense) : '';
  if (readmeLicense && !isValidLicenseIdentifier(readme)) {
    issues.push({ code: 'invalid_license', where: 'readme.txt', value: String(readmeLicense).trim() });
  }
  if (headerLicense && !isGplCompatibleLicense(header)) {
    issues.push({ code: 'plugin_header_invalid_license', where: 'plugin header', value: String(headerLicense).trim() });
  }
  if (readme && header && readme !== header) {
    issues.push({
      code: 'license_mismatch',
      where: 'readme.txt and plugin header',
      value: `${String(readmeLicense).trim()} vs ${String(headerLicense).trim()}`,
    });
  }
  return issues;
}

const README_FIELD_LABEL = new Map(
  [...REQUIRED_README_FIELDS, ...RECOMMENDED_README_FIELDS].map((f) => [f.key, f.label]),
);
const HEADER_FIELD_LABEL = new Map(
  [...REQUIRED_PLUGIN_HEADER_FIELDS, ...RECOMMENDED_PLUGIN_HEADER_FIELDS].map((f) => [f.key, f.label]),
);

/**
 * Combines every check above into one report.
 *
 * @param {{
 *   readme: ReturnType<typeof parseReadme>,
 *   pluginHeader: ReturnType<typeof parsePluginHeader>,
 *   unescapedOutput: ReturnType<typeof detectUnescapedOutput>,
 *   missingNonceChecks: ReturnType<typeof detectMissingNonceChecks>,
 * }} input
 */
export function buildReport({ readme, pluginHeader, unescapedOutput, missingNonceChecks }) {
  let stableTagStatus = 'not-checked';
  let stableTagMismatch = null;
  const stable = readme.headers.stableTag;
  const version = pluginHeader.headers.version;
  if (stable && version) {
    if (stable.trim().toLowerCase() === 'trunk') {
      // "Stable tag: trunk" serves the SVN trunk instead of a tagged release.
      // Plugin Check reports it as an error (trunk_stable_tag in
      // Plugin_Readme_Check::check_stable_tag) and the readme docs ask for a
      // tagged version, so it fails `ok` like a mismatch does (quality audit
      // 2026-11-26-wordpress-plugin-review-check, defect 1).
      stableTagStatus = 'trunk';
    } else if (stable.trim() !== version.trim()) {
      stableTagStatus = 'mismatch';
      stableTagMismatch = { stableTag: stable.trim(), pluginVersion: version.trim() };
    } else {
      stableTagStatus = 'match';
    }
  }

  const missingRequiredReadme = readme.found
    ? readme.missingRequired.map((k) => README_FIELD_LABEL.get(k))
    : [];
  const missingRecommendedReadme = readme.found
    ? readme.missingRecommended.map((k) => README_FIELD_LABEL.get(k))
    : [];
  const missingRequiredHeader = pluginHeader.found
    ? pluginHeader.missingRequired.map((k) => HEADER_FIELD_LABEL.get(k))
    : [];
  const missingRecommendedHeader = pluginHeader.found
    ? pluginHeader.missingRecommended.map((k) => HEADER_FIELD_LABEL.get(k))
    : [];

  const licenseIssues = checkLicenses(
    readme.found ? readme.headers.license : null,
    pluginHeader.found ? pluginHeader.headers.license : null,
  );

  const ok =
    readme.found &&
    pluginHeader.found &&
    stableTagStatus !== 'mismatch' &&
    stableTagStatus !== 'trunk' &&
    missingRequiredReadme.length === 0 &&
    missingRequiredHeader.length === 0 &&
    licenseIssues.length === 0 &&
    unescapedOutput.length === 0 &&
    missingNonceChecks.length === 0;

  return {
    readmeFound: readme.found,
    pluginHeaderFound: pluginHeader.found,
    pluginHeaderPath: pluginHeader.path,
    stableTagStatus,
    stableTagMismatch,
    missingRequiredReadme,
    missingRecommendedReadme,
    missingRequiredHeader,
    missingRecommendedHeader,
    licenseIssues,
    unescapedOutput,
    missingNonceChecks,
    ok,
  };
}
