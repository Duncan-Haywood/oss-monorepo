// Classifies a probe result (real HTTP responses, collected by probe.mjs's
// live network requests or pasted in by hand) against the same criteria
// Chrome's own "installable-manifest" Lighthouse audit checks -- see
// https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest/ and
// https://developer.chrome.com/docs/webapps/manifest -- so a report from this
// tool and a Lighthouse report should never disagree about whether a manifest
// clears the bar.
//
// Pure function, no I/O, no network -- this is the module both the CLI
// (check.mjs, which fetches for real) and the browser page (index.html,
// which can only ever analyse a payload someone already fetched) import, so
// the classification logic exists exactly once.
//
// Why the browser can't fetch this itself for an arbitrary third-party URL:
// a page hosted on this tool's own origin calling fetch() against
// `https://someone-elses-site.example/` is a cross-origin request, and it is
// blocked unless that site's own server opts in with an
// Access-Control-Allow-Origin response header. Most sites do not send CORS
// headers on their HTML page or their manifest.json (there is no reason for
// them to), so a browser-only version of this tool would fail to read the
// response for almost every real page anyone would want to check. Only a
// non-browser HTTP client (this CLI, curl, Lighthouse's own Chrome instance)
// is not subject to that restriction. See README.md and index.html's FAQ.
//
// The checks below, and why each is graded the way it is:
//
//   no-manifest-link        No `<link rel="manifest">` in the page HTML at
//                            all. Chrome will never offer to install a page
//                            with no manifest -- the single hardest blocker.
//   manifest-unreachable     The link points somewhere that doesn't answer
//                            with a successful response.
//   manifest-not-json       The response isn't parseable JSON.
//   missing-name             Neither `name` nor `short_name` is set. Chrome's
//                            install criteria require at least one.
//   missing-display          `display` is absent (defaults to "browser" per
//                            spec) or set to a value other than `standalone`,
//                            `fullscreen`, or `minimal-ui`. A `browser`
//                            display is explicitly excluded from Chrome's
//                            install criteria.
//   insecure-origin          The page is not served over HTTPS (localhost is
//                            exempt, matching the spec's secure-context rule
//                            developers rely on daily). Installability
//                            requires a secure context.
//   missing-192-icon         No icon in the manifest is at least 192x192 (or
//                            declares `sizes: "any"`). Chrome's criteria
//                            require one.
//   missing-512-icon         (notice) No icon is at least 512x512. Not a hard
//                            install blocker, but Chrome uses one for a
//                            richer install/splash UI when present.
//   icon-unreachable          (per icon) An icon URL the manifest lists did
//                            not respond successfully or didn't come back as
//                            an image.
//   missing-start-url         (notice) No explicit `start_url` -- defaults to
//                            the manifest's own document URL, which usually
//                            works but is rarely what you meant.
//   missing-theme-colors      (notice) No `theme_color`/`background_color` --
//                            cosmetic only, affects the splash screen and
//                            browser UI tinting, never installability itself.

const REQUIRED_DISPLAY_MODES = new Set(['standalone', 'fullscreen', 'minimal-ui']);

function safeProtocol(urlString) {
  try {
    return new URL(urlString).protocol;
  } catch {
    return '(unknown)';
  }
}

function parseSizes(sizesAttr) {
  if (typeof sizesAttr !== 'string') return [];
  if (sizesAttr.trim().toLowerCase() === 'any') return ['any'];
  return sizesAttr
    .split(/\s+/)
    .map((s) => {
      const m = /^(\d+)x(\d+)$/i.exec(s.trim());
      return m ? Math.min(Number(m[1]), Number(m[2])) : null;
    })
    .filter((n) => n !== null);
}

function iconMeetsMinSize(icon, minPx) {
  const sizes = parseSizes(icon.sizes);
  if (sizes.includes('any')) return true;
  return sizes.some((s) => s >= minPx);
}

