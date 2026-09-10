// Classifies one already-fetched page's Open Graph / Twitter Card metadata
// (plus the real dimensions of whichever preview image it points at) into
// named social-link-preview problems -- a broken or missing image, a
// relative og:image URL most crawlers won't resolve, an image too small for
// the platform that would show it, and a duplicated tag from a CMS plugin
// stepping on a hand-written one.
//
// Pure function, no I/O -- this is the module both the CLI (check.mjs, which
// fetches for real via probe.mjs) and the browser page (which can only ever
// analyse a payload someone already fetched, for the CORS reasons every
// sibling checker venture here explains) import, so the classification logic
// exists exactly once.
//
// The value here isn't "does an og:image tag exist" -- any grep does that.
// It's applying the fallback chain each platform actually documents, the way
// a developer who has hit a broken preview once already knows and a naive
// tag-presence checker does not:
//
//   * Twitter/X's twitter:image, twitter:title and twitter:description each
//     fall back to the matching og:* tag when absent -- a page with no
//     twitter:image at all is not necessarily broken on X, but IS broken if
//     og:image is also missing or unreachable. This tool follows that chain
//     rather than reporting "missing twitter:image" as a finding on its own.
//   * og:image is REQUIRED to be an absolute URL by the Open Graph protocol
//     itself (ogp.me) -- a relative path is a silent failure on most
//     crawlers, not a style nit.
//   * Each platform documents its own minimum and recommended image size
//     (Facebook: 200x200 minimum, 1200x630 recommended; Twitter's
//     summary_large_image: 300x157 minimum, 1200x628 recommended) and
//     platforms render nothing, or fall back to a smaller card type, below
//     their own minimum -- this tool fetches the actual image bytes and
//     reads its real dimensions rather than trusting an og:image:width tag
//     that may not match the file.

export const FACEBOOK_MIN = { width: 200, height: 200 };
export const FACEBOOK_RECOMMENDED = { width: 1200, height: 630 };
export const TWITTER_LARGE_MIN = { width: 300, height: 157 };
export const TWITTER_LARGE_RECOMMENDED = { width: 1200, height: 628 };

function isAbsoluteHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function below(size, min) {
  return size.width < min.width || size.height < min.height;
}

function finding(id, severity, title, detail, evidence) {
  return { id, severity, title, detail, evidence };
}

function classifyImage(prefix, label, fetchResult, findings, minRule, recommendedRule) {
  if (!fetchResult) return;
  if (!fetchResult.ok) {
    findings.push(
      finding(
        `${prefix}-unreachable`,
        'danger',
        `${label} image could not be fetched`,
        `Requesting the resolved image URL failed${fetchResult.status ? ` (HTTP ${fetchResult.status})` : ''}: ` +
          `${fetchResult.error || 'no response body was returned'}. A crawler that can't fetch this URL either ` +
          'will render no image, the same as if the tag were absent.',
        `image request: ${fetchResult.error || `HTTP ${fetchResult.status}`}`,
      ),
    );
    return;
  }
  if (fetchResult.contentType && !/^image\//i.test(fetchResult.contentType)) {
    findings.push(
      finding(
        `${prefix}-not-an-image`,
        'notice',
        `${label} image URL did not return an image Content-Type`,
        `The response's Content-Type was "${fetchResult.contentType}", not an image/* type. Some crawlers ` +
          'refuse to render a preview image whose Content-Type header does not say it is one, even if the ' +
          'bytes are a valid image.',
        `content-type: ${fetchResult.contentType}`,
      ),
    );
  }
  const size = fetchResult.size;
  if (!size) {
    findings.push(
      finding(
        `${prefix}-format-not-decoded`,
        'notice',
        `${label} image format was not recognised`,
        'The fetched bytes did not match a PNG, JPEG, GIF or WebP signature this tool decodes, so its pixel ' +
          'dimensions could not be checked against platform minimums. This is not necessarily a problem -- ' +
          'confirm the URL actually serves an image.',
        `first bytes did not match a known image signature`,
      ),
    );
    return;
  }
  if (size.incomplete) {
    findings.push(
      finding(
        `${prefix}-dimensions-undetermined`,
        'notice',
        `${label} image dimensions could not be determined from the bytes fetched`,
        `Recognised the file as ${size.format}, but the fetched prefix did not include the dimension field ` +
          '(an unusually large metadata block before it, most likely). Dimensions were not checked against ' +
          'platform minimums.',
        `format: ${size.format}, incomplete read`,
      ),
    );
    return;
  }
  if (below(size, minRule)) {
    findings.push(
      finding(
        `${prefix}-below-minimum`,
        'danger',
        `${label} image (${size.width}x${size.height}) is below the documented minimum (${minRule.width}x${minRule.height})`,
        `The image is ${size.width}x${size.height} ${size.format}. Below the platform-documented minimum of ` +
          `${minRule.width}x${minRule.height}, the image is commonly not rendered at all -- treat this as a ` +
          'broken preview, not a smaller one. Platform behaviour is not guaranteed and can change without notice.',
        `${size.format} image: ${size.width}x${size.height}`,
      ),
    );
  } else if (below(size, recommendedRule)) {
    findings.push(
      finding(
        `${prefix}-below-recommended`,
        'notice',
        `${label} image (${size.width}x${size.height}) is below the recommended size (${recommendedRule.width}x${recommendedRule.height})`,
        `The image is ${size.width}x${size.height} ${size.format} -- above the hard minimum, so it should ` +
          `render, but below the ${recommendedRule.width}x${recommendedRule.height} the platform recommends for ` +
          'a full-size preview. It may be upscaled, cropped tighter than intended, or shown at a smaller size.',
        `${size.format} image: ${size.width}x${size.height}`,
      ),
    );
  }
}

