// Detects Android permission and third-party-SDK usage that Google Play's
// Data safety form (App content -> Data safety, in Play Console) asks a
// developer to declare, and cross-checks the result against the categories
// the developer says they have already ticked there.
//
// The category list and the permission-to-category mapping are reproduced
// from Android's own permission groups (developer.android.com) and Google
// Play's public Data safety data-type list (support.google.com/googleplay/
// android-developer) as of 2026-09. The SDK-to-category mapping is drawn
// from each named SDK's own published privacy documentation and Google's
// Play SDK Index (play.google.com/sdks) as of the same date. Google can add
// data types, reclassify a permission's category, or change what a given
// SDK collects at any time -- this is evidence of what the manifest, the
// Gradle build files, and the developer's own declared list say today, not
// a determination that a Play Console submission will be accepted. Re-check
// against Play Console's current Data safety form before relying on it for
// a submission.
//
// Runs entirely on file contents already in memory -- no network access, so
// the same module works unmodified from the CLI (check.mjs, reading from
// disk) and from the browser tool (index.html, reading File objects the
// visitor picked).

/**
 * Google Play's own top-level Data safety categories, as they appear when
 * declaring a data type in Play Console. Each `id` is this tool's own short
 * key (Play Console has no public per-category machine id to reuse), not
 * anything read from a Google file.
 */
export const DATA_SAFETY_CATEGORIES = [
  { id: 'location', label: 'Location (approximate or precise)' },
  { id: 'personal-info', label: 'Personal info (name, email, user IDs, address, phone number, and similar)' },
  { id: 'financial-info', label: 'Financial info (payment info, purchase history, credit score)' },
  { id: 'health-fitness', label: 'Health and fitness' },
  { id: 'messages', label: 'Messages (SMS/MMS, emails, in-app messages)' },
  { id: 'photos-videos', label: 'Photos and videos' },
  { id: 'audio-files', label: 'Audio files (voice/sound recordings, music, other audio)' },
  { id: 'files-docs', label: 'Files and docs' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'contacts', label: 'Contacts' },
  { id: 'app-activity', label: 'App activity (app interactions, in-app search history, installed apps)' },
  { id: 'web-browsing', label: 'Web browsing history' },
  { id: 'app-info-performance', label: 'App info and performance (crash logs, diagnostics)' },
  { id: 'device-ids', label: 'Device or other IDs' },
];

const CATEGORY_IDS = new Set(DATA_SAFETY_CATEGORIES.map((c) => c.id));
const CATEGORY_BY_ID = new Map(DATA_SAFETY_CATEGORIES.map((c) => [c.id, c]));

/**
 * Android dangerous/runtime permissions that most directly imply a Data
 * safety category. Deliberately not exhaustive -- permissions with no clear
 * one-to-one Play category (e.g. BLUETOOTH_CONNECT, POST_NOTIFICATIONS) are
 * left out rather than guessed, on the same "evidence, not a determination"
 * principle as the rest of this portfolio's checkers.
 */
