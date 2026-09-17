// Sends the real HTTP requests this check depends on: one GET for the page's
// HTML, then one GET each for whichever og:image / twitter:image URLs it
// finds -- and only as many bytes of each image as it takes to read the
// dimensions out of the file header (imagesize.mjs), not the whole file.
// Your machine, your network: no request goes through this portfolio or
// anywhere but the URLs a caller names.
//
// No redirect is followed automatically -- a 3xx response is reported as
// its own result, with the Location header if one was sent, rather than
// silently chasing it. That is the same choice this portfolio's other
// header/response checkers make (see ../security-headers-check/probe.mjs):
// a caller always knows exactly which response the report describes, and a
// crawler deciding what to render from a share link makes the same choice.

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { parseMetaTags, resolveUrl, isAbsoluteHttpUrl } from './metatags.mjs';
import { detectImageSize } from './imagesize.mjs';

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 500_000;
const MAX_IMAGE_BYTES = 65_536;
const USER_AGENT =
  'social-preview-check/1 (+https://duncan-haywood.github.io/monorepo-projects/social-preview-check/)';

/**
 * One GET request to `url`, capped at `maxBytes` of response body -- once
 * that many bytes have arrived the socket is destroyed rather than
 * downloading the rest, since every format this tool cares about (HTML head
 * tags, image file headers) puts what it needs near the start. Resolves
 * rather than rejects on any failure so a caller never needs a try/catch.
 */
export function fetchBuffer(url, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_HTML_BYTES, headers = {} } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, status: null, headers: {}, body: null, error: `invalid URL: ${err.message}` });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      resolve({ ok: false, status: null, headers: {}, body: null, error: `unsupported scheme: ${parsed.protocol}` });
      return;
    }

    const requester = parsed.protocol === 'https:' ? httpsRequest : httpRequest;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const req = requester(
      parsed,
      { method: 'GET', headers: { 'user-agent': USER_AGENT, ...headers }, timeout: timeoutMs },
      (res) => {
        const chunks = [];
        let total = 0;
        res.on('data', (chunk) => {
          if (settled) return;
          total += chunk.length;
          if (total > maxBytes) {
            chunks.push(chunk.subarray(0, chunk.length - (total - maxBytes)));
            finish({ ok: true, status: res.statusCode ?? null, headers: res.headers, body: Buffer.concat(chunks), error: null });
            res.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () =>
          finish({ ok: true, status: res.statusCode ?? null, headers: res.headers, body: Buffer.concat(chunks), error: null }),
        );
        res.on('error', (err) =>
          finish({ ok: false, status: res.statusCode ?? null, headers: res.headers, body: null, error: err.message }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('timed out')));
    req.on('error', (err) => finish({ ok: false, status: null, headers: {}, body: null, error: err.message }));
    req.end();
  });
}

async function fetchImage(url, { timeoutMs, fetchFn }) {
  const res = await fetchFn(url, {
    timeoutMs,
    maxBytes: MAX_IMAGE_BYTES,
    headers: { accept: 'image/*,*/*', range: `bytes=0-${MAX_IMAGE_BYTES - 1}` },
  });
  if (!res.ok) {
    return { ok: false, status: res.status ?? null, contentType: null, error: res.error || 'request failed', size: null };
  }
  // A network-level success can still be an HTTP-level failure (404, 500, ...)
  // -- a crawler fetching this URL would render nothing, exactly as if the
  // request had failed outright, so both are the same finding to a caller.
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, status: res.status, contentType: res.headers?.['content-type'] || null, error: `HTTP ${res.status}`, size: null };
  }
  return {
    ok: true,
    status: res.status,
    contentType: res.headers?.['content-type'] || null,
    error: null,
    size: detectImageSize(res.body),
  };
}

/**
 * Fetches `targetUrl`'s HTML, extracts its Open Graph / Twitter Card tags,
 * and fetches enough of whichever preview image(s) they point at to read
 * real pixel dimensions.
 *
 * @param {string} targetUrl
 * @param {{timeoutMs?: number, fetchFn?: typeof fetchBuffer}} [opts] -
 *   `fetchFn` is injectable so tests can stub the network layer without
 *   this module's orchestration logic (the fallback/dedup rules below)
 *   going untested.
 */
export async function runProbe(targetUrl, { timeoutMs, fetchFn = fetchBuffer } = {}) {
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    return { ok: false, status: null, error: `invalid URL: ${err.message}` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, status: null, error: `unsupported scheme: ${parsed.protocol}` };
  }

  const pageRes = await fetchFn(targetUrl, { timeoutMs, maxBytes: MAX_HTML_BYTES, headers: { accept: 'text/html,*/*' } });
  if (!pageRes.ok) {
    return { ok: false, status: pageRes.status ?? null, error: pageRes.error || 'request failed' };
  }
  if (pageRes.status >= 300 && pageRes.status < 400) {
    return {
      ok: true,
      status: pageRes.status,
      redirectStatus: pageRes.status,
      redirectLocation: pageRes.headers?.location || null,
      tags: null,
      images: null,
    };
  }

  const html = pageRes.body ? pageRes.body.toString('utf8') : '';
  const tags = parseMetaTags(html);

  const ogRaw = tags.og.image || null;
  const twitterRaw = tags.twitter.image || null;
  const images = { ogImage: null, twitterImage: null };

  if (ogRaw) {
    if (isAbsoluteHttpUrl(ogRaw)) {
      const url = resolveUrl(ogRaw, targetUrl);
      images.ogImage = { url, fetch: await fetchImage(url, { timeoutMs, fetchFn }) };
    } else {
      images.ogImage = { url: null, fetch: null };
    }
  }

  if (twitterRaw) {
    if (isAbsoluteHttpUrl(twitterRaw)) {
      const url = resolveUrl(twitterRaw, targetUrl);
      // Same URL as og:image: reuse the fetch already made rather than
      // requesting the identical bytes twice.
      images.twitterImage =
        ogRaw === twitterRaw && images.ogImage?.fetch
          ? { url, fetch: images.ogImage.fetch }
          : { url, fetch: await fetchImage(url, { timeoutMs, fetchFn }) };
    } else {
      images.twitterImage = { url: null, fetch: null };
    }
  }

  return { ok: true, status: pageRes.status, tags, images };
}