function isReachableImage(icon) {
  if (!icon.fetch || icon.fetch.ok !== true) return false;
  if (icon.fetch.status == null || icon.fetch.status < 200 || icon.fetch.status >= 300) return false;
  const type = (icon.fetch.contentType || '').toLowerCase();
  // Some servers omit or misreport content-type on static assets; only flag
  // it when a content-type is present and clearly isn't an image, rather than
  // demanding one exist.
  if (type && !type.includes('image')) return false;
  return true;
}

/**
 * @param {string} pageUrl
 * @param {ReturnType<import('./probe.mjs').runProbe>} probe - already-awaited
 *   probe result, or an equivalent object pasted in from the CLI's JSON.
 * @returns {{
 *   target: string, findings: object[], dangerCount: number,
 *   noticeCount: number, ok: boolean, incomplete: boolean,
 *   manifestUrl: string|null, iconCount: number,
 * }}
 */
export function buildReport(pageUrl, probe) {
  const p = probe && typeof probe === 'object' ? probe : {};
  const findings = [];
  let incomplete = false;

  if (!p.page || p.page.ok === false) {
    incomplete = true;
    findings.push({
      id: 'page-unreachable',
      severity: 'danger',
      title: 'The page itself could not be fetched',
      detail: `Fetching ${pageUrl} failed: ${p.page?.error ?? 'unknown error'}. None of the manifest checks below could run.`,
      evidence: p.page?.error ?? 'unknown error',
    });
    return finish(pageUrl, findings, incomplete, null, 0);
  }

  if (p.secure === false) {
    findings.push({
      id: 'insecure-origin',
      severity: 'danger',
      title: 'Page is not served over HTTPS',
      detail:
        'Installability requires a secure context. Browsers will not offer to install a page ' +
        'served over plain HTTP (localhost is exempt during development).',
      evidence: `page URL scheme: ${safeProtocol(pageUrl)}`,
    });
  }

  if (!p.manifestHref) {
    findings.push({
      id: 'no-manifest-link',
      severity: 'danger',
      title: 'No <link rel="manifest"> found on the page',
      detail:
        'A page needs a <link rel="manifest"> tag (with a manifest URL in its href attribute) ' +
        'before a browser will consider it installable. None was found in the fetched HTML.',
      evidence: 'no <link rel="manifest"> tag in page HTML',
    });
    return finish(pageUrl, findings, incomplete, null, 0);
  }

  if (!p.manifest || p.manifest.ok === false || (p.manifest.status ?? 0) < 200 || (p.manifest.status ?? 0) >= 300) {
    incomplete = true;
    findings.push({
      id: 'manifest-unreachable',
      severity: 'danger',
      title: 'The manifest link did not resolve to a usable file',
      detail: `<link rel="manifest"> points at ${p.manifestUrl ?? p.manifestHref}, which did not respond successfully (${p.manifest?.error ?? `HTTP ${p.manifest?.status}`}).`,
      evidence: p.manifest?.error ?? `HTTP ${p.manifest?.status}`,
    });
    return finish(pageUrl, findings, incomplete, p.manifestUrl ?? null, 0);
  }

  if (!p.manifestJson) {
    findings.push({
      id: 'manifest-not-json',
      severity: 'danger',
      title: 'The manifest is not valid JSON',
      detail: `${p.manifestUrl} responded successfully but its body did not parse as JSON: ${p.parseError ?? 'unknown parse error'}.`,
      evidence: p.parseError ?? 'unknown parse error',
    });
    return finish(pageUrl, findings, incomplete, p.manifestUrl ?? null, 0);
  }

  const manifest = p.manifestJson;

  if (!manifest.name && !manifest.short_name) {
    findings.push({
      id: 'missing-name',
      severity: 'danger',
      title: 'Manifest has neither "name" nor "short_name"',
      detail: 'Chrome\'s install criteria require at least one of "name" or "short_name" to be set.',
      evidence: 'name and short_name both absent',
    });
  }

  const display = typeof manifest.display === 'string' ? manifest.display.toLowerCase() : null;
  if (!display) {
    findings.push({
      id: 'missing-display',
      severity: 'danger',
      title: 'Manifest has no "display" field',
      detail:
        'With no "display" field the spec default is "browser", which is explicitly excluded ' +
        'from Chrome\'s install criteria -- set "display" to "standalone", "fullscreen", or ' +
        '"minimal-ui".',
      evidence: 'display: (absent, defaults to "browser")',
    });
  } else if (!REQUIRED_DISPLAY_MODES.has(display)) {
    findings.push({
      id: 'missing-display',
      severity: 'danger',
      title: `"display" is set to "${manifest.display}", which is not installable`,
      detail:
        'Chrome only offers to install a page whose manifest "display" is "standalone", ' +
        '"fullscreen", or "minimal-ui".',
      evidence: `display: ${manifest.display}`,
    });
  }

  const icons = Array.isArray(p.icons) ? p.icons : [];
  const hasAny192 = icons.some((icon) => iconMeetsMinSize(icon, 192) && isReachableImage(icon));
  const hasAny512 = icons.some((icon) => iconMeetsMinSize(icon, 512) && isReachableImage(icon));

  if (icons.length === 0) {
    findings.push({
      id: 'missing-192-icon',
      severity: 'danger',
      title: 'Manifest lists no icons at all',
      detail: 'Chrome\'s install criteria require at least one icon of 192x192 or larger (or sizes: "any").',
      evidence: 'icons: (absent or empty)',
    });
  } else if (!hasAny192) {
    findings.push({
      id: 'missing-192-icon',
      severity: 'danger',
      title: 'No reachable icon is at least 192x192',
      detail:
        'Chrome requires at least one icon of 192x192 or larger that actually loads. The icons ' +
        'listed are either smaller, unreachable, or not images.',
      evidence: icons.map((i) => `${i.src ?? '(no src)'} sizes=${i.sizes ?? '?'} status=${i.fetch?.status ?? i.fetch?.error}`).join('; '),
    });
  } else if (!hasAny512) {
    findings.push({
      id: 'missing-512-icon',
      severity: 'notice',
      title: 'No reachable icon is at least 512x512',
      detail:
        'Not a hard installability blocker, but Chrome uses a 512x512-or-larger icon for a ' +
        'richer install dialog and splash screen when one is present.',
      evidence: icons.map((i) => `${i.src ?? '(no src)'} sizes=${i.sizes ?? '?'}`).join('; '),
    });
  }

  for (const icon of icons) {
    if (isReachableImage(icon)) continue;
    findings.push({
      id: 'icon-unreachable',
      severity: 'danger',
      title: `Icon did not load: ${icon.src ?? '(no src)'}`,
      detail: icon.resolvedUrl
        ? `${icon.resolvedUrl} responded with ${icon.fetch?.error ?? `HTTP ${icon.fetch?.status}, content-type ${icon.fetch?.contentType ?? '(none)'}`}.`
        : 'This icon entry has no usable "src", so it could not be fetched at all.',
      evidence: icon.fetch?.error ?? `status=${icon.fetch?.status ?? 'n/a'} content-type=${icon.fetch?.contentType ?? 'n/a'}`,
    });
  }

  if (!manifest.start_url) {
    findings.push({
      id: 'missing-start-url',
      severity: 'notice',
      title: 'Manifest has no explicit "start_url"',
      detail:
        'Not a hard blocker -- it defaults to the manifest\'s own document URL -- but an explicit ' +
        '"start_url" is recommended so the installed app opens where you intend, not wherever the ' +
        'manifest happened to be linked from.',
      evidence: 'start_url: (absent)',
    });
  }

  if (!manifest.theme_color && !manifest.background_color) {
    findings.push({
      id: 'missing-theme-colors',
      severity: 'notice',
      title: 'No "theme_color" or "background_color"',
      detail:
        'Cosmetic only -- these tint the browser UI and splash screen for the installed app. ' +
        'Never a reason installability itself would fail.',
      evidence: 'theme_color and background_color both absent',
    });
  }

  return finish(pageUrl, findings, incomplete, p.manifestUrl ?? null, icons.length);
}

function finish(target, findings, incomplete, manifestUrl, iconCount) {
  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;
  return {
    target,
    manifestUrl,
    iconCount,
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
