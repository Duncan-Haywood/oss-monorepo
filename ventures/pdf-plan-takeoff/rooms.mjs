// Click inside a room, get its floor area: the region the drawn line work
// encloses around the click, found by rasterising the sheet's segments and
// flood-filling from the click. This is the takeoff step estimators spend the
// most clicks on (tracing every room's corners by hand), and the one paid tools
// sell "AI" for. Here it is plain geometry: the room is what the walls close.
//
// Furniture, fixtures and hatches drawn inside the room leave islands in the
// fill; they are filled back in (a room's area includes the floor under its
// table). A door drawn with its leaf and swing closes its opening; an opening
// with no door leaks into the next room, so `gap` optionally closes openings up
// to that many points wide before filling (a morphological closing), and the
// region is refused when it runs off the window searched or past maxArea.

/**
 * @param {{segs: Float64Array|number[], paint?: Uint8Array}} page
 * @param {{x:number,y:number}} seed  point in page space (PDF points)
 * @param {{pxPerPt?:number, window?:number, gap?:number, strokesOnly?:boolean}} [opts]
 * @returns {{ok:boolean, reason?:string, areaPt2?:number, pixels?:number, bbox?:number[], mask?:Uint8Array, w?:number, h?:number, x0?:number, y0?:number, pxPerPt?:number, outline?:number[][]}}
 */
export function roomAt(page, seed, opts = {}) {
  // opts.images: [{ctm, w, h, ink}] decoded raster tiles near the seed (imagesNear)
  const k = opts.pxPerPt || 2;
  const half = opts.window || 900; // points either side of the seed
  const gap = opts.gap || 0;
  const x0 = seed.x - half, y0 = seed.y - half;
  const w = Math.ceil(2 * half * k), h = w;
  const wall = new Uint8Array(w * h);
  const segs = page.segs;
  const paint = page.paint;
  // Rasterise every segment that crosses the window (DDA, sampled at a quarter pixel).
  for (let i = 0; i < segs.length; i += 4) {
    if (opts.strokesOnly && paint && paint[i / 4] !== 1) continue;
    // door swings, fixtures and furniture are drawn with curves; walls are not
    if (!opts.keepCurves && page.curve && page.curve[i / 4]) continue;
    if (opts.skipWidths && page.widths && opts.skipWidths.has(Math.round(page.widths[i / 4] * 100))) continue;
    let ax = (segs[i] - x0) * k, ay = (segs[i + 1] - y0) * k, bx = (segs[i + 2] - x0) * k, by = (segs[i + 3] - y0) * k;
    if ((ax < 0 && bx < 0) || (ay < 0 && by < 0) || (ax >= w && bx >= w) || (ay >= h && by >= h)) continue;
    const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 4) + 1;
    for (let s = 0; s <= n; s++) {
      const px = Math.floor(ax + ((bx - ax) * s) / n), py = Math.floor(ay + ((by - ay) * s) / n);
      if (px >= 0 && py >= 0 && px < w && py < h) wall[py * w + px] = 1;
    }
  }
  // Raster line work (a plan exported as image tiles): each placed image's
  // ink pixels, sampled at every window pixel the image covers.
  for (const im of opts.images || []) {
    const m = im.ctm; // unit square -> page
    const det = m[0] * m[3] - m[1] * m[2];
    if (!det || !im.ink) continue;
    const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]], ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
    const pxA = Math.max(0, Math.floor((Math.min(...xs) - x0) * k)), pxB = Math.min(w - 1, Math.ceil((Math.max(...xs) - x0) * k));
    const pyA = Math.max(0, Math.floor((Math.min(...ys) - y0) * k)), pyB = Math.min(h - 1, Math.ceil((Math.max(...ys) - y0) * k));
    for (let py = pyA; py <= pyB; py++) for (let px = pxA; px <= pxB; px++) {
      const X = x0 + (px + 0.5) / k - m[4], Y = y0 + (py + 0.5) / k - m[5];
      const u = (X * m[3] - Y * m[2]) / det, v = (Y * m[0] - X * m[1]) / det;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
      const col = Math.floor(u * im.w), row = Math.floor((1 - v) * im.h);
      if (im.ink[row * im.w + col]) wall[py * w + px] = 1;
    }
  }
  let block = wall;
  if (gap > 0) block = dilate(wall, w, h, Math.round((gap * k) / 2));
  const sx = Math.floor((seed.x - x0) * k), sy = Math.floor((seed.y - y0) * k);
  if (block[sy * w + sx]) return { ok: false, reason: 'the click is on a line; click inside the room' };
  const maxPx = opts.maxArea ? opts.maxArea * k * k : w * h * 0.6;
  const region = new Uint8Array(w * h);
  if (opts.debug && typeof opts.debug === 'object') Object.assign(opts.debug, { wall, region, w, h });
  const stack = [sy * w + sx];
  region[sy * w + sx] = 1;
  let count = 0, touches = false;
  let minX = sx, maxX = sx, minY = sy, maxY = sy;
  while (stack.length) {
    const p = stack.pop();
    count++;
    if (count > maxPx) return { ok: false, reason: 'the area is not closed (it runs into the rest of the sheet): close the opening or trace it' };
    const px = p % w, py = (p - px) / w;
    if (px < minX) minX = px; if (px > maxX) maxX = px; if (py < minY) minY = py; if (py > maxY) maxY = py;
    if (px === 0 || py === 0 || px === w - 1 || py === h - 1) { touches = true; continue; }
    for (const q of [p - 1, p + 1, p - w, p + w]) if (!region[q] && !block[q]) { region[q] = 1; stack.push(q); }
  }
  if (touches) return { ok: false, reason: 'the area is not closed (it runs into the rest of the sheet): close the opening or trace it' };
  if (gap > 0) {
    // give back the band the closing took off the room's own edge
    const r = Math.round((gap * k) / 2);
    const grown = dilate(region, w, h, r);
    for (let i = 0; i < grown.length; i++) if (grown[i] && !wall[i]) region[i] = 1;
    minX = Math.max(0, minX - r); minY = Math.max(0, minY - r); maxX = Math.min(w - 1, maxX + r); maxY = Math.min(h - 1, maxY + r);
  }
  // Fill islands: everything in the bounding box not reachable from its border
  // without crossing the region belongs to the room (furniture, fixtures, tags).
  const bw = maxX - minX + 3, bh = maxY - minY + 3;
  const out = new Uint8Array(bw * bh);
  const st = [0];
  out[0] = 1;
  const inRegion = (bx, by) => {
    const gx = bx + minX - 1, gy = by + minY - 1;
    return gx >= 0 && gy >= 0 && gx < w && gy < h && region[gy * w + gx] === 1;
  };
  while (st.length) {
    const p = st.pop();
    const bx = p % bw, by = (p - bx) / bw;
    for (const [qx, qy] of [[bx - 1, by], [bx + 1, by], [bx, by - 1], [bx, by + 1]]) {
      if (qx < 0 || qy < 0 || qx >= bw || qy >= bh) continue;
      const q = qy * bw + qx;
      if (out[q] || inRegion(qx, qy)) continue;
      out[q] = 1; st.push(q);
    }
  }
  // the wall pixels on the room's own boundary: half of them belong to the room
  // (the line is drawn on the wall face, so the face runs through their middle)
  let pixels = 0;
  for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {
    if (out[by * bw + bx]) continue;
    const gx = bx + minX - 1, gy = by + minY - 1;
    pixels++;
    region[gy * w + gx] = 1;
  }
  // boundary correction: count region pixels that touch the outside, half a pixel each
  let boundary = 0;
  for (let by = 1; by < bh - 1; by++) for (let bx = 1; bx < bw - 1; bx++) {
    const p = by * bw + bx;
    if (out[p]) continue;
    if (out[p - 1]) boundary++; if (out[p + 1]) boundary++; if (out[p - bw]) boundary++; if (out[p + bw]) boundary++;
  }
  const areaPx = pixels + boundary * 0.5;
  return {
    ok: true, areaPt2: areaPx / (k * k), pixels,
    bbox: [x0 + (minX) / k, y0 + (minY) / k, x0 + (maxX + 1) / k, y0 + (maxY + 1) / k],
    mask: region, w, h, x0, y0, pxPerPt: k,
  };
}

