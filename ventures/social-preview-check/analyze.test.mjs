import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport, FACEBOOK_MIN, FACEBOOK_RECOMMENDED, TWITTER_LARGE_MIN } from './analyze.mjs';

function probe(overrides = {}) {
  return {
    ok: true,
    status: 200,
    tags: { title: null, canonical: null, og: {}, twitter: {}, duplicates: {}, ...overrides.tags },
    images: { ogImage: null, twitterImage: null, ...overrides.images },
  };
}

function findingIds(report) {
  return report.findings.map((f) => f.id);
}

function imageFetch(width, height, format = 'jpeg', overrides = {}) {
  return { ok: true, status: 200, contentType: `image/${format}`, error: null, size: { format, width, height, incomplete: false }, ...overrides };
}

// --- incomplete probe -------------------------------------------------------

test('a failed probe produces no findings and is marked incomplete', () => {
  const report = buildReport('https://example.com/', { ok: false, error: 'timed out' });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings, []);
});

test('a redirect response is reported as its own notice, not followed', () => {
  const report = buildReport('https://example.com/', {
    ok: true, status: 301, redirectStatus: 301, redirectLocation: 'https://example.com/final', tags: null, images: null,
  });
  assert.equal(report.incomplete, false);
  assert.deepEqual(findingIds(report), ['redirect-not-followed']);
  assert.equal(report.findings[0].severity, 'notice');
  assert.equal(report.ok, true);
});

// --- og:title / og:description ---------------------------------------------

test('missing-og-title fires (danger) when neither og:title nor <title> exists', () => {
  const report = buildReport('https://example.com/', probe());
  assert.ok(findingIds(report).includes('missing-og-title'));
  assert.equal(report.findings.find((f) => f.id === 'missing-og-title').severity, 'danger');
});

test('missing-og-title downgrades to a notice when <title> exists as a fallback', () => {
  const report = buildReport('https://example.com/', probe({ tags: { title: 'Example Page' } }));
  const ids = findingIds(report);
  assert.ok(ids.includes('missing-og-title-has-title-fallback'));
  assert.ok(!ids.includes('missing-og-title'));
  assert.equal(report.findings.find((f) => f.id === 'missing-og-title-has-title-fallback').severity, 'notice');
});

test('no og:title finding when og:title is present', () => {
  const report = buildReport('https://example.com/', probe({ tags: { og: { title: 'Set' } } }));
  assert.ok(!findingIds(report).some((id) => id.startsWith('missing-og-title')));
});

test('missing-og-description fires as a notice', () => {
  const report = buildReport('https://example.com/', probe({ tags: { og: { title: 'x' } } }));
  const f = report.findings.find((f2) => f2.id === 'missing-og-description');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

// --- preview image presence and absolute-URL requirement -------------------

test('missing-preview-image (danger) when neither og:image nor twitter:image is set', () => {
  const report = buildReport('https://example.com/', probe({ tags: { og: { title: 'x' } } }));
  const f = report.findings.find((f2) => f2.id === 'missing-preview-image');
  assert.ok(f);
  assert.equal(f.severity, 'danger');
});

test('relative-og-image-url fires (danger) for a non-absolute og:image', () => {
  const report = buildReport('https://example.com/page', probe({ tags: { og: { image: '/img.png' } } }));
  assert.ok(findingIds(report).includes('relative-og-image-url'));
  assert.ok(!findingIds(report).includes('missing-preview-image'));
});

test('relative-twitter-image-url fires (danger) for a non-absolute twitter:image', () => {
  const report = buildReport('https://example.com/page', probe({ tags: { twitter: { image: '/img.png' } } }));
  assert.ok(findingIds(report).includes('relative-twitter-image-url'));
});

// --- image fetch / size classification (og:image) ---------------------------

test('og-image-unreachable fires (danger) when the image request failed', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/missing.png' } },
    images: { ogImage: { url: 'https://example.com/missing.png', fetch: { ok: false, status: 404, error: 'HTTP 404', size: null } } },
  }));
  const f = report.findings.find((f2) => f2.id === 'og-image-unreachable');
  assert.ok(f);
  assert.equal(f.severity, 'danger');
});

test('og-image-below-minimum fires (danger) under the Facebook minimum', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/small.png' } },
    images: { ogImage: { url: 'https://example.com/small.png', fetch: imageFetch(100, 100, 'png') } },
  }));
  const f = report.findings.find((f2) => f2.id === 'og-image-below-minimum');
  assert.ok(f, `expected a below-minimum finding for an image under ${FACEBOOK_MIN.width}x${FACEBOOK_MIN.height}`);
  assert.equal(f.severity, 'danger');
});

test('og-image-below-recommended fires (notice) above minimum but below recommended', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/mid.png' } },
    images: { ogImage: { url: 'https://example.com/mid.png', fetch: imageFetch(400, 300, 'png') } },
  }));
  const f = report.findings.find((f2) => f2.id === 'og-image-below-recommended');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('no size finding when the image meets the recommended size', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/big.png' } },
    images: { ogImage: { url: 'https://example.com/big.png', fetch: imageFetch(FACEBOOK_RECOMMENDED.width, FACEBOOK_RECOMMENDED.height, 'png') } },
  }));
  assert.ok(!findingIds(report).some((id) => id.startsWith('og-image-below')));
});