/**
 * @param {string} target - the URL that was probed (for display only)
 * @param {object} probe - the shape probe.mjs's runProbe resolves to
 * @returns {{target: string, probe: object, findings: object[],
 *   dangerCount: number, noticeCount: number, ok: boolean, incomplete: boolean}}
 */
export function buildReport(target, probe) {
  const p = probe && typeof probe === 'object' ? probe : { ok: false };
  const incomplete = p.ok === false;
  const findings = [];

  if (!incomplete && p.redirectStatus) {
    findings.push(
      finding(
        'redirect-not-followed',
        'notice',
        `The URL redirected (HTTP ${p.redirectStatus}) and this tool does not follow it`,
        `This tool reports the response it actually received, the same way a social platform's own crawler ` +
          `would decide what to render from it -- it does not chase the Location header. Point the checker ` +
          `directly at the final URL${p.redirectLocation ? ` (${p.redirectLocation})` : ''} to check the page a ` +
          'visitor would actually land on.',
        `status: ${p.redirectStatus}${p.redirectLocation ? `, location: ${p.redirectLocation}` : ''}`,
      ),
    );
  } else if (!incomplete) {
    const tags = p.tags || { title: null, canonical: null, og: {}, twitter: {}, duplicates: {} };
    const og = tags.og || {};
    const twitter = tags.twitter || {};
    const images = p.images || {};

    // --- og:title / og:description --------------------------------------
    if (!og.title) {
      if (tags.title) {
        findings.push(
          finding(
            'missing-og-title-has-title-fallback',
            'notice',
            'No og:title tag (some platforms fall back to your <title>)',
            'og:title is absent. Facebook and LinkedIn often fall back to the page <title> when it is missing, ' +
              'but this is not part of the Open Graph spec and not guaranteed -- an explicit og:title is the ' +
              'reliable way to control exactly what a shared link shows.',
            `<title>: "${tags.title}"`,
          ),
        );
      } else {
        findings.push(
          finding(
            'missing-og-title',
            'danger',
            'No og:title tag and no <title> to fall back to',
            'Neither og:title nor a page <title> is present. A platform rendering this link has no title text ' +
              'to show at all.',
            'og:title: (not set); <title>: (not set)',
          ),
        );
      }
    }
    if (!og.description) {
      findings.push(
        finding(
          'missing-og-description',
          'notice',
          'No og:description tag',
          'og:description is absent, so a shared link shows no summary text -- most platforms leave the ' +
            "description blank rather than guessing one from the page body.",
          'og:description: (not set)',
        ),
      );
    }

    // --- Preview image: presence, absolute URL, and fallback chain -------
    const ogImageRaw = og.image || null;
    const twitterImageRaw = twitter.image || null;
    const effectiveTwitterImageRaw = twitterImageRaw || ogImageRaw;

    if (!ogImageRaw && !twitterImageRaw) {
      findings.push(
        finding(
          'missing-preview-image',
          'danger',
          'No og:image or twitter:image tag',
          'Neither an og:image nor a twitter:image tag is present, so no platform this tool checks against has ' +
            'anything to render as a preview image -- a shared link will show title and description text only, ' +
            'if that.',
          'og:image: (not set); twitter:image: (not set)',
        ),
      );
    }

    if (ogImageRaw && !isAbsoluteHttpUrl(ogImageRaw)) {
      findings.push(
        finding(
          'relative-og-image-url',
          'danger',
          'og:image is not an absolute URL',
          `og:image is "${ogImageRaw}", which is not an absolute http(s) URL. The Open Graph protocol requires ` +
            'og:image to be absolute (ogp.me) -- most crawlers do not resolve a relative path against the page ' +
            'URL and will treat this as no image at all.',
          `og:image: ${ogImageRaw}`,
        ),
      );
    } else if (ogImageRaw) {
      classifyImage('og-image', 'og:image', images.ogImage?.fetch, findings, FACEBOOK_MIN, FACEBOOK_RECOMMENDED);
    }

    if (twitterImageRaw && !isAbsoluteHttpUrl(twitterImageRaw)) {
      findings.push(
        finding(
          'relative-twitter-image-url',
          'danger',
          'twitter:image is not an absolute URL',
          `twitter:image is "${twitterImageRaw}", which is not an absolute http(s) URL. Twitter/X's card ` +
            'validator requires an absolute URL and will not resolve a relative path.',
          `twitter:image: ${twitterImageRaw}`,
        ),
      );
    }

    // --- twitter:card and the image it actually needs ---------------------
    const card = twitter.card || null;
    if (!card) {
      findings.push(
        finding(
          'missing-twitter-card',
          'notice',
          'No twitter:card tag',
          "twitter:card is absent. Whether X falls back to plain Open Graph tags without it is undocumented " +
            'and has changed before -- setting twitter:card explicitly (summary or summary_large_image) is the ' +
            'reliable way to control how a link renders there.',
          'twitter:card: (not set)',
        ),
      );
    } else if (card === 'summary_large_image') {
      if (!effectiveTwitterImageRaw) {
        findings.push(
          finding(
            'twitter-large-image-card-missing-image',
            'danger',
            'twitter:card is summary_large_image but no image is available',
            'twitter:card declares summary_large_image, which requires an image, but neither twitter:image nor ' +
              'its og:image fallback is present.',
            'twitter:card: summary_large_image; twitter:image and og:image: (not set)',
          ),
        );
      } else if (isAbsoluteHttpUrl(effectiveTwitterImageRaw)) {
        const fetchResult = twitterImageRaw ? images.twitterImage?.fetch : images.ogImage?.fetch;
        classifyImage(
          'twitter-large-image',
          'twitter:card large-image',
          fetchResult,
          findings,
          TWITTER_LARGE_MIN,
          TWITTER_LARGE_RECOMMENDED,
        );
      }
    }

    if (!twitterImageRaw && ogImageRaw && isAbsoluteHttpUrl(ogImageRaw)) {
      findings.push(
        finding(
          'twitter-image-falls-back-to-og-image',
          'notice',
          'twitter:image is absent; X will use og:image instead',
          'No twitter:image tag is set, so the effective image on X comes from the og:image fallback shown ' +
            'above. This is informational, not a problem on its own -- it only matters if og:image itself has ' +
            'a finding.',
          `og:image used as the fallback: ${ogImageRaw}`,
        ),
      );
    }

    // --- Duplicate tags ------------------------------------------------
    for (const [key, count] of Object.entries(tags.duplicates || {})) {
      findings.push(
        finding(
          'duplicate-meta-tag',
          'notice',
          `<meta ${key}> appears ${count} times`,
          `The tag "${key}" was found ${count} times in the page. This tool (and most crawlers) use the first ` +
            'one in document order, but which tag wins is not guaranteed to be consistent across platforms -- ' +
            'a common cause is a CMS/SEO plugin injecting its own tag alongside a hand-written one.',
          `${key}: ${count} occurrences`,
        ),
      );
    }

    // --- og:url mismatch -------------------------------------------------
    if (og.url && isAbsoluteHttpUrl(og.url)) {
      const strip = (u) => u.replace(/\/$/, '');
      if (strip(og.url) !== strip(target)) {
        findings.push(
          finding(
            'og-url-mismatch',
            'notice',
            'og:url does not match the URL that was checked',
            `og:url is "${og.url}", which differs from the checked URL "${target}". A platform that treats ` +
              "og:url as the shared link's canonical destination can send visitors to a different URL than the " +
              'one they clicked -- confirm this is intentional (for example, a staging URL declaring its ' +
              'production canonical).',
            `og:url: ${og.url}`,
          ),
        );
      }
    }
  }

  const dangerCount = findings.filter((f) => f.severity === 'danger').length;
  const noticeCount = findings.filter((f) => f.severity === 'notice').length;

  return {
    target,
    probe: {
      ok: p.ok !== false,
      status: p.status ?? null,
      error: p.error ?? null,
      redirectStatus: p.redirectStatus ?? null,
      redirectLocation: p.redirectLocation ?? null,
      tags: p.tags ?? null,
      images: p.images ?? null,
    },
    findings,
    dangerCount,
    noticeCount,
    ok: !incomplete && dangerCount === 0,
    incomplete,
  };
}