export const PERMISSION_DATA_TYPES = [
  { permission: 'android.permission.ACCESS_FINE_LOCATION', category: 'location' },
  { permission: 'android.permission.ACCESS_COARSE_LOCATION', category: 'location' },
  { permission: 'android.permission.ACCESS_BACKGROUND_LOCATION', category: 'location' },
  { permission: 'android.permission.CAMERA', category: 'photos-videos' },
  { permission: 'android.permission.RECORD_AUDIO', category: 'audio-files' },
  { permission: 'android.permission.READ_CONTACTS', category: 'contacts' },
  { permission: 'android.permission.WRITE_CONTACTS', category: 'contacts' },
  { permission: 'android.permission.GET_ACCOUNTS', category: 'contacts' },
  { permission: 'android.permission.READ_CALENDAR', category: 'calendar' },
  { permission: 'android.permission.WRITE_CALENDAR', category: 'calendar' },
  { permission: 'android.permission.READ_SMS', category: 'messages' },
  { permission: 'android.permission.RECEIVE_SMS', category: 'messages' },
  { permission: 'android.permission.SEND_SMS', category: 'messages' },
  { permission: 'android.permission.READ_MEDIA_IMAGES', category: 'photos-videos' },
  { permission: 'android.permission.READ_MEDIA_VIDEO', category: 'photos-videos' },
  { permission: 'android.permission.READ_MEDIA_AUDIO', category: 'audio-files' },
  { permission: 'android.permission.READ_EXTERNAL_STORAGE', category: 'files-docs' },
  { permission: 'android.permission.WRITE_EXTERNAL_STORAGE', category: 'files-docs' },
  { permission: 'android.permission.BODY_SENSORS', category: 'health-fitness' },
  { permission: 'android.permission.BODY_SENSORS_BACKGROUND', category: 'health-fitness' },
  { permission: 'android.permission.ACTIVITY_RECOGNITION', category: 'health-fitness' },
  { permission: 'android.permission.READ_PHONE_STATE', category: 'device-ids' },
  { permission: 'android.permission.READ_PHONE_NUMBERS', category: 'device-ids' },
];

const PERMISSION_TO_CATEGORY = new Map(PERMISSION_DATA_TYPES.map((p) => [p.permission, p.category]));

/**
 * Common SDKs whose Gradle dependency coordinate (`group:artifact`) is a
 * reasonably reliable signal that a specific Data safety category applies,
 * per each SDK's own published privacy documentation. A handful of the most
 * widely used analytics/ads/crash SDKs, not a general SDK database -- an
 * unrecognised dependency is simply not flagged, the same "silence isn't
 * a clean bill of health, it's a gap in this list" caveat this file states
 * in its own docs.
 */
export const KNOWN_SDK_DATA_TYPES = [
  { name: 'Firebase Analytics', match: /^com\.google\.firebase:firebase-analytics(?:-ktx)?$/, categories: ['app-activity', 'device-ids'] },
  { name: 'Firebase Crashlytics', match: /^com\.google\.firebase:firebase-crashlytics(?:-ktx)?$/, categories: ['app-info-performance'] },
  { name: 'Google Mobile Ads (AdMob)', match: /^com\.google\.android\.gms:play-services-ads(?:-lite)?$/, categories: ['device-ids', 'app-activity'] },
  { name: 'Play Services Location', match: /^com\.google\.android\.gms:play-services-location$/, categories: ['location'] },
  { name: 'Facebook SDK', match: /^com\.facebook\.android:facebook-android-sdk$/, categories: ['device-ids', 'app-activity'] },
  { name: 'Mixpanel', match: /^com\.mixpanel\.android:mixpanel-android$/, categories: ['app-activity', 'device-ids'] },
  { name: 'Amplitude', match: /^com\.amplitude:android-sdk$/, categories: ['app-activity', 'device-ids'] },
  { name: 'AppsFlyer', match: /^com\.appsflyer:af-android-sdk$/, categories: ['device-ids', 'app-activity'] },
  { name: 'Braze', match: /^com\.braze:android-sdk-ui$/, categories: ['app-activity', 'device-ids'] },
];

const MAX_EXAMPLES_PER_CATEGORY = 8;

const PERMISSION_TAG_RE = /<uses-permission\b[^>]*\sandroid:name\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>/g;

