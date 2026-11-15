// Picture lists for the rank page: rank photos, logo drafts or designs by
// picking pairs. DOM-free so node --test can run it (image-items.test.mjs).
//
// The pictures never leave the device. A list of pictures is a list of file
// names: the names are the items (so listId, links and result codes work
// exactly as for typed lists), and each person attaches the files on their own
// device; the page matches them back to the items by name.
import { parseList, MAX_ITEMS } from "./rank-core.mjs";

/** File types a browser can usually show in an <img>. HEIC/HEIF is listed so it is named, not silently dropped. */
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|svg|bmp|ico|heic|heif)$/i;
/** Browsers outside Safari cannot draw these; the page says so rather than showing a broken picture. */
export const UNDRAWABLE_EXT = /\.(heic|heif)$/i;

export function isImageFile({ name = "", type = "" }) {
  return String(type).startsWith("image/") || IMAGE_EXT.test(String(name));
}

/** The item a file name becomes: the same normalising parseList applies to a typed line. */
export function itemName(fileName) {
  return parseList(String(fileName).replace(/[\r\n]+/g, " "))[0] ?? "";
}

/** The matching key: parseList treats names that differ only in case as repeats, so matching does too. */
export const itemKey = (item) => String(item).toLowerCase();

const byKey = (a, b) => (itemKey(a) < itemKey(b) ? -1 : itemKey(a) > itemKey(b) ? 1 : a < b ? -1 : a > b ? 1 : 0);

/**
 * A new picture list from the files someone chose. Items are the normalised
 * names, sorted, so the order the file picker returned them in never changes
 * the list's fingerprint. Returns { items, files } where files[i] is the
 * index (into the input) of the file for items[i], plus what was left out:
 * `notImages` (names that are not pictures), `repeats` (a second file whose
 * name normalises to one already taken) and `overCap` (names past MAX_ITEMS).
 */
export function imageList(fileList) {
  const notImages = [], repeats = [];
  const seen = new Map();
  Array.from(fileList).forEach((file, index) => {
    if (!isImageFile(file)) { notImages.push(String(file.name)); return; }
    const item = itemName(file.name);
    if (!item) { notImages.push(String(file.name)); return; }
    const key = itemKey(item);
    if (seen.has(key)) { repeats.push(String(file.name)); return; }
    seen.set(key, { item, index });
  });
  const all = [...seen.values()].sort((a, b) => byKey(a.item, b.item));
  const kept = all.slice(0, MAX_ITEMS);
  return {
    items: kept.map((e) => e.item),
    files: kept.map((e) => e.index),
    notImages,
    repeats,
    overCap: all.slice(MAX_ITEMS).map((e) => e.item),
  };
}

/**
 * Match files someone attached to an existing list (a shared link, or a reload
 * that lost the pictures). Returns { files, missing, extra }: files[i] is the
 * index of the file for items[i] or -1, `missing` the items with no file, and
 * `extra` the attached names that match no item.
 */
export function matchImages(items, fileList) {
  const want = new Map(items.map((item, i) => [itemKey(item), i]));
  const files = items.map(() => -1);
  const extra = [];
  Array.from(fileList).forEach((file, index) => {
    const i = isImageFile(file) ? want.get(itemKey(itemName(file.name))) : undefined;
    if (i === undefined || files[i] !== -1) extra.push(String(file.name));
    else files[i] = index;
  });
  return { files, missing: items.filter((_, i) => files[i] === -1), extra };
}

/**
 * The size a picture of aspect `r` (width / height) is drawn at inside a box
 * of `w` by `h` with object-fit: contain.
 */
export function fitSize(r, w, h) {
  if (!(r > 0) || !(w > 0) || !(h > 0)) return { w: 0, h: 0 };
  const width = Math.min(w, h * r);
  return { w: width, h: width / r };
}

/** Stacking must show the smaller picture at least this many times larger, because side by side is easier to compare at a glance. */
export const STACK_GAIN = 1.5;

/**
 * Side by side or one above the other for a pair of pictures. `aspects` are
 * the two pictures' width / height; `side` and `stack` are the box each
 * picture gets in either layout ({ w, h }, as the page's CSS sizes them).
 * Picks the layout whose smaller picture is drawn larger, and stacks only
 * when that gain is at least STACK_GAIN. Returns { layout, side, stack, gain }
 * with the smaller picture's drawn area in each layout.
 */
export function pairLayout(aspects, side, stack) {
  const minArea = (box) => Math.min(...aspects.map((r) => { const s = fitSize(r, box.w, box.h); return s.w * s.h; }));
  const a = minArea(side), b = minArea(stack);
  const gain = a > 0 ? b / a : b > 0 ? Infinity : 1;
  return { layout: gain >= STACK_GAIN ? "stack" : "side", side: a, stack: b, gain };
}

/**
 * Where a tap on a picture zooms in, as CSS transform-origin percentages of
 * the drawn picture, clamped to 0-100. Flipping to the other picture keeps the
 * same percentages, so the same part of both pictures is compared (exactly the
 * same part when they share an aspect ratio, as frames from one camera do).
 */
export function zoomOrigin(x, y, rect) {
  const pct = (v, lo, size) => (size > 0 ? Math.max(0, Math.min(100, ((v - lo) / size) * 100)) : 50);
  return { x: pct(x, rect.left, rect.width), y: pct(y, rect.top, rect.height) };
}
