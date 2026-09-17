// The store requirements this tool checks against, kept as data so that the
// engine holds no numbers of its own and every rule can name where it comes
// from.
//
// HOW MUCH TO TRUST THE TABLES BELOW
//
// The checks in this tool split into two kinds, and the split matters more
// than any individual number:
//
//   Structural checks need no table at all. "Is this file actually a PNG or a
//   JPEG?", "does this icon declare transparency?", "do the five screenshots
//   in this set disagree about their own dimensions?" are answered from the
//   files themselves. They cannot go stale, because there is nothing in them
//   to fall out of date.
//
//   Table checks compare against the accepted-size lists below. Those lists
//   are transcribed from each store's published specification and are a
//   convenience, not an authority: Apple and Google add device classes and
//   retire them, and a table in someone else's repository is exactly the kind
//   of thing that is correct on the day it is written and quietly wrong a year
//   later.
//
// So a size this tool does not recognise is reported as a NOTICE that names
// the table as the thing that might be out of date -- never as a failure. The
// danger-severity findings are the structural ones, plus the handful of fixed
// values (a 1024x1024 App Store icon, a 512x512 Play icon, a 1024x500 feature
// graphic) that have been stable for the life of both stores.
//
// Verify anything you are about to act on against the store's own current
// documentation. Both are linked from the page and named in `source` below.

export const SPEC_REVIEWED = '2026-09-11';

/**
 * App Store Connect screenshot sizes, portrait orientation. Landscape is the
 * same pair transposed, which the engine does rather than doubling the table.
 *
 * Several display classes accept more than one size -- Apple lets a newer,
 * larger screenshot stand in for an older class -- so `label` is what a size
 * means rather than a unique key.
 */
export const IOS_SCREENSHOT_SIZES = [
  { width: 1320, height: 2868, label: 'iPhone 6.9" display' },
  { width: 1290, height: 2796, label: 'iPhone 6.9" / 6.7" display' },
  { width: 1284, height: 2778, label: 'iPhone 6.7" / 6.5" display' },
  { width: 1242, height: 2688, label: 'iPhone 6.5" display' },
  { width: 1206, height: 2622, label: 'iPhone 6.3" display' },
  { width: 1179, height: 2556, label: 'iPhone 6.1" display' },
  { width: 1242, height: 2208, label: 'iPhone 5.5" display' },
  { width: 2064, height: 2752, label: 'iPad Pro 13" display' },
  { width: 2048, height: 2732, label: 'iPad Pro 12.9" display' },
  { width: 1668, height: 2388, label: 'iPad Pro 11" display' },
  { width: 1640, height: 2360, label: 'iPad 10.9" display' },
];

export const IOS = {
  store: 'ios',
  storeLabel: 'Apple App Store (App Store Connect)',
  source:
    "Apple's App Store Connect screenshot specifications and Human Interface Guidelines app-icon requirements",
  sourceUrl: 'https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/',
  acceptedFormats: ['png', 'jpeg'],
  screenshotSizes: IOS_SCREENSHOT_SIZES,
  icon: {
    width: 1024,
    height: 1024,
    // The rule this tool exists for. App Store Connect rejects an app icon
    // that declares an alpha channel or any transparency, and it does so at
    // upload time -- after the build, after the archive, at the point in a
    // release where a round trip costs the most.
    allowTransparency: false,
    allowedFormats: ['png', 'jpeg'],
  },
  maxScreenshotsPerSet: 10,
  minScreenshotsPerSet: 1,
};

export const PLAY = {
  store: 'play',
  storeLabel: 'Google Play Console',
  source: "Google Play Console's graphic asset requirements for a store listing",
  sourceUrl: 'https://support.google.com/googleplay/android-developer/answer/9866151',
  acceptedFormats: ['png', 'jpeg'],
  screenshot: {
    minSide: 320,
    maxSide: 3840,
    // Play states the limit as an aspect ratio rather than a size list, which
    // is why there is no size table for it: any dimensions inside these bounds
    // are acceptable, so there is nothing here that can go stale.
    maxAspectRatio: 2,
  },
  icon: {
    width: 512,
    height: 512,
    allowTransparency: true,
    allowedFormats: ['png'],
  },
  featureGraphic: {
    width: 1024,
    height: 500,
    allowTransparency: false,
    allowedFormats: ['png', 'jpeg'],
  },
  maxScreenshotsPerSet: 8,
  minScreenshotsPerSet: 2,
};

export const STORES = { ios: IOS, play: PLAY };

export function specFor(store) {
  const spec = STORES[String(store || '').toLowerCase()];
  if (!spec) {
    throw new Error(`unknown store "${store}" (expected one of: ${Object.keys(STORES).join(', ')})`);
  }
  return spec;
}

/**
 * Does this size match a published App Store display class, in either
 * orientation? Returns the class label, or null.
 */
export function matchIosScreenshotSize(width, height) {
  for (const size of IOS_SCREENSHOT_SIZES) {
    if (width === size.width && height === size.height) return `${size.label}, portrait`;
    if (width === size.height && height === size.width) return `${size.label}, landscape`;
  }
  return null;
}