// Matches a Gradle dependency coordinate (`group:artifact:version`) quoted
// in either Groovy (`'group:artifact:1.0'`) or Kotlin DSL
// (`"group:artifact:1.0"`) syntax. Deliberately does not resolve Gradle
// version-catalog aliases (`libs.firebase.analytics`) -- those name a TOML
// entry, not a coordinate, and resolving one honestly needs the catalog
// file too; paste the resolved `group:artifact` line instead if your
// project uses a catalog.
const GRADLE_COORD_RE = /['"]([a-zA-Z0-9_.\-]+:[a-zA-Z0-9_.\-]+):[a-zA-Z0-9_.\-+]+['"]/g;

/**
 * @param {{path: string, content: string}[]} files
 * @returns {Map<string, {count: number, examples: {path: string, line: number, snippet: string, hint: string}[]}>}
 */
export function detectDataTypes(files) {
  const detected = new Map(DATA_SAFETY_CATEGORIES.map((c) => [c.id, { count: 0, examples: [] }]));

  const addExample = (categoryId, path, lineNo, snippet, hint) => {
    const bucket = detected.get(categoryId);
    if (!bucket) return;
    bucket.count += 1;
    if (bucket.examples.length < MAX_EXAMPLES_PER_CATEGORY) {
      bucket.examples.push({ path, line: lineNo, snippet: snippet.trim().slice(0, 160), hint });
    }
  };

  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const lines = file.content.split(/\r\n|\r|\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      PERMISSION_TAG_RE.lastIndex = 0;
      let m;
      while ((m = PERMISSION_TAG_RE.exec(line)) !== null) {
        const permName = m[1] ?? m[2];
        const category = PERMISSION_TO_CATEGORY.get(permName);
        if (category) addExample(category, file.path, i + 1, line, `permission ${permName}`);
      }

      GRADLE_COORD_RE.lastIndex = 0;
      while ((m = GRADLE_COORD_RE.exec(line)) !== null) {
        const coordinate = m[1];
        const sdk = KNOWN_SDK_DATA_TYPES.find((s) => s.match.test(coordinate));
        if (!sdk) continue;
        for (const category of sdk.categories) {
          addExample(category, file.path, i + 1, line, `${sdk.name} (${coordinate})`);
        }
      }
    }
  }

  return detected;
}

/**
 * @param {Map<string, {count: number, examples: object[]}>} detected
 * @param {Set<string>|null} declaredCategories
 *   null means the caller supplied no declared-categories list at all
 *   (nothing picked in the browser tool, no --declared file for the CLI).
 */
export function buildReport(detected, declaredCategories) {
  const declaredProvided = declaredCategories !== null;
  const declared = declaredProvided ? declaredCategories : new Set();

  const categories = DATA_SAFETY_CATEGORIES.map((category) => {
    const found = detected.get(category.id) ?? { count: 0, examples: [] };
    const isDeclared = declared.has(category.id);

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
      isDeclared,
      status,
    };
  });

  const undeclaredCount = categories.filter((c) => c.status === 'undeclared').length;

  return {
    declaredProvided,
    categories,
    undeclaredCount,
    ok: declaredProvided && undeclaredCount === 0,
  };
}

/**
 * Parses a simple, self-documented "declared categories" file: one category
 * id per line (matching the `id` field in DATA_SAFETY_CATEGORIES, printed by
 * this tool itself), blank lines and `#`-prefixed comments ignored. This is
 * not a Google file format -- Play Console has no public bulk-export schema
 * this tool relies on -- it is a plain list the developer maintains
 * themselves, mirroring what they have already ticked in Play Console's
 * Data safety form.
 *
 * @param {string} text
 * @returns {{categories: Set<string>, unknownLines: string[]}}
 */
export function parseDeclaredList(text) {
  const categories = new Set();
  const unknownLines = [];
  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (CATEGORY_IDS.has(line)) categories.add(line);
    else unknownLines.push(line);
  }
  return { categories, unknownLines };
}

/** Short, plain-language suggestion for what to do about a category status. */
export function suggestedAction(categoryId) {
  const category = CATEGORY_BY_ID.get(categoryId);
  if (!category) return '';
  return (
    `In Play Console: App content -> Data safety, add "${category.label}" under the ` +
    'matching group, and state whether it is collected, shared, and for what purpose. ' +
    'Only you know the actual purpose and whether it is optional -- this tool names the ' +
    "category, not the answer to those questions."
  );
}
