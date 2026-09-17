// Detects use of Apple's "Required Reason API" categories in iOS/macOS source
// and cross-checks the result against a PrivacyInfo.xcprivacy manifest.
//
// Category IDs, reason codes and descriptions are reproduced from Apple's
// public developer documentation (Required Reason API, TN3183) as of
// 2026-09. Apple can add categories or reason codes at any time -- this is
// evidence of what the code and the manifest say today, not a determination
// that an app will pass App Review. Re-check against
// https://developer.apple.com/documentation/bundleresources/privacy_manifest_files/describing_use_of_required_reason_api
// before relying on it for a submission.
//
// Runs entirely on file contents already in memory -- no network access, so
// the same module works unmodified from the CLI (check.mjs, reading from
// disk) and from the browser tool (index.html, reading File objects the
// visitor picked).

export const REQUIRED_REASON_CATEGORIES = [
  {
    id: 'NSPrivacyAccessedAPICategoryFileTimestamp',
    label: 'File timestamp APIs',
    reasons: [
      { code: 'DDA9.1', description: 'Display file timestamps to the person using the device.' },
      { code: 'C617.1', description: "Access timestamps, size, or other metadata of files inside the app's container, app group container, or CloudKit container." },
      { code: '3B52.1', description: 'Access timestamps or other metadata of files or directories the user specifically granted access to (a document picker, drag-and-drop, or similar).' },
      { code: '0A2A.1', description: 'A third-party SDK wraps a file-timestamp API so the app can call it (SDK use only, not for the app itself).' },
    ],
    symbols: [
      { pattern: /\bcreationDate\b/, hint: 'creationDate' },
      { pattern: /\b\w*[Mm]odificationDate\b/, hint: 'modificationDate / contentModificationDate / fileModificationDate' },
      { pattern: /\bcontentModificationDateKey\b/, hint: 'contentModificationDateKey' },
      { pattern: /\bcreationDateKey\b/, hint: 'creationDateKey' },
      { pattern: /\bgetattrlist(bulk|at)?\s*\(/, hint: 'getattrlist() / getattrlistbulk() / getattrlistat()' },
      { pattern: /\bfgetattrlist\s*\(/, hint: 'fgetattrlist()' },
      { pattern: /\b[fl]?stat\s*\(/, hint: 'stat() / fstat() / lstat()' },
      { pattern: /\bfstatat\s*\(/, hint: 'fstatat()' },
      { pattern: /\battributesOfItem\s*\(/, hint: 'FileManager.attributesOfItem(atPath:)' },
      { pattern: /\bNSFile(Creation|Modification)Date\b/, hint: 'NSFileCreationDate / NSFileModificationDate' },
    ],
  },
  {
    id: 'NSPrivacyAccessedAPICategorySystemBootTime',
    label: 'System boot time APIs',
    reasons: [
      { code: '35F9.1', description: 'Measure the time elapsed between events within the app or SDK, or perform timer calculations. (Elapsed time may leave the device; the boot time itself may not.)' },
      { code: '8FFB.1', description: "Calculate absolute timestamps for events within the app, derived from the device's boot time." },
    ],
    symbols: [
      { pattern: /\bsystemUptime\b/, hint: 'ProcessInfo.processInfo.systemUptime' },
      { pattern: /\bmach_absolute_time\s*\(/, hint: 'mach_absolute_time()' },
    ],
  },
  {
    id: 'NSPrivacyAccessedAPICategoryDiskSpace',
    label: 'Disk space APIs',
    reasons: [
      { code: '85F4.1', description: 'Display disk space information to the person using the device.' },
      { code: 'E174.1', description: 'Check whether there is sufficient disk space to write a file, or detect a low-disk-space condition.' },
      { code: '7D9E.1', description: 'Include disk space information in a bug report the user submits from inside the app.' },
    ],
    symbols: [
      { pattern: /\bvolumeAvailableCapacity(ForImportantUsageKey|ForOpportunisticUsageKey|Key)\b/, hint: 'volumeAvailableCapacity*Key' },
      { pattern: /\bvolumeTotalCapacityKey\b/, hint: 'volumeTotalCapacityKey' },
      { pattern: /\bsystemFreeSize\b/, hint: 'systemFreeSize' },
      { pattern: /\bsystemSize\b/, hint: 'systemSize' },
      { pattern: /\bstatfs\s*\(/, hint: 'statfs()' },
      { pattern: /\bstatvfs\s*\(/, hint: 'statvfs()' },
      { pattern: /\bNSFileSystem(FreeSize|Size)\b/, hint: 'NSFileSystemFreeSize / NSFileSystemSize' },
    ],
  },
  {
    id: 'NSPrivacyAccessedAPICategoryActiveKeyboards',
    label: 'Active keyboard APIs',
    reasons: [
      { code: '3EC4.1', description: 'A custom keyboard app determines the active keyboards on the device.' },
      { code: '54BD.1', description: 'Present the user with custom UI adapted to the currently active keyboard.' },
    ],
    symbols: [
      { pattern: /\bactiveInputModes\b/, hint: 'UITextInputMode.activeInputModes' },
    ],
  },
  {
    id: 'NSPrivacyAccessedAPICategoryUserDefaults',
    label: 'User defaults APIs',
    reasons: [
      { code: 'CA92.1', description: 'Access user defaults to read and write information that is only accessible to the app itself.' },
      { code: '1C8F.1', description: 'Access user defaults to read and write information shared with the app by an App Group (App Clips, extensions, or other apps in the same group).' },
      { code: 'C56D.1', description: 'A third-party SDK wraps a UserDefaults API so the app can call it (SDK use only, not for the app itself).' },
      { code: 'AC6B.1', description: 'Read the com.apple.configuration.managed key for MDM-managed configuration, or write the com.apple.feedback.managed key to report on it.' },
    ],
    symbols: [
      { pattern: /\bUserDefaults\b/, hint: 'UserDefaults' },
      { pattern: /\bNSUserDefaults\b/, hint: 'NSUserDefaults' },
      { pattern: /@AppStorage/, hint: '@AppStorage (SwiftUI, backed by UserDefaults)' },
    ],
  },
];

const CATEGORY_BY_ID = new Map(REQUIRED_REASON_CATEGORIES.map((c) => [c.id, c]));
const VALID_REASON_CODES = new Map(
  REQUIRED_REASON_CATEGORIES.map((c) => [c.id, new Set(c.reasons.map((r) => r.code))]),
);

const MAX_EXAMPLES_PER_CATEGORY = 8;

/**
 * @param {{path: string, content: string}[]} files
 * @returns {Map<string, {count: number, examples: {path: string, line: number, snippet: string, hint: string}[]}>}
 */
export function detectApiUsage(files) {
  const detected = new Map(REQUIRED_REASON_CATEGORIES.map((c) => [c.id, { count: 0, examples: [] }]));

  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const lines = file.content.split(/\r\n|\r|\n/);
    for (const category of REQUIRED_REASON_CATEGORIES) {
      const bucket = detected.get(category.id);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const symbol of category.symbols) {
          if (symbol.pattern.test(line)) {
            bucket.count += 1;
            if (bucket.examples.length < MAX_EXAMPLES_PER_CATEGORY) {
              bucket.examples.push({
                path: file.path,
                line: i + 1,
                snippet: line.trim().slice(0, 160),
                hint: symbol.hint,
              });
            }
            break; // one match per line per category is enough signal
          }
        }
      }
    }
  }

  return detected;
}

// Tiny recursive-descent parser for the subset of Apple's plist XML a
// PrivacyInfo.xcprivacy file actually uses: dict, array, key, string, true,
// false. It is not a general plist parser (no date/data/integer/real/nested
// CDATA handling) -- those tags never appear in this specific file, and a
// nested `<array>` inside a `<dict>` is exactly the shape that broke a first,
// regex-only version of this function (a non-greedy match to the first
// `</array>` landed on the *inner* reasons array instead of the outer one).
// A real tree walk has no "which closing tag did I mean" ambiguity to get
// wrong, which is worth the extra code for a tool whose whole job is reading
// this file accurately.
const TAG_RE = /<(\/?)(dict|array|key|string|true|false)\s*\/?>|([^<]+)/g;

function tokenize(xml) {
  const tokens = [];
  let match;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(xml)) !== null) {
    if (match[3] !== undefined) {
      const text = match[3].trim();
      if (text) tokens.push({ type: 'text', value: decodeXmlEntities(text) });
    } else {
      const selfClosing = match[0].endsWith('/>');
      tokens.push({ type: match[1] ? 'close' : selfClosing ? 'self' : 'open', name: match[2] });
    }
  }
  return tokens;
}

function decodeXmlEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/** Parses one value starting at tokens[pos]; returns [value, nextPos] or [undefined, pos] if nothing recognisable is there. */
function parseValue(tokens, pos) {
  const tok = tokens[pos];
  if (!tok) return [undefined, pos];
  if (tok.type === 'self' && (tok.name === 'true' || tok.name === 'false')) {
    return [tok.name === 'true', pos + 1];
  }
  if (tok.type === 'open' && tok.name === 'string') {
    const next = tokens[pos + 1];
    const value = next && next.type === 'text' ? next.value : '';
    let after = pos + (next && next.type === 'text' ? 2 : 1);
    if (tokens[after] && tokens[after].type === 'close' && tokens[after].name === 'string') after += 1;
    return [value, after];
  }
  if (tok.type === 'open' && tok.name === 'array') {
    const items = [];
    let i = pos + 1;
    while (tokens[i] && !(tokens[i].type === 'close' && tokens[i].name === 'array')) {
      const [value, next] = parseValue(tokens, i);
      if (next === i) break; // unrecognised token; avoid an infinite loop
      items.push(value);
      i = next;
    }
    if (tokens[i] && tokens[i].type === 'close') i += 1;
    return [items, i];
  }
  if (tok.type === 'open' && tok.name === 'dict') {
    const obj = {};
    let i = pos + 1;
    while (tokens[i] && !(tokens[i].type === 'close' && tokens[i].name === 'dict')) {
      if (tokens[i].type === 'open' && tokens[i].name === 'key') {
        const keyText = tokens[i + 1];
        const key = keyText && keyText.type === 'text' ? keyText.value : '';
        let after = i + (keyText && keyText.type === 'text' ? 2 : 1);
        if (tokens[after] && tokens[after].type === 'close' && tokens[after].name === 'key') after += 1;
        const [value, next] = parseValue(tokens, after);
        obj[key] = value;
        i = next === after ? after + 1 : next; // guard against not advancing
      } else {
        i += 1; // skip anything unexpected rather than getting stuck
      }
    }
    if (tokens[i] && tokens[i].type === 'close') i += 1;
    return [obj, i];
  }
  return [undefined, pos]; // unrecognised token at this position
}

function parsePlist(xml) {
  const tokens = tokenize(xml);
  // The XML declaration, DOCTYPE, and the outer <plist> tag are not
  // recognised tags to this tokenizer, so they surface as stray text tokens
  // ahead of the real root. Find the actual root <dict> rather than assuming
  // position 0 is it.
  const rootStart = tokens.findIndex((t) => t.type === 'open' && t.name === 'dict');
  if (rootStart === -1) return undefined;
  const [value] = parseValue(tokens, rootStart);
  return value;
}

/**
 * Reads a PrivacyInfo.xcprivacy file's NSPrivacyAccessedAPITypes entries.
 *
 * @param {string} xml
 * @returns {{categories: Map<string, Set<string>>, parseNote: string|null}}
 */
export function parseManifest(xml) {
  const categories = new Map();
  if (typeof xml !== 'string' || xml.trim() === '') {
    return { categories, parseNote: 'empty file' };
  }

  let root;
  try {
    root = parsePlist(xml);
  } catch {
    return { categories, parseNote: 'could not parse as XML' };
  }

  const entries = root && typeof root === 'object' ? root.NSPrivacyAccessedAPITypes : undefined;
  if (!Array.isArray(entries)) {
    return { categories, parseNote: 'no NSPrivacyAccessedAPITypes array found' };
  }
  if (entries.length === 0) {
    return { categories, parseNote: 'NSPrivacyAccessedAPITypes array is empty' };
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const categoryId = entry.NSPrivacyAccessedAPIType;
    if (typeof categoryId !== 'string') continue;
    const reasonList = Array.isArray(entry.NSPrivacyAccessedAPITypeReasons) ? entry.NSPrivacyAccessedAPITypeReasons : [];
    if (!categories.has(categoryId)) categories.set(categoryId, new Set());
    for (const reason of reasonList) {
      if (typeof reason === 'string') categories.get(categoryId).add(reason);
    }
  }

  return { categories, parseNote: null };
}

/**
 * @param {Map<string, {count: number, examples: object[]}>} detected
 * @param {{categories: Map<string, Set<string>>, parseNote: string|null}|null} manifest
 *   null means no manifest file was found at all.
 */
export function buildReport(detected, manifest) {
  const manifestFound = manifest !== null;
  const categories = REQUIRED_REASON_CATEGORIES.map((category) => {
    const found = detected.get(category.id) ?? { count: 0, examples: [] };
    const declaredReasons = manifestFound ? [...(manifest.categories.get(category.id) ?? [])] : [];
    const valid = VALID_REASON_CODES.get(category.id);
    const invalidReasonCodes = declaredReasons.filter((code) => !valid.has(code));
    const isDeclared = manifestFound && manifest.categories.has(category.id);

    let status;
    if (found.count === 0 && !isDeclared) status = 'not-detected';
    else if (found.count > 0 && !isDeclared) status = 'undeclared';
    else if (found.count === 0 && isDeclared) status = 'declared-but-not-detected';
    else status = 'declared';

    return {
      id: category.id,
      label: category.label,
      detectedCount: found.count,
      examples: found.examples,
      declaredReasons,
      invalidReasonCodes,
      status,
      validReasons: category.reasons,
    };
  });

  const undeclaredCount = categories.filter((c) => c.status === 'undeclared').length;
  const invalidCodeCount = categories.reduce((sum, c) => sum + c.invalidReasonCodes.length, 0);

  return {
    manifestFound,
    manifestParseNote: manifestFound ? manifest.parseNote : null,
    categories,
    undeclaredCount,
    invalidCodeCount,
    ok: manifestFound && undeclaredCount === 0 && invalidCodeCount === 0,
  };
}

/** Suggested XML snippet a user can paste in, for a category with no declaration yet. */
export function suggestedSnippet(categoryId) {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return '';
  const reasonChoices = category.reasons.map((r) => `        <!-- or ${r.code}: ${r.description} -->`).join('\n');
  return [
    '<dict>',
    '    <key>NSPrivacyAccessedAPIType</key>',
    `    <string>${categoryId}</string>`,
    '    <key>NSPrivacyAccessedAPITypeReasons</key>',
    '    <array>',
    `        <string>${category.reasons[0].code}</string> <!-- pick the reason that actually matches -->`,
    reasonChoices,
    '    </array>',
    '</dict>',
  ].join('\n');
}
