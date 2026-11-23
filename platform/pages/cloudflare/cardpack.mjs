// Share cards packed into a few hundred files, so they stop counting one file
// each against the free plan's 20,000 files per Worker.
//
// Every directory page on the site carries its own `share-card.png` (share.mjs),
// so the shard Worker (writing/, research/, dev/, ...) held about one card per
// page: on 2026-11-23 it held 19,635 of its 20,000 files and was growing about
// 300 a day (docs/reports/2026-11-23-share-card-packs.md). Cards are only read
// by link-preview fetchers (X, LinkedIn, Mastodon, chat clients), never by a
// page, so they are the one kind of file that can be served by code rather than
// straight from assets without a reader noticing.
//
// split.mjs calls `packCards` on the shard's directory after the split: each
// `.../share-card.png` is appended to one of `PACKS` pack files chosen by a hash
// of its path, and the original is removed. The shard Worker (shard/worker.mjs)
// answers a request for a card path by fetching that one pack from its own
// assets and returning the card's bytes. URLs, `og:image` tags and the GitHub
// Pages redirect copy are unchanged.
//
// Pack format: a 4-byte big-endian header length, a UTF-8 JSON header mapping
// each card's URL path to [offset, length] in the body, then the body (the PNGs
// back to back).
//
// This module runs inside the Worker, so it uses web APIs only; the build-side
// half (encodePack, packCards) is in cardpack-build.mjs.

export const CARD_FILE = 'share-card.png';
/** Fixed, so the Worker needs no index: a card's pack follows from its path. */
export const PACKS = 512;
/** Shard-root directory for the packs. Not under a SHARD_DIRS directory, so
 *  the router never forwards a public request to it; only the shard Worker's
 *  own ASSETS binding reads it. */
export const PACK_DIR = 'share-card-packs';

/** FNV-1a over the path's UTF-16 code units: small, stable, no dependencies. */
export function packOf(urlPath) {
  let h = 0x811c9dc5;
  for (let i = 0; i < urlPath.length; i++) {
    h ^= urlPath.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % PACKS;
}

export const packPath = (n) => `/${PACK_DIR}/${String(n).padStart(3, '0')}.bin`;

export const isCardPath = (urlPath) => urlPath.endsWith(`/${CARD_FILE}`);

/** The card at `urlPath` inside a pack (an ArrayBuffer), or null. Runs in the
 *  Worker, so it uses only web APIs. */
export function readPack(buffer, urlPath) {
  if (buffer.byteLength < 4) return null;
  const headLen = new DataView(buffer).getUint32(0, false);
  if (4 + headLen > buffer.byteLength) return null;
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headLen)));
  const hit = header[urlPath];
  if (!hit) return null;
  const start = 4 + headLen + hit[0];
  if (start + hit[1] > buffer.byteLength) return null;
  return new Uint8Array(buffer, start, hit[1]);
}

/** Serve a card request from its pack, or null to fall through to assets.
 *  `assets` is the Worker's ASSETS binding; `headers` are added to the reply
 *  (a Worker-built response does not get the `_headers` rules). */
export async function serveCard(request, assets, headers = {}) {
  const url = new URL(request.url);
  if (!isCardPath(url.pathname) || !['GET', 'HEAD'].includes(request.method)) return null;
  let urlPath = url.pathname;
  try { urlPath = decodeURI(urlPath); } catch { /* keep it as sent */ }
  const res = await assets.fetch(new Request(new URL(packPath(packOf(urlPath)), url.origin)));
  if (!res.ok) return null;
  const png = readPack(await res.arrayBuffer(), urlPath);
  if (!png) return null;
  return new Response(request.method === 'HEAD' ? null : png, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Length': String(png.byteLength),
      // Cards change only when a page's title does; a day keeps a preview
      // fetcher's repeat visits off the request meter.
      'Cache-Control': 'public, max-age=86400',
      ...headers,
    },
  });
}
