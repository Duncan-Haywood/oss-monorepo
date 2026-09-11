// Classify a set of store-listing image assets against a store's published
// requirements. Pure: it takes already-measured asset descriptions and returns
// findings. Nothing here reads a file, touches a network, or knows whether it
// is running in Node or a browser tab.
//
// An asset is `{ name, role, info }` where `role` is 'screenshot', 'icon' or
// 'feature-graphic' and `info` is whatever `image.mjs` read out of the bytes.

import { matchIosScreenshotSize, specFor } from './spec.mjs';
import { orientationOf } from './image.mjs';

const DANGER = 'danger';
const NOTICE = 'notice';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const dim = (info) => `${info.width}x${info.height}`;

/**
 * Severity is a claim about consequence, not about how annoying something is,
 * and the distinction is the whole reason this tool is worth running in CI.
 *
 *   danger — the store is documented to reject this, or the set is internally
 *            inconsistent in a way no store accepts. Exits the CLI non-zero.
 *   notice — worth a look before you upload, but this tool is not certain the
 *            store will refuse it. Everything that depends on the size tables
 *            in `spec.mjs` lands here, because those tables can go stale and a
 *            check that fails a good build on a year-old table is worse than
 *            no check at all.
 */
function finding(id, severity, title, detail, assets = []) {
  return { id, severity, title, detail, assets };
}

function checkReadable(assets) {
  return assets
    .filter((a) => a.info?.error)
    .map((a) =>
      finding(
        'unreadable',
        DANGER,
        'File could not be measured',
        `"${a.name}" could not be read as an image this tool understands: ${a.info.error}. ` +
          `It was left out of every other check below, so treat this set as unverified until it is fixed.`,
        [a.name],
      ),
    );
}

function checkFormats(assets, spec) {
  const out = [];
  for (const a of assets) {
    // A HEIC or a WebP sets `error` (this tool cannot measure one) *and* has a
    // perfectly well-known format, and the format is the actionable half: "not
    // an accepted format, re-export it" tells the reader what to do, where
    // "could not be measured" reads like a bug in this tool. So the wrong
    // format is reported even though the file was unreadable -- only genuinely
    // unidentifiable bytes fall through to `unreadable` alone.
    if (a.info?.error && a.info.format === 'unknown') continue;
    const allowed =
      a.role === 'icon'
        ? spec.icon.allowedFormats
        : a.role === 'feature-graphic' && spec.featureGraphic
          ? spec.featureGraphic.allowedFormats
          : spec.acceptedFormats;
    if (!allowed.includes(a.info.format)) {
      out.push(
        finding(
          'unsupported-format',
          DANGER,
          `${a.info.format.toUpperCase()} is not an accepted format`,
          `"${a.name}" is a ${a.info.format.toUpperCase()} file. ${spec.storeLabel} accepts ` +
            `${allowed.map((f) => f.toUpperCase()).join(' or ')} for this asset. ` +
            (a.info.format === 'heic' || a.info.format === 'avif'
              ? 'This is the common one: renaming a screenshot to .png does not convert it, and the upload reads the bytes, not the name. Re-export it.'
              : 'Re-export it in an accepted format.'),
          [a.name],
        ),
      );
    }
  }
  return out;
}

function checkIcon(assets, spec) {
  const out = [];
  for (const a of assets.filter((x) => x.role === 'icon' && !x.info?.error)) {
    if (!spec.icon.allowTransparency && a.info.hasTransparency) {
      const why = a.info.hasAlphaChannel
        ? `its PNG colour type (${a.info.colorType}) declares an alpha channel`
        : 'it carries a tRNS transparency chunk';
      out.push(
        finding(
          'icon-transparency',
          DANGER,
          'App icon declares transparency',
          `"${a.name}" will be refused: ${why}. ${spec.storeLabel} requires a fully opaque app icon — ` +
            'this is the rejection that arrives at upload time, after the build and the archive. ' +
            'Flatten it onto an opaque background and re-export (exporting as JPEG also removes the ' +
            'alpha channel, since JPEG has none). Do not paint the rounded corners yourself; the store ' +
            'masks them for you.',
          [a.name],
        ),
      );
    }
    if (a.info.width !== spec.icon.width || a.info.height !== spec.icon.height) {
      out.push(
        finding(
          'icon-dimensions',
          DANGER,
          'App icon is the wrong size',
          `"${a.name}" is ${dim(a.info)}. ${spec.storeLabel} requires exactly ` +
            `${spec.icon.width}x${spec.icon.height}.`,
          [a.name],
        ),
      );
    }
    if (a.info.format === 'png' && a.info.interlaced) {
      out.push(
        finding(
          'icon-interlaced',
          NOTICE,
          'App icon is an interlaced PNG',
          `"${a.name}" is stored interlaced (Adam7). Store asset pipelines are documented to want a ` +
            'standard non-interlaced PNG, and interlacing buys nothing for an image the store ' +
            'already serves at a fixed size. Re-export with interlacing off.',
          [a.name],
        ),
      );
    }
    if (a.info.format === 'png' && a.info.bitDepth > 8) {
      out.push(
        finding(
          'icon-bit-depth',
          NOTICE,
          'App icon is deeper than 8 bits per channel',
          `"${a.name}" is ${a.info.bitDepth}-bit per channel. Store icons are expected at 8 bits; ` +
            'a 16-bit export is several times larger for no visible difference and some pipelines ' +
            'reject it outright.',
          [a.name],
        ),
      );
    }
  }
  return out;
}

