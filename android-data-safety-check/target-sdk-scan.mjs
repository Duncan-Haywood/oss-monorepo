// Detects a declared Android `targetSdkVersion`/`targetSdk` value in a
// project's AndroidManifest.xml or Gradle build files, and checks it against
// Google Play's published target API level enforcement requirement -- the
// gate that (separately from the Data safety declaration this venture's
// other tool checks) restricts an app update from reaching devices on newer
// Android versions once its target API level falls too far behind.
//
// The deadline table below is reproduced from Google's own "Meet Google
// Play's target API level requirement" page (developer.android.com/google/
// play/requirements/target-sdk) as fetched 2026-09-23. Google revises these
// numbers and dates on its own schedule (a new deadline is typically
// announced roughly a year ahead) -- this is a dated snapshot of what that
// page said, not a live read of it, and not a determination that a given
// app will or will not be restricted. Re-check the live page before relying
// on this for a submission decision.

export const TARGET_API_REQUIREMENT = {
  asOf: '2026-09-23',
  source: 'https://developer.android.com/google/play/requirements/target-sdk',
  primaryDeadline: '2026-08-31',
  extensionDeadline: '2026-11-01',
  extensionNote: 'An extension to the primary deadline can be requested in Play Console; Google states it opens the request form "later in the year" ahead of the primary deadline.',
  consequence: 'An app below the required level for its form factor is not removed -- it stops being visible to, and installable by, new users on a device running a newer Android version than the app targets. Existing installs and users on an OS version at or below the app’s target are unaffected.',
};

/**
 * One row per Google Play form factor. `requiredExisting` is the floor for
 * an already-published app receiving an update; `requiredNew` is the floor
 * for an app newly published to Google Play. Both are enforced at the same
 * `primaryDeadline` above, per the source page.
 */
export const FORM_FACTORS = [
  { id: 'phone-tablet', label: 'Phone / tablet (and Android Auto)', requiredExisting: 35, requiredNew: 36 },
  { id: 'wear-os', label: 'Wear OS', requiredExisting: 35, requiredNew: 35 },
  { id: 'android-tv', label: 'Android TV', requiredExisting: 34, requiredNew: 34 },
  { id: 'android-xr', label: 'Android XR', requiredExisting: 34, requiredNew: 34 },
  { id: 'automotive-os', label: 'Android Automotive OS', requiredExisting: 31, requiredNew: 35 },
];

const FORM_FACTOR_BY_ID = new Map(FORM_FACTORS.map((f) => [f.id, f]));

export function formFactorById(id) {
  return FORM_FACTOR_BY_ID.get(id) ?? FORM_FACTORS[0];
}

// Matches `<uses-sdk ... android:targetSdkVersion="34" ...>` in a manifest.
// Rare in a modern project (Gradle is the normal place this lives now) but
// still valid and still read by the platform, so it is worth detecting.
const MANIFEST_RE = /<uses-sdk\b[^>]*\sandroid:targetSdkVersion\s*=\s*(?:"(\d+)"|'(\d+)')[^>]*>/g;

// Matches both Gradle Groovy (`targetSdkVersion 34`, `targetSdkVersion = 34`)
// and Kotlin DSL (`targetSdk = 34`) spellings, and the older `targetSdkVersion`
// alongside the newer bare `targetSdk` property name. Deliberately does not
// resolve a variable or version-catalog reference (`targetSdk =
// libs.versions.targetSdk.get().toInt()`, `targetSdkVersion
// rootProject.ext.targetSdk`) -- those name something defined elsewhere, and
// resolving one honestly needs that file too. Recorded as "unresolved"
// rather than guessed, the same "silence is a gap, not a clean bill of
// health" principle as this venture's other scanner.
const GRADLE_NUMERIC_RE = /\btargetSdk(?:Version)?\b\s*=?\s*\(?\s*(\d+)\b/g;
const GRADLE_SYMBOLIC_RE = /\btargetSdk(?:Version)?\b\s*=?\s*\(?\s*([A-Za-z_][A-Za-z0-9_.]*)/g;

/**
 * @param {{path: string, content: string}[]} files
 * @returns {{path: string, value: number}[]} every resolved numeric targetSdkVersion found
 *          plus {@link unresolvedRefs} for symbolic references this scan cannot resolve.
 */
export function detectTargetSdk(files) {
  const found = [];
  const unresolvedRefs = [];

  for (const file of files) {
    if (typeof file.content !== 'string') continue;
    const isManifest = /AndroidManifest\.xml$/i.test(file.path);
    const lines = file.content.split(/\r\n|\r|\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (isManifest) {
        MANIFEST_RE.lastIndex = 0;
        let m;
        while ((m = MANIFEST_RE.exec(line)) !== null) {
          found.push({ path: file.path, line: i + 1, value: Number(m[1] ?? m[2]) });
        }
        continue;
      }

      // Numeric Gradle declarations first; a line matched numerically is not
      // also reported as unresolved.
      let matchedNumeric = false;
      GRADLE_NUMERIC_RE.lastIndex = 0;
      let m;
      while ((m = GRADLE_NUMERIC_RE.exec(line)) !== null) {
        matchedNumeric = true;
        found.push({ path: file.path, line: i + 1, value: Number(m[1]) });
      }
      if (matchedNumeric) continue;

      GRADLE_SYMBOLIC_RE.lastIndex = 0;
      while ((m = GRADLE_SYMBOLIC_RE.exec(line)) !== null) {
        unresolvedRefs.push({ path: file.path, line: i + 1, reference: m[1] });
      }
    }
  }

  return { declarations: found, unresolvedRefs };
}

/**
 * @param {{declarations: {path:string, line:number, value:number}[], unresolvedRefs: object[]}} detected
 * @param {string} formFactorId
 * @param {Date} [today]
 */
export function buildTargetSdkReport(detected, formFactorId, today = new Date()) {
  const formFactor = formFactorById(formFactorId);
  const { declarations, unresolvedRefs } = detected;

  const highest = declarations.length > 0 ? Math.max(...declarations.map((d) => d.value)) : null;
  const meetsExisting = highest !== null && highest >= formFactor.requiredExisting;
  const meetsNew = highest !== null && highest >= formFactor.requiredNew;

  const dayMs = 24 * 60 * 60 * 1000;
  const daysUntil = (isoDate) => Math.round((new Date(`${isoDate}T00:00:00Z`).getTime() - today.getTime()) / dayMs);

  return {
    formFactor,
    declarations,
    unresolvedRefs,
    highest,
    meetsExisting,
    meetsNew,
    daysUntilPrimaryDeadline: daysUntil(TARGET_API_REQUIREMENT.primaryDeadline),
    daysUntilExtensionDeadline: daysUntil(TARGET_API_REQUIREMENT.extensionDeadline),
  };
}
