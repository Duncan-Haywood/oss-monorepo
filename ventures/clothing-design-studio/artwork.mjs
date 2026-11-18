/**
 * Artwork sourcing and print resolution.
 *
 * Two jobs, both for a designer who wants an old painting on a garment:
 *
 * 1. `printResolution` answers "will this image print sharp at this size?":
 *    pixels per inch at the printed width, a verdict against typical figures
 *    for the decoration method, the largest width that stays sharp, and how
 *    far the image would have to be enlarged.
 * 2. The museum adapters build search URLs for two open-access collection
 *    APIs (the Art Institute of Chicago and The Metropolitan Museum of Art)
 *    and turn their JSON into one record shape, keeping only works the
 *    museum itself flags as public domain. Calls go from the visitor's
 *    browser straight to the museum; nothing passes through us.
 *
 * The thresholds are common print-shop guidance (300 pixels per inch at
 * print size is the usual ask for inkjet methods, about 150 the usual floor),
 * not a standard: a printer's own file spec wins. The rights flag is the
 * museum's, not a legal opinion: check each image's terms.
 */

export const CM_PER_INCH = 2.54;

/**
 * Typical pixel-per-inch figures at print size, by decoration method.
 * `ideal`: sharp up close. `min`: acceptable at arm's length, soft up close.
 */
export const PPI_GUIDE = Object.freeze({
  dtg: { ideal: 300, min: 150, why: "Inkjet onto the garment reproduces every pixel, so softness shows." },
  dtf: { ideal: 300, min: 150, why: "Inkjet onto film reproduces every pixel, so softness shows." },
  sublimation: { ideal: 300, min: 150, why: "Inkjet dye print; large all-over prints are seen from further away, so 150 is often accepted." },
  screen: { ideal: 300, min: 150, why: "The image is separated into flat inks or halftone films; a soft source gives ragged edges on each screen." },
  "high-density": { ideal: 300, min: 200, why: "Raised ink exaggerates edges, so the outline layer needs clean, sharp edges (or a redrawn vector)." },
  puff: { ideal: 300, min: 200, why: "Raised ink exaggerates edges, so the outline layer needs clean, sharp edges (or a redrawn vector)." },
  embroidery: { ideal: 150, min: 72, why: "A digitiser redraws the artwork as stitches; resolution matters less than clear shapes." },
  "3d-puff-embroidery": { ideal: 150, min: 72, why: "A digitiser redraws the artwork as stitches over foam; bold, simple shapes matter more than pixels." },
});

const num = (v, name) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number.`);
  return n;
};
const round = (v, d = 0) => { const k = 10 ** d; return Math.round(v * k) / k; };

/**
 * Pixels per inch for an image printed at a width, and what that means.
 *
 * @param {object} o
 * @param {number} o.widthPx   image width in pixels
 * @param {number} o.heightPx  image height in pixels
 * @param {number} o.printWidthCm  printed width on the garment
 * @param {string} [o.method="dtg"]  a key of PPI_GUIDE
 * @param {number} [o.lpi]  halftone screen ruling, lines per inch (screen methods)
 */
export function printResolution({ widthPx, heightPx, printWidthCm, method = "dtg", lpi } = {}) {
  const w = num(widthPx, "Image width"), h = num(heightPx, "Image height"), cm = num(printWidthCm, "Printed width");
  const guide = PPI_GUIDE[method];
  if (!guide) throw new Error(`No resolution guide for the method "${method}".`);
  const ppi = w / (cm / CM_PER_INCH);
  const verdict = ppi >= guide.ideal ? "sharp" : ppi >= guide.min ? "acceptable" : "too-low";
  const maxSharpCm = (w / guide.ideal) * CM_PER_INCH;
  const maxOkCm = (w / guide.min) * CM_PER_INCH;
  const notes = [guide.why];
  if (verdict === "acceptable") notes.push(`Below the ${guide.ideal} ppi usually asked for: fine at arm's length, soft up close. Print at most ${round(maxSharpCm, 1)} cm wide for full sharpness, or find a larger image.`);
  if (verdict === "too-low") notes.push(`Below the ${guide.min} ppi floor: expect blur or visible pixels. Print at most ${round(maxOkCm, 1)} cm wide, or find a larger image of the same work.`);
  if (lpi != null && (method === "screen" || method === "high-density" || method === "puff")) {
    const l = num(lpi, "Halftone ruling");
    const need = 1.5 * l;
    if (ppi < need) notes.push(`A ${l} lpi halftone wants at least ${round(need)} ppi (1.5 x the ruling); this image gives ${round(ppi)}.`);
  }
  if (ppi > 600) notes.push("Far more pixels than the print needs: fine, but you can downscale the file before sending it.");
  return {
    method, ppi: round(ppi), verdict, ideal: guide.ideal, min: guide.min,
    printHeightCm: round(cm * (h / w), 1),
    maxSharpCm: round(maxSharpCm, 1), maxOkCm: round(maxOkCm, 1),
    enlargeBy: verdict === "sharp" ? 1 : round(guide.ideal / ppi, 2),
    megapixels: round((w * h) / 1e6, 1),
    notes,
  };
}

