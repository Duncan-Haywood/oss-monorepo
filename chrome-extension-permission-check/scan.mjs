// Detects use of Chrome/Edge extension `chrome.*` APIs in JavaScript/TypeScript
// source and cross-checks the result against a manifest.json's declared
// permissions, optional_permissions, and host_permissions.
//
// Permission IDs and the namespace each one unlocks are reproduced from
// Google's public Chrome Extensions documentation (Declare permissions,
// chrome.* API reference) as of 2026-09. Chrome can add or rename permissions
// at any time -- this is evidence of what the code and the manifest say
// today, not a determination that a Chrome Web Store review will pass.
// Re-check against
// https://developer.chrome.com/docs/extensions/reference/permissions-list
// before relying on it for a submission.
//
// Runs entirely on file contents already in memory -- no network access, so
// the same module works unmodified from the CLI (check.mjs, reading from
// disk) and from the browser tool (index.html, reading File objects the
// visitor picked).

// Permissions with a code signature this tool can look for. Deliberately not
// exhaustive: a permission not listed here (ChromeOS/enterprise-only ones
// especially -- certificateProvider, enterprise.hardwarePlatform, loginState,
// processes, contentSettings, mdns, and others) is reported as "not checked"
// rather than silently ignored or wrongly guessed at. Getting an "unused"
// call wrong is the failure mode that matters here -- a false accusation
// costs a developer's trust -- so the map only covers permissions with an
// unambiguous, stable `chrome.<namespace>.` (or documented web API) surface.
export const PERMISSION_SIGNATURES = [
  { id: 'action', label: 'Toolbar action', patterns: [/\bchrome\.action\./] },
  { id: 'alarms', label: 'Alarms', patterns: [/\bchrome\.alarms\./] },
  { id: 'audio', label: 'Audio (ChromeOS)', patterns: [/\bchrome\.audio\./] },
  { id: 'bookmarks', label: 'Bookmarks', patterns: [/\bchrome\.bookmarks\./] },
  { id: 'browsingData', label: 'Browsing data', patterns: [/\bchrome\.browsingData\./] },
  { id: 'clipboardRead', label: 'Clipboard read', patterns: [/navigator\.clipboard\.read(Text)?\s*\(/, /document\.execCommand\(\s*['"]paste['"]/] },
  { id: 'clipboardWrite', label: 'Clipboard write', patterns: [/navigator\.clipboard\.write(Text)?\s*\(/, /document\.execCommand\(\s*['"]copy['"]/] },
  { id: 'contextMenus', label: 'Context menus', patterns: [/\bchrome\.contextMenus\./] },
  { id: 'cookies', label: 'Cookies', patterns: [/\bchrome\.cookies\./] },
  { id: 'debugger', label: 'Debugger', patterns: [/\bchrome\.debugger\./] },
  { id: 'declarativeContent', label: 'Declarative content', patterns: [/\bchrome\.declarativeContent\./] },
  { id: 'declarativeNetRequest', label: 'Declarative net request', patterns: [/\bchrome\.declarativeNetRequest\./] },
  { id: 'desktopCapture', label: 'Desktop capture', patterns: [/\bchrome\.desktopCapture\./] },
  { id: 'documentScan', label: 'Document scan', patterns: [/\bchrome\.documentScan\./] },
  { id: 'downloads', label: 'Downloads', patterns: [/\bchrome\.downloads\./] },
  { id: 'fileSystemProvider', label: 'File system provider', patterns: [/\bchrome\.fileSystemProvider\./] },
  { id: 'fontSettings', label: 'Font settings', patterns: [/\bchrome\.fontSettings\./] },
  { id: 'gcm', label: 'Cloud messaging', patterns: [/\bchrome\.gcm\./] },
  { id: 'geolocation', label: 'Geolocation', patterns: [/navigator\.geolocation\./] },
  { id: 'history', label: 'History', patterns: [/\bchrome\.history\./] },
  { id: 'identity', label: 'Identity', patterns: [/\bchrome\.identity\./] },
  { id: 'idle', label: 'Idle', patterns: [/\bchrome\.idle\./] },
  { id: 'management', label: 'Management', patterns: [/\bchrome\.management\./] },
  { id: 'nativeMessaging', label: 'Native messaging', patterns: [/\bchrome\.runtime\.(connectNative|sendNativeMessage)\s*\(/] },
  { id: 'notifications', label: 'Notifications', patterns: [/\bchrome\.notifications\./] },
  { id: 'offscreen', label: 'Offscreen documents', patterns: [/\bchrome\.offscreen\./] },
  { id: 'pageCapture', label: 'Page capture', patterns: [/\bchrome\.pageCapture\./] },
  { id: 'platformKeys', label: 'Platform keys', patterns: [/\bchrome\.platformKeys\./] },
  { id: 'power', label: 'Power', patterns: [/\bchrome\.power\./] },
  { id: 'printerProvider', label: 'Printer provider', patterns: [/\bchrome\.printerProvider\./] },
  { id: 'privacy', label: 'Privacy settings', patterns: [/\bchrome\.privacy\./] },
  { id: 'proxy', label: 'Proxy', patterns: [/\bchrome\.proxy\./] },
  { id: 'scripting', label: 'Scripting', patterns: [/\bchrome\.scripting\./] },
  { id: 'sessions', label: 'Sessions', patterns: [/\bchrome\.sessions\./] },
  { id: 'sidePanel', label: 'Side panel', patterns: [/\bchrome\.sidePanel\./] },
  { id: 'storage', label: 'Storage', patterns: [/\bchrome\.storage\./] },
  { id: 'system.cpu', label: 'System: CPU', patterns: [/\bchrome\.system\.cpu\./] },
  { id: 'system.display', label: 'System: display', patterns: [/\bchrome\.system\.display\./] },
  { id: 'system.memory', label: 'System: memory', patterns: [/\bchrome\.system\.memory\./] },
  { id: 'system.storage', label: 'System: storage', patterns: [/\bchrome\.system\.storage\./] },
  { id: 'tabCapture', label: 'Tab capture', patterns: [/\bchrome\.tabCapture\./] },
  { id: 'tabs', label: 'Tabs', patterns: [/\bchrome\.tabs\./] },
  { id: 'topSites', label: 'Top sites', patterns: [/\bchrome\.topSites\./] },
  { id: 'tts', label: 'Text-to-speech', patterns: [/\bchrome\.tts\./] },
  { id: 'ttsEngine', label: 'Text-to-speech engine', patterns: [/\bchrome\.ttsEngine\./] },
  { id: 'vpnProvider', label: 'VPN provider', patterns: [/\bchrome\.vpnProvider\./] },
  { id: 'webAuthenticationProxy', label: 'Web authentication proxy', patterns: [/\bchrome\.webAuthenticationProxy\./] },
  { id: 'webNavigation', label: 'Web navigation', patterns: [/\bchrome\.webNavigation\./] },
  { id: 'webRequest', label: 'Web request', patterns: [/\bchrome\.webRequest\./] },
];

// Permissions with no distinguishing code signature: they change what another
// API is *allowed* to do, or relax a limit, rather than opening a namespace of
// their own. Declaring one of these is never flagged as "unused" -- there is
// nothing in source that could confirm or deny it.
export const UNCHECKABLE_PERMISSIONS = new Map([
  ['activeTab', 'Grants temporary access to the current tab after a user gesture. It changes what chrome.tabs/chrome.scripting may do rather than opening an API of its own, so no code signature marks its use.'],
  ['background', "Lets the extension's service worker be woken for background events. No distinct chrome.* call marks its use."],
  ['unlimitedStorage', 'Raises the chrome.storage quota only; does not change how chrome.storage is called.'],
  ['declarativeNetRequestFeedback', 'Companion to declarativeNetRequest (enables chrome.declarativeNetRequest.onRuleMatchedDebug); shares that namespace, so it is not checked separately.'],
  ['declarativeNetRequestWithHostAccess', 'Companion to declarativeNetRequest for host-matched redirect/modify actions; shares that namespace, so it is not checked separately.'],
]);

const SIGNATURE_BY_ID = new Map(PERMISSION_SIGNATURES.map((p) => [p.id, p]));

// Chrome Web Store review flags a host permission matching "every site" as
// needing its own justification, distinct from an individual API permission.
// https://developer.chrome.com/docs/webstore/troubleshooting -- "Purple
// Potassium" covers both excessive API permissions and overly broad host
// access.
export const BROAD_HOST_PATTERNS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

const MAX_EXAMPLES_PER_PERMISSION = 8;

/**
 * @param {{path: string, content: string}[]} files
 * @returns {Map<string, {count: number, examples: {path: string, line: number, snippet: string}[]}>}
 */
export function detectApiUsage(files) {
  const detected = new Map(PERMISSION_SIGNATURES.map((p) => [p.id, { count: 0, examples: [] }]));

  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const lines = file.content.split(/\r\n|\r|\n/);
    for (const perm of PERMISSION_SIGNATURES) {
      const bucket = detected.get(perm.id);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (perm.patterns.some((p) => p.test(line))) {
          bucket.count += 1;
          if (bucket.examples.length < MAX_EXAMPLES_PER_PERMISSION) {
            bucket.examples.push({ path: file.path, line: i + 1, snippet: line.trim().slice(0, 160) });
          }
        }
      }
    }
  }

  return detected;
}

/**
 * Reads a manifest.json's permission-related fields.
 *
 * @param {string} jsonText
 * @returns {{
 *   permissions: string[], optionalPermissions: string[], hostPermissions: string[],
 *   manifestVersion: number|null, parseNote: string|null,
 * }}
 */
export function parseManifest(jsonText) {
  const empty = { permissions: [], optionalPermissions: [], hostPermissions: [], manifestVersion: null, parseNote: null };
  if (typeof jsonText !== 'string' || jsonText.trim() === '') {
    return { ...empty, parseNote: 'empty file' };
  }
  let data;
  try {
    data = JSON.parse(jsonText);
  } catch {
    return { ...empty, parseNote: 'could not parse as JSON' };
  }
  if (!data || typeof data !== 'object') {
    return { ...empty, parseNote: 'not a JSON object' };
  }

  const asStringArray = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  // Some manifests (and every Manifest V2 one) mix host match patterns into
  // `permissions` rather than a separate `host_permissions` array. Split by
  // shape rather than by manifest_version, so either style is read the same
  // way.
  const isHostPattern = (s) => s === '<all_urls>' || s.includes('://');
  const rawPermissions = asStringArray(data.permissions);
  const permissions = rawPermissions.filter((p) => !isHostPattern(p));
  const inlineHostPermissions = rawPermissions.filter((p) => isHostPattern(p));
  const hostPermissions = [...inlineHostPermissions, ...asStringArray(data.host_permissions)];

  return {
    permissions,
    optionalPermissions: asStringArray(data.optional_permissions),
    hostPermissions,
    manifestVersion: typeof data.manifest_version === 'number' ? data.manifest_version : null,
    parseNote: null,
  };
}

/**
 * @param {Map<string, {count: number, examples: object[]}>} detected
 * @param {ReturnType<typeof parseManifest>|null} manifest null means no manifest.json was found.
 */
export function buildReport(detected, manifest) {
  const manifestFound = manifest !== null;
  const declaredSet = manifestFound ? new Set([...manifest.permissions, ...manifest.optionalPermissions]) : new Set();
  const requiredSet = manifestFound ? new Set(manifest.permissions) : new Set();

  const permissions = PERMISSION_SIGNATURES.map((perm) => {
    const found = detected.get(perm.id) ?? { count: 0, examples: [] };
    const declared = declaredSet.has(perm.id);
    const optionalOnly = declared && !requiredSet.has(perm.id);

    let status;
    if (!declared && found.count === 0) status = 'not-relevant';
    else if (declared && found.count > 0) status = 'declared-and-detected';
    else if (declared && found.count === 0) status = 'declared-unused';
    else status = 'detected-undeclared';

    return { id: perm.id, label: perm.label, detectedCount: found.count, examples: found.examples, declared, optionalOnly, status };
  }).filter((p) => p.status !== 'not-relevant');

  const uncheckable = manifestFound
    ? [...UNCHECKABLE_PERMISSIONS.entries()]
        .filter(([id]) => declaredSet.has(id))
        .map(([id, reason]) => ({ id, reason, optionalOnly: !requiredSet.has(id) }))
    : [];

  const unmappedDeclared = manifestFound
    ? [...declaredSet].filter((id) => !SIGNATURE_BY_ID.has(id) && !UNCHECKABLE_PERMISSIONS.has(id)).sort()
    : [];

  const hostPermissions = manifestFound
    ? manifest.hostPermissions.map((pattern) => ({ pattern, broad: BROAD_HOST_PATTERNS.has(pattern) }))
    : [];

  const declaredUnusedCount = permissions.filter((p) => p.status === 'declared-unused' && !p.optionalOnly).length;
  const detectedUndeclaredCount = permissions.filter((p) => p.status === 'detected-undeclared').length;
  const broadHostCount = hostPermissions.filter((h) => h.broad).length;

  return {
    manifestFound,
    manifestParseNote: manifestFound ? manifest.parseNote : null,
    manifestVersion: manifestFound ? manifest.manifestVersion : null,
    permissions,
    uncheckable,
    unmappedDeclared,
    hostPermissions,
    declaredUnusedCount,
    detectedUndeclaredCount,
    broadHostCount,
    ok: manifestFound && declaredUnusedCount === 0 && detectedUndeclaredCount === 0 && broadHostCount === 0,
  };
}