function checkFeatureGraphic(assets, spec) {
  if (!spec.featureGraphic) return [];
  const out = [];
  for (const a of assets.filter((x) => x.role === 'feature-graphic' && !x.info?.error)) {
    const { width, height } = spec.featureGraphic;
    if (a.info.width !== width || a.info.height !== height) {
      out.push(
        finding(
          'feature-graphic-dimensions',
          DANGER,
          'Feature graphic is the wrong size',
          `"${a.name}" is ${dim(a.info)}. ${spec.storeLabel} requires exactly ${width}x${height}.`,
          [a.name],
        ),
      );
    }
    if (!spec.featureGraphic.allowTransparency && a.info.hasTransparency) {
      out.push(
        finding(
          'feature-graphic-transparency',
          DANGER,
          'Feature graphic declares transparency',
          `"${a.name}" declares transparency. ${spec.storeLabel} requires an opaque feature graphic; ` +
            'anything transparent composites against a background you do not control.',
          [a.name],
        ),
      );
    }
  }
  return out;
}

/**
 * The check that needs no specification at all, and the one most likely to
 * catch a real mistake: a screenshot set whose members disagree with each
 * other. Regenerating four of five screenshots on a newer simulator is the
 * ordinary way a set ends up mixed, and it is invisible in a file listing.
 */
function checkSetConsistency(shots) {
  const out = [];
  const usable = shots.filter((s) => !s.info?.error);
  if (usable.length < 2) return out;

  const sizes = new Map();
  for (const s of usable) {
    const key = dim(s.info);
    if (!sizes.has(key)) sizes.set(key, []);
    sizes.get(key).push(s.name);
  }
  if (sizes.size > 1) {
    const summary = [...sizes.entries()]
      .map(([size, names]) => `${size} (${names.join(', ')})`)
      .join('; ');
    out.push(
      finding(
        'mixed-dimensions',
        DANGER,
        'Screenshots in this set are not all the same size',
        `This set mixes ${sizes.size} different pixel sizes: ${summary}. A screenshot set uploaded ` +
          'for one display class has to be internally consistent — the usual cause is regenerating ' +
          'some of the set on a different simulator or device and keeping the rest.',
        usable.map((s) => s.name),
      ),
    );
  }

  const orientations = new Set(usable.map((s) => orientationOf(s.info)));
  if (orientations.size > 1) {
    out.push(
      finding(
        'mixed-orientation',
        NOTICE,
        'Screenshots in this set mix portrait and landscape',
        `This set contains ${[...orientations].join(' and ')} images. Stores treat portrait and ` +
          'landscape as separate sets; uploading them together is usually an accident, and where it ' +
          'is deliberate the two halves belong in their own sets.',
        usable.map((s) => s.name),
      ),
    );
  }
  return out;
}

function checkCount(shots, spec) {
  const out = [];
  if (shots.length === 0) return out;
  if (shots.length > spec.maxScreenshotsPerSet) {
    out.push(
      finding(
        'too-many-screenshots',
        DANGER,
        'More screenshots than the store accepts',
        `This set has ${plural(shots.length, 'screenshot')}. ${spec.storeLabel} accepts at most ` +
          `${spec.maxScreenshotsPerSet} per set, so the upload will refuse the extras.`,
      ),
    );
  }
  if (shots.length < spec.minScreenshotsPerSet) {
    out.push(
      finding(
        'too-few-screenshots',
        NOTICE,
        'Fewer screenshots than the store requires',
        `This set has ${plural(shots.length, 'screenshot')}. ${spec.storeLabel} requires at least ` +
          `${spec.minScreenshotsPerSet}, so the listing cannot be submitted as it stands.`,
      ),
    );
  }
  return out;
}