test('og-image-not-an-image fires (notice) for a non-image content-type', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/page.html' } },
    images: { ogImage: { url: 'https://example.com/page.html', fetch: { ok: true, status: 200, contentType: 'text/html', error: null, size: null } } },
  }));
  assert.ok(findingIds(report).includes('og-image-not-an-image'));
});

test('og-image-format-not-decoded fires (notice) when bytes match no known signature', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/img.avif' } },
    images: { ogImage: { url: 'https://example.com/img.avif', fetch: { ok: true, status: 200, contentType: 'image/avif', error: null, size: null } } },
  }));
  assert.ok(findingIds(report).includes('og-image-format-not-decoded'));
});

test('og-image-dimensions-undetermined fires (notice) on a truncated read', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/img.jpg' } },
    images: { ogImage: { url: 'https://example.com/img.jpg', fetch: { ok: true, status: 200, contentType: 'image/jpeg', error: null, size: { format: 'jpeg', width: null, height: null, incomplete: true } } } },
  }));
  assert.ok(findingIds(report).includes('og-image-dimensions-undetermined'));
});

// --- twitter:card -------------------------------------------------------------

test('missing-twitter-card fires (notice) when twitter:card is absent', () => {
  const report = buildReport('https://example.com/', probe({ tags: { og: { title: 'x', image: 'https://example.com/i.png' } } }));
  const f = report.findings.find((f2) => f2.id === 'missing-twitter-card');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('twitter-large-image-card-missing-image fires (danger) when summary_large_image has no image anywhere', () => {
  const report = buildReport('https://example.com/', probe({ tags: { twitter: { card: 'summary_large_image' } } }));
  const f = report.findings.find((f2) => f2.id === 'twitter-large-image-card-missing-image');
  assert.ok(f);
  assert.equal(f.severity, 'danger');
});

test('summary_large_image below the Twitter minimum fires danger, using twitter:image when set', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { twitter: { card: 'summary_large_image', image: 'https://example.com/small.jpg' } },
    images: { twitterImage: { url: 'https://example.com/small.jpg', fetch: imageFetch(100, 100) } },
  }));
  const f = report.findings.find((f2) => f2.id === 'twitter-large-image-below-minimum');
  assert.ok(f, `expected below-minimum for an image under ${TWITTER_LARGE_MIN.width}x${TWITTER_LARGE_MIN.height}`);
  assert.equal(f.severity, 'danger');
});

test('summary_large_image falls back to og:image when twitter:image is absent, and uses its fetch result', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/small.jpg' }, twitter: { card: 'summary_large_image' } },
    images: { ogImage: { url: 'https://example.com/small.jpg', fetch: imageFetch(100, 100) } },
  }));
  assert.ok(findingIds(report).includes('twitter-large-image-below-minimum'));
  assert.ok(findingIds(report).includes('twitter-image-falls-back-to-og-image'));
});

test('twitter-image-falls-back-to-og-image does not fire when twitter:image is set explicitly', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { image: 'https://example.com/a.jpg' }, twitter: { card: 'summary', image: 'https://example.com/b.jpg' } },
    images: {
      ogImage: { url: 'https://example.com/a.jpg', fetch: imageFetch(1200, 630) },
      twitterImage: { url: 'https://example.com/b.jpg', fetch: imageFetch(1200, 630) },
    },
  }));
  assert.ok(!findingIds(report).includes('twitter-image-falls-back-to-og-image'));
});

// --- duplicate tags and og:url mismatch --------------------------------------

test('duplicate-meta-tag fires once per duplicated key, as a notice', () => {
  const report = buildReport('https://example.com/', probe({
    tags: { og: { title: 'x', image: 'https://example.com/i.png' }, duplicates: { 'og:title': 2, 'og:image': 3 } },
  }));
  const dupes = report.findings.filter((f) => f.id === 'duplicate-meta-tag');
  assert.equal(dupes.length, 2);
  assert.ok(dupes.every((f) => f.severity === 'notice'));
});

test('og-url-mismatch fires (notice) when og:url differs from the checked URL', () => {
  const report = buildReport('https://example.com/page', probe({
    tags: { og: { title: 'x', image: 'https://example.com/i.png', url: 'https://example.com/different' } },
  }));
  const f = report.findings.find((f2) => f2.id === 'og-url-mismatch');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('og-url-mismatch does not fire when og:url matches (ignoring a trailing slash)', () => {
  const report = buildReport('https://example.com/page', probe({
    tags: { og: { title: 'x', image: 'https://example.com/i.png', url: 'https://example.com/page/' } },
  }));
  assert.ok(!findingIds(report).includes('og-url-mismatch'));
});

// --- overall ok / counts ------------------------------------------------------

test('a fully correct page produces zero findings and ok: true', () => {
  const report = buildReport('https://example.com/page', probe({
    tags: {
      title: 'Example',
      og: { title: 'Example', description: 'A description', image: 'https://example.com/i.jpg', url: 'https://example.com/page' },
      twitter: { card: 'summary_large_image', image: 'https://example.com/i.jpg' },
    },
    images: {
      ogImage: { url: 'https://example.com/i.jpg', fetch: imageFetch(1200, 630) },
      twitterImage: { url: 'https://example.com/i.jpg', fetch: imageFetch(1200, 630) },
    },
  }));
  assert.deepEqual(report.findings, []);
  assert.equal(report.ok, true);
});

test('a maximally broken page produces multiple danger findings and ok: false', () => {
  const report = buildReport('https://example.com/', probe());
  assert.ok(report.dangerCount >= 2);
  assert.equal(report.ok, false);
});