/** Plain-words summary of a `printResolution` result. */
export function resolutionSummary(r, label = "This image") {
  const v = { sharp: "prints sharp", acceptable: "prints acceptably (soft up close)", "too-low": "is too small to print sharp" }[r.verdict];
  return `${label} ${v} at this size: ${r.ppi} ppi (want ${r.ideal}, floor ${r.min}). Sharp up to ${r.maxSharpCm} cm wide.`;
}

// ---------------------------------------------------------------- museums

export const AIC_API = "https://api.artic.edu/api/v1/artworks/search";
export const AIC_FIELDS = "id,title,artist_display,date_display,image_id,is_public_domain,thumbnail,credit_line,classification_title";
export const MET_API = "https://collectionapi.metmuseum.org/public/collection/v1";

const clean = q => String(q ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** Art Institute of Chicago search URL, public-domain works only. */
export function aicSearchUrl(query, { limit = 24 } = {}) {
  const q = clean(query);
  if (!q) throw new Error("Type something to search for, for example \"madonna\" or \"annunciation\".");
  const p = new URLSearchParams({ q, fields: AIC_FIELDS, limit: String(Math.min(100, Math.max(1, limit))) });
  p.set("query[term][is_public_domain]", "true");
  return `${AIC_API}?${p}`;
}

/** IIIF image URL on the Art Institute's image server at a pixel width. */
export function aicImageUrl(iiifBase, imageId, width = 1686) {
  return `${String(iiifBase || "https://www.artic.edu/iiif/2").replace(/\/$/, "")}/${encodeURIComponent(imageId)}/full/${width},/0/default.jpg`;
}

/** Normalise an Art Institute search response. Drops works without an image or not flagged public domain. */
export function parseAic(json) {
  const base = json?.config?.iiif_url || "https://www.artic.edu/iiif/2";
  return (Array.isArray(json?.data) ? json.data : [])
    .filter(a => a && a.image_id && a.is_public_domain === true)
    .map(a => ({
      source: "aic",
      museum: "Art Institute of Chicago",
      id: String(a.id),
      title: String(a.title || "Untitled"),
      artist: String(a.artist_display || "").split("\n")[0],
      date: String(a.date_display || ""),
      classification: String(a.classification_title || ""),
      publicDomain: true,
      // the museum reports the original's pixel size on the thumbnail object
      originalPx: a.thumbnail?.width > 0 && a.thumbnail?.height > 0 ? { w: a.thumbnail.width, h: a.thumbnail.height } : null,
      thumb: aicImageUrl(base, a.image_id, 400),
      image: aicImageUrl(base, a.image_id, 1686),
      imageFallback: aicImageUrl(base, a.image_id, 843),
      page: `https://www.artic.edu/artworks/${encodeURIComponent(a.id)}`,
      credit: String(a.credit_line || ""),
      alt: String(a.thumbnail?.alt_text || ""),
    }));
}

/** The Met search URL (returns object IDs only). */
export function metSearchUrl(query) {
  const q = clean(query);
  if (!q) throw new Error("Type something to search for, for example \"madonna\" or \"annunciation\".");
  return `${MET_API}/search?${new URLSearchParams({ hasImages: "true", isPublicDomain: "true", q })}`;
}

export const metObjectUrl = id => `${MET_API}/objects/${encodeURIComponent(id)}`;

/** First `limit` object IDs from a Met search response. */
export function metIds(json, limit = 12) {
  return (Array.isArray(json?.objectIDs) ? json.objectIDs : []).filter(n => Number.isInteger(n) && n > 0).slice(0, limit);
}

/** Normalise one Met object, or null when it has no image or is not flagged public domain. */
export function parseMetObject(o) {
  if (!o || o.isPublicDomain !== true || !o.primaryImage) return null;
  return {
    source: "met",
    museum: "The Metropolitan Museum of Art",
    id: String(o.objectID),
    title: String(o.title || "Untitled"),
    artist: String(o.artistDisplayName || ""),
    date: String(o.objectDate || ""),
    classification: String(o.classification || o.objectName || ""),
    publicDomain: true,
    originalPx: null, // the Met API does not report pixel size; measured when the image loads
    thumb: String(o.primaryImageSmall || o.primaryImage),
    image: String(o.primaryImage),
    imageFallback: String(o.primaryImageSmall || ""),
    page: String(o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`),
    credit: String(o.creditLine || ""),
    alt: "",
  };
}

/** Keep paintings only (classification mentions painting), when asked. */
export function onlyPaintings(records, on = true) {
  return on ? records.filter(r => /paint/i.test(r.classification)) : records;
}

/**
 * Search both museums with an injected `fetch` (the browser's, or a fake in
 * tests). Each museum fails on its own: one being down still returns the other.
 * Resolves to { records, errors }.
 */
export async function searchMuseums(query, { fetch: f = globalThis.fetch, sources = ["aic", "met"], limit = 12, paintingsOnly = true } = {}) {
  const errors = [], out = [];
  const get = async url => {
    const r = await f(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const jobs = [];
  if (sources.includes("aic")) jobs.push(get(aicSearchUrl(query, { limit: limit * 2 })).then(j => out.push(...onlyPaintings(parseAic(j), paintingsOnly).slice(0, limit)), e => errors.push(`Art Institute of Chicago: ${e.message}`)));
  if (sources.includes("met")) jobs.push((async () => {
    const ids = metIds(await get(metSearchUrl(query)), limit * 2);
    const objs = await Promise.all(ids.map(id => get(metObjectUrl(id)).catch(() => null)));
    out.push(...onlyPaintings(objs.map(parseMetObject).filter(Boolean), paintingsOnly).slice(0, limit));
  })().catch(e => errors.push(`The Met: ${e.message}`)));
  await Promise.all(jobs);
  return { records: out, errors };
}

/** Credit line to print on a hang tag or product page. */
export function creditLine(rec) {
  return [rec.artist, rec.title && `"${rec.title}"`, rec.date, rec.museum, rec.credit && `(${rec.credit})`, "public domain"].filter(Boolean).join(", ");
}

// ------------------------------------------------- hand-off to the studio

export const HANDOFF_KEY = "clothing-design-studio-artwork-handoff";

/** Save a chosen image for the studio page to pick up once. */
export function saveHandoff(storage, { src, label, credit, widthPx, heightPx }) {
  if (!src || !/^data:image\//.test(src)) throw new Error("Only an image already loaded in this page can be handed over.");
  storage.setItem(HANDOFF_KEY, JSON.stringify({ src, label: String(label || "Painting").slice(0, 40), credit: String(credit || "").slice(0, 300), widthPx: Number(widthPx) || null, heightPx: Number(heightPx) || null, at: Date.now() }));
}

/** Read and clear the hand-off; null when absent, stale (over a day) or malformed. */
export function takeHandoff(storage, now = Date.now()) {
  let raw = null;
  try { raw = storage.getItem(HANDOFF_KEY); storage.removeItem(HANDOFF_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const h = JSON.parse(raw);
    if (!h || typeof h.src !== "string" || !/^data:image\//.test(h.src)) return null;
    if (!(now - Number(h.at) < 864e5)) return null;
    return h;
  } catch { return null; }
}