function checkIosScreenshotSizes(shots) {
  const out = [];
  for (const s of shots.filter((x) => !x.info?.error)) {
    if (!matchIosScreenshotSize(s.info.width, s.info.height)) {
      out.push(
        finding(
          'unrecognised-size',
          NOTICE,
          'Screenshot size matches no display class this tool knows',
          `"${s.name}" is ${dim(s.info)}, which is not in this tool's table of App Store display ` +
            'classes. That is a reason to check, not a verdict: Apple adds and retires device ' +
            'classes, and the table here is a transcription that can fall behind. Confirm the size ' +
            "against App Store Connect's current screenshot specifications before changing anything.",
          [s.name],
        ),
      );
    }
  }
  return out;
}

function checkPlayScreenshotBounds(shots, spec) {
  const out = [];
  const { minSide, maxSide, maxAspectRatio } = spec.screenshot;
  for (const s of shots.filter((x) => !x.info?.error)) {
    const short = Math.min(s.info.width, s.info.height);
    const long = Math.max(s.info.width, s.info.height);
    if (short < minSide || long > maxSide) {
      out.push(
        finding(
          'screenshot-out-of-bounds',
          DANGER,
          'Screenshot is outside the accepted size range',
          `"${s.name}" is ${dim(s.info)}. ${spec.storeLabel} requires each side between ` +
            `${minSide} and ${maxSide} pixels.`,
          [s.name],
        ),
      );
    }
    const ratio = long / short;
    if (ratio > maxAspectRatio + 1e-9) {
      out.push(
        finding(
          'screenshot-aspect-ratio',
          DANGER,
          'Screenshot is too elongated',
          `"${s.name}" is ${dim(s.info)}, an aspect ratio of ${ratio.toFixed(2)}:1. ` +
            `${spec.storeLabel} accepts at most ${maxAspectRatio}:1. A tall-phone screenshot that ` +
            'has been padded or stitched is the usual cause.',
          [s.name],
        ),
      );
    }
  }
  return out;
}

/**
 * Check one set of assets against one store.
 *
 * `assets`: `[{ name, role, info }]`. Roles other than 'icon' and
 * 'feature-graphic' are treated as screenshots, since that is what an
 * unlabelled file dropped on the page almost always is.
 */
export function classifyAssets(assets, { store = 'ios' } = {}) {
  const spec = specFor(store);
  const list = (assets || []).map((a) => ({ ...a, role: a.role || 'screenshot' }));
  const shots = list.filter((a) => a.role === 'screenshot');

  const findings = [
    ...checkReadable(list),
    ...checkFormats(list, spec),
    ...checkIcon(list, spec),
    ...checkFeatureGraphic(list, spec),
    ...checkCount(shots, spec),
    ...checkSetConsistency(shots),
    ...(spec.store === 'ios' ? checkIosScreenshotSizes(shots) : checkPlayScreenshotBounds(shots, spec)),
  ];

  // Stable ordering: danger first, then by the order the checks above run, so
  // a CI log diffs cleanly between runs and the thing that blocks the upload
  // is the thing at the top.
  const rank = (f) => (f.severity === DANGER ? 0 : 1);
  findings.sort((a, b) => rank(a) - rank(b));

  return {
    store: spec.store,
    storeLabel: spec.storeLabel,
    source: spec.source,
    counts: {
      assets: list.length,
      screenshots: shots.length,
      danger: findings.filter((f) => f.severity === DANGER).length,
      notice: findings.filter((f) => f.severity === NOTICE).length,
    },
    findings,
  };
}

/** True when anything found would block the upload. Drives the CLI exit code. */
export const hasBlockingFinding = (report) => report.findings.some((f) => f.severity === DANGER);

/**
 * Guess an asset's role from its filename, so a directory of files can be
 * checked without labelling every one by hand. Deliberately conservative:
 * anything not obviously an icon or a feature graphic is a screenshot, which
 * is the role with the least severe checks, so a wrong guess under-reports
 * rather than inventing a failure.
 */
export function roleFromName(name) {
  const base = String(name).toLowerCase().replace(/\\/g, '/').split('/').pop();
  if (/feature[-_ ]?graphic/.test(base)) return 'feature-graphic';
  // `ic_launcher-playstore.png` is what Android Studio names the Play Store
  // icon it generates, so it is the single most likely filename to arrive as
  // a Play icon and is worth matching by name rather than by the word "icon".
  if (/^ic_launcher([-_.]|$)/.test(base)) return 'icon';
  // "icon" has to stand alone as a word: otherwise `iconic-view.png` gets the
  // strictest checks in the tool applied to an ordinary screenshot.
  if (/(^|[-_ ])(app)?icon([-_ ]|\.|$)/.test(base)) return 'icon';
  return 'screenshot';
}