function dilate(src, w, h, r) {
  if (r <= 0) return src;
  // separable square dilation: rows then columns
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) { if (src[y * w + x]) last = x; if (x - last <= r) tmp[y * w + x] = 1; }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) { if (src[y * w + x]) last = x; if (last - x <= r) tmp[y * w + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; if (y - last <= r) out[y * w + x] = 1; }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) last = y; if (last - y <= r) out[y * w + x] = 1; }
  }
  return out;
}

/** The placed images on a page whose box comes within `half` points of a seed. */
export function imagesNear(page, seed, half = 900) {
  return (page.images || []).filter(({ ctm: m }) => {
    const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]], ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
    return Math.max(...xs) >= seed.x - half && Math.min(...xs) <= seed.x + half && Math.max(...ys) >= seed.y - half && Math.min(...ys) <= seed.y + half;
  });
}

/** Decode the images near a seed with the sheet reader's decoder, for roomAt. */
export async function loadImagesNear(sheet, page, seed, half = 900) {
  const out = [];
  for (const pl of imagesNear(page, seed, half)) {
    const img = await sheet.decodeImage(pl.num);
    if (img) out.push({ ctm: pl.ctm, w: img.w, h: img.h, ink: img.ink });
  }
  return out;
}

/**
 * The pen widths a page's dimension lines are drawn with (in hundredths of a
 * point). Dimension, grid and leader lines share the drafter's thin annotation
 * pen and cross rooms without bounding them, so roomAt can be told to skip
 * every segment drawn with one of these widths.
 */
export function annotationWidths(page, dims) {
  const count = new Map();
  for (const d of dims) {
    if (d.seg == null || !page.widths) continue;
    const wv = Math.round(page.widths[d.seg] * 100);
    count.set(wv, (count.get(wv) || 0) + 1);
  }
  return new Set([...count].filter(([, n]) => n >= 2).map(([wv]) => wv));
}
