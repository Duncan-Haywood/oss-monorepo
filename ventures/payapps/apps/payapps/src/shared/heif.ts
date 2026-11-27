// A HEIC photo's primary image, read from its HEIF container (ISO/IEC 23008-12 on the ISO base media
// file format, ISO/IEC 14496-12) so the browser's own HEVC video decoder can decode it through
// WebCodecs (client/lib/heic-webcodecs.ts). Chrome, Edge and Firefox cannot open a HEIC as an image,
// but where they can play HEVC video (the computer's or phone's own hardware decoder) they can decode
// each of its HEVC pictures; this file finds those pictures and says how to put them together.
//
// What is read: the primary item (pitm), as one 'hvc1' image or as a 'grid' of 'hvc1' tiles (iPhones
// store their photos as 512 x 512 tiles); each item's bytes from iloc (in the file or in idat); its
// properties from iprp (ipco and ipma): the HEVC decoder configuration (hvcC), the size (ispe), the
// clean aperture crop (clap), rotation (irot) and mirroring (imir). Not read: colour profiles (the
// browser draws what its decoder outputs), alpha and depth planes, thumbnails, and derived items other
// than grids. Anything not understood returns null, so the caller keeps the original file.
//
// Nothing here decodes HEVC. Pure functions, no dependency: runs in the browser, Node and the Worker.

/** One HEVC picture to decode: its bytes as stored (length-prefixed NAL units, as WebCodecs wants). */
export interface HeifTile {
  data: Uint8Array;
  /** Where its top-left corner goes on the reconstructed image, before crop and rotation. */
  x: number;
  y: number;
}

export interface HeifCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeifImage {
  /** WebCodecs codec string for the tiles, e.g. "hvc1.1.6.L93.B0" (ISO/IEC 14496-15, annex E). */
  codec: string;
  /** The HEVCDecoderConfigurationRecord (hvcC box payload), WebCodecs' `description`. */
  description: Uint8Array;
  /** Each tile's coded picture size (ispe), the same for every tile of a grid. */
  tileWidth: number;
  tileHeight: number;
  tiles: HeifTile[];
  /** The reconstructed image (a grid's output size, or the single image's size). */
  width: number;
  height: number;
  /** The clean-aperture crop of the reconstructed image, or null for none. */
  crop: HeifCrop | null;
  /** Anticlockwise quarter turns (irot), applied after the crop. */
  rotation: 0 | 1 | 2 | 3;
  /** Mirroring after the rotation (imir): "left-right" or "top-bottom", or null. */
  mirror: "left-right" | "top-bottom" | null;
  /** The size the picture is shown at: cropped, then rotated. */
  displayWidth: number;
  displayHeight: number;
}

/** Limits, so a hostile file cannot make the browser allocate without end. */
export const HEIF_MAX_TILES = 1024;
export const HEIF_MAX_SIDE = 16384;
const MAX_BOXES = 4096;

interface Box {
  type: string;
  /** Where the box's content starts (after its header). */
  start: number;
  end: number;
}

const fourcc = (b: Uint8Array, at: number) =>
  at + 4 > b.length ? "" : String.fromCharCode(...b.subarray(at, at + 4));

/** A big-endian unsigned integer of n bytes (0 to 8), or -1 past the end or the limit. */
function readUint(b: Uint8Array, at: number, n: number, limit = b.length): number {
  if (at < 0 || at + n > limit) return -1;
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + (b[at + i] as number);
  return v;
}

/** The boxes laid end to end in b[from, to): ISO/IEC 14496-12 section 4.2, 64-bit sizes included. */
function boxes(b: Uint8Array, from: number, to: number): Box[] {
  const out: Box[] = [];
  let pos = from;
  while (pos + 8 <= to && out.length < MAX_BOXES) {
    let size = readUint(b, pos, 4);
    const type = fourcc(b, pos + 4);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > to) break;
      size = readUint(b, pos + 8, 8);
      header = 16;
    } else if (size === 0) {
      size = to - pos;
    }
    if (size < header || pos + size > to) break;
    out.push({ type, start: pos + header, end: pos + size });
    pos += size;
  }
  return out;
}

/** Does the file say it is HEIF with HEVC (an iPhone's HEIC)? Brands from ftyp. */
export function isHeic(b: Uint8Array): boolean {
  const top = boxes(b, 0, Math.min(b.length, 4096));
  const ftyp = top[0];
  if (ftyp?.type !== "ftyp") return false;
  const brands = new Set<string>();
  for (let p = ftyp.start; p + 4 <= ftyp.end; p += 4) {
    if (p !== ftyp.start + 4) brands.add(fourcc(b, p)); // skip minor_version
  }
  return ["heic", "heix", "heim", "heis", "mif1", "msf1"].some((x) => brands.has(x));
}

interface Item {
  type: string;
  /** Extents as [offset, length] from the origin of the construction method. */
  method: number;
  extents: [number, number][];
}

/** iinf: item id -> type (infe versions 2 and 3; earlier ones carry no type). */
function readItemTypes(b: Uint8Array, iinf: Box): Map<number, string> | null {
  const v = b[iinf.start] as number;
  const at = iinf.start + 4 + (v === 0 ? 2 : 4);
  const types = new Map<number, string>();
  for (const infe of boxes(b, at, iinf.end)) {
    if (infe.type !== "infe") continue;
    const iv = b[infe.start] as number;
    if (iv < 2) continue;
    const idSize = iv === 2 ? 2 : 4;
    const id = readUint(b, infe.start + 4, idSize, infe.end);
    const type = fourcc(b, infe.start + 4 + idSize + 2);
    if (id < 0 || !type) return null;
    types.set(id, type);
  }
  return types;
}

/** iloc, section 8.11.3 of ISO/IEC 14496-12: item id -> construction method and extents. */
function readLocations(b: Uint8Array, iloc: Box): Map<number, Omit<Item, "type">> | null {
  const v = b[iloc.start] as number;
  if (v > 2) return null;
  const end = iloc.end;
  let p = iloc.start + 4;
  const sizes = readUint(b, p, 2, end);
  if (sizes < 0) return null;
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 15;
  const baseOffsetSize = (sizes >> 4) & 15;
  const indexSize = v === 1 || v === 2 ? sizes & 15 : 0;
  if (
    [offsetSize, lengthSize, baseOffsetSize, indexSize].some((n) => n !== 0 && n !== 4 && n !== 8)
  )
    return null;
  p += 2;
  const countSize = v < 2 ? 2 : 4;
  const count = readUint(b, p, countSize, end);
  if (count < 0) return null;
  p += countSize;
  const out = new Map<number, Omit<Item, "type">>();
  for (let i = 0; i < count; i++) {
    const id = readUint(b, p, countSize, end);
    p += countSize;
    let method = 0;
    if (v === 1 || v === 2) {
      method = readUint(b, p, 2, end) & 15;
      p += 2;
    }
    p += 2; // data_reference_index: 0 means this file, the only case read
    const base = readUint(b, p, baseOffsetSize, end);
    p += baseOffsetSize;
    const count2 = readUint(b, p, 2, end);
    p += 2;
    if (id < 0 || base < 0 || count2 < 0) return null;
    const extents: [number, number][] = [];
    for (let e = 0; e < count2; e++) {
      p += indexSize;
      const off = readUint(b, p, offsetSize, end);
      p += offsetSize;
      const len = readUint(b, p, lengthSize, end);
      p += lengthSize;
      if (off < 0 || len < 0) return null;
      extents.push([base + off, len]);
    }
    out.set(id, { method, extents });
  }
  return out;
}

/** An item's bytes: from the file (method 0) or the meta box's idat (method 1). */
function itemBytes(
  b: Uint8Array,
  item: Omit<Item, "type">,
  idat: Box | undefined,
): Uint8Array | null {
  let origin = 0;
  let limit = b.length;
  if (item.method === 1) {
    if (!idat) return null;
    origin = idat.start;
    limit = idat.end;
  } else if (item.method !== 0) {
    return null; // 2, from another item: not used by cameras
  }
  let total = 0;
  for (const [off, len] of item.extents) {
    const n = len === 0 ? limit - origin - off : len; // 0 means "to the end"
    if (n <= 0 || origin + off + n > limit) return null;
    total += n;
  }
  if (item.extents.length === 1) {
    const [off, len] = item.extents[0] as [number, number];
    return b.subarray(origin + off, origin + off + (len === 0 ? limit - origin - off : len));
  }
  const out = new Uint8Array(total);
  let w = 0;
  for (const [off, len] of item.extents) {
    const n = len === 0 ? limit - origin - off : len;
    out.set(b.subarray(origin + off, origin + off + n), w);
    w += n;
  }
  return out;
}

/** iref: for each from-item, its references of one type in order (dimg: a grid's tiles). */
function readRefs(b: Uint8Array, iref: Box, kind: string): Map<number, number[]> {
  const v = b[iref.start] as number;
  const idSize = v === 0 ? 2 : 4;
  const out = new Map<number, number[]>();
  for (const r of boxes(b, iref.start + 4, iref.end)) {
    if (r.type !== kind) continue;
    const from = readUint(b, r.start, idSize, r.end);
    const n = readUint(b, r.start + idSize, 2, r.end);
    if (from < 0 || n < 0) continue;
    const to: number[] = [];
    for (let i = 0; i < n; i++) {
      const id = readUint(b, r.start + idSize + 2 + i * idSize, idSize, r.end);
      if (id < 0) break;
      to.push(id);
    }
    out.set(from, to);
  }
  return out;
}

/** iprp: each item's properties (ipma's 1-based indexes into ipco's boxes), in the listed order. */
function readProperties(b: Uint8Array, iprp: Box): Map<number, Box[]> | null {
  const inner = boxes(b, iprp.start, iprp.end);
  const ipco = inner.find((x) => x.type === "ipco");
  if (!ipco) return null;
  const props = boxes(b, ipco.start, ipco.end);
  const out = new Map<number, Box[]>();
  for (const ipma of inner.filter((x) => x.type === "ipma")) {
    const v = b[ipma.start] as number;
    const flags = readUint(b, ipma.start + 1, 3, ipma.end);
    const idSize = v < 1 ? 2 : 4;
    const wide = (flags & 1) === 1;
    let p = ipma.start + 4;
    const count = readUint(b, p, 4, ipma.end);
    if (count < 0) return null;
    p += 4;
    for (let i = 0; i < count; i++) {
      const id = readUint(b, p, idSize, ipma.end);
      p += idSize;
      const n = readUint(b, p, 1, ipma.end);
      p += 1;
      if (id < 0 || n < 0) return null;
      const list = out.get(id) ?? [];
      for (let k = 0; k < n; k++) {
        const raw = readUint(b, p, wide ? 2 : 1, ipma.end);
        p += wide ? 2 : 1;
        if (raw < 0) return null;
        const index = raw & (wide ? 0x7fff : 0x7f);
        if (index === 0) continue;
        const prop = props[index - 1];
        if (!prop) return null;
        list.push(prop);
      }
      out.set(id, list);
    }
  }
  return out;
}

/** The WebCodecs codec string from an HEVCDecoderConfigurationRecord (ISO/IEC 14496-15, E.3). */
export function hevcCodecString(hvcc: Uint8Array): string | null {
  if (hvcc.length < 23 || hvcc[0] !== 1) return null;
  const b1 = hvcc[1] as number;
  const space = ["", "A", "B", "C"][b1 >> 6] as string;
  const tier = (b1 & 0x20) !== 0 ? "H" : "L";
  const profile = b1 & 0x1f;
  // The 32 compatibility flags, written in reverse bit order as hex with no leading zeros.
  const flags = readUint(hvcc, 2, 4);
  let reversed = 0;
  for (let i = 0; i < 32; i++) if (flags & (2 ** i)) reversed += 2 ** (31 - i);
  const constraints = Array.from(hvcc.subarray(6, 12));
  while (constraints.length > 0 && constraints[constraints.length - 1] === 0) constraints.pop();
  const level = hvcc[12] as number;
  return [
    "hvc1",
    `${space}${profile}`,
    reversed.toString(16).toUpperCase(),
    `${tier}${level}`,
    ...constraints.map((c) => c.toString(16).toUpperCase()),
  ].join(".");
}

function ispe(b: Uint8Array, props: Box[]): { width: number; height: number } | null {
  const box = props.find((x) => x.type === "ispe");
  if (!box) return null;
  const width = readUint(b, box.start + 4, 4, box.end);
  const height = readUint(b, box.start + 8, 4, box.end);
  if (width <= 0 || height <= 0 || width > HEIF_MAX_SIDE || height > HEIF_MAX_SIDE) return null;
  return { width, height };
}

/** clap: a crop of width x height centred at the image centre plus the offsets (fractions). */
function cleanAperture(b: Uint8Array, box: Box, w: number, h: number): HeifCrop | null {
  const s32 = (at: number) => {
    const u = readUint(b, at, 4, box.end);
    return u < 0 ? Number.NaN : u >= 2 ** 31 ? u - 2 ** 32 : u;
  };
  const frac = (at: number) => s32(at) / readUint(b, at + 4, 4, box.end);
  const cw = frac(box.start);
  const ch = frac(box.start + 8);
  const ho = frac(box.start + 16);
  const vo = frac(box.start + 24);
  if (![cw, ch, ho, vo].every(Number.isFinite)) return null;
  const width = Math.round(cw);
  const height = Math.round(ch);
  const x = Math.round((w - cw) / 2 + ho);
  const y = Math.round((h - ch) / 2 + vo);
  if (width <= 0 || height <= 0 || x < 0 || y < 0 || x + width > w || y + height > h) return null;
  if (x === 0 && y === 0 && width === w && height === h) return null;
  return { x, y, width, height };
}

/**
 * The primary image of a HEIC, as HEVC tiles and the geometry to put them together; null when the
 * file is not HEIF with HEVC or uses something this reader does not handle.
 */
export function parseHeic(b: Uint8Array): HeifImage | null {
  if (!isHeic(b)) return null;
  const top = boxes(b, 0, b.length);
  const meta = top.find((x) => x.type === "meta");
  if (!meta) return null;
  const inner = boxes(b, meta.start + 4, meta.end);
  const find = (t: string) => inner.find((x) => x.type === t);
  const pitm = find("pitm");
  const iinf = find("iinf");
  const iloc = find("iloc");
  const iprp = find("iprp");
  if (!pitm || !iinf || !iloc || !iprp) return null;
  const primary = readUint(b, pitm.start + 4, (b[pitm.start] as number) === 0 ? 2 : 4, pitm.end);
  const types = readItemTypes(b, iinf);
  const locations = readLocations(b, iloc);
  const properties = readProperties(b, iprp);
  if (primary < 0 || !types || !locations || !properties) return null;
  const idat = find("idat");
  const propsOf = (id: number) => properties.get(id) ?? [];

  const primaryType = types.get(primary);
  let tileIds: number[];
  let width: number;
  let height: number;
  let columns = 1;
  if (primaryType === "hvc1") {
    tileIds = [primary];
    const size = ispe(b, propsOf(primary));
    if (!size) return null;
    ({ width, height } = size);
  } else if (primaryType === "grid") {
    const loc = locations.get(primary);
    const iref = find("iref");
    if (!loc || !iref) return null;
    const g = itemBytes(b, loc, idat);
    if (!g || g.length < 8 || g[0] !== 0) return null;
    const wide = ((g[1] as number) & 1) === 1;
    const rows = (g[2] as number) + 1;
    columns = (g[3] as number) + 1;
    width = readUint(g, 4, wide ? 4 : 2);
    height = readUint(g, wide ? 8 : 6, wide ? 4 : 2);
    tileIds = readRefs(b, iref, "dimg").get(primary) ?? [];
    if (tileIds.length !== rows * columns || tileIds.length > HEIF_MAX_TILES) return null;
  } else {
    return null;
  }
  if (width <= 0 || height <= 0 || width > HEIF_MAX_SIDE || height > HEIF_MAX_SIDE) return null;

  // Every tile is an hvc1 picture of the same size with the same decoder configuration.
  const first = propsOf(tileIds[0] as number);
  const hvcC = first.find((x) => x.type === "hvcC");
  const tileSize = ispe(b, first);
  if (!hvcC || !tileSize) return null;
  const description = b.subarray(hvcC.start, hvcC.end);
  const codec = hevcCodecString(description);
  if (!codec) return null;
  const tiles: HeifTile[] = [];
  for (const [i, id] of tileIds.entries()) {
    if (types.get(id) !== "hvc1") return null;
    const props = propsOf(id);
    const size = ispe(b, props);
    const config = props.find((x) => x.type === "hvcC");
    if (!size || size.width !== tileSize.width || size.height !== tileSize.height || !config)
      return null;
    if (config.end - config.start !== description.length) return null;
    if (!b.subarray(config.start, config.end).every((v, k) => v === description[k])) return null;
    const loc = locations.get(id);
    const data = loc ? itemBytes(b, loc, idat) : null;
    if (!data) return null;
    tiles.push({
      data,
      x: (i % columns) * tileSize.width,
      y: Math.floor(i / columns) * tileSize.height,
    });
  }
  // A grid's tiles must cover its output size (ISO/IEC 23008-12, 6.6.2.3.1).
  const rows = Math.ceil(tileIds.length / columns);
  if (columns * tileSize.width < width || rows * tileSize.height < height) return null;

  // The transformations, in the order the standard fixes: clap, then irot, then imir.
  const own = propsOf(primary);
  const clapBox = own.find((x) => x.type === "clap");
  // A clap that keeps the whole image, or one that cannot be read, crops nothing.
  const crop = clapBox ? cleanAperture(b, clapBox, width, height) : null;
  const irot = own.find((x) => x.type === "irot");
  const rotation = (irot ? (b[irot.start] as number) & 3 : 0) as 0 | 1 | 2 | 3;
  const imir = own.find((x) => x.type === "imir");
  // imir's one bit: 1 mirrors left to right, 0 top to bottom (as libheif and libavif read it).
  const mirror = imir
    ? ((b[imir.start] as number) & 1) === 1
      ? "left-right"
      : "top-bottom"
    : null;
  const cw = crop?.width ?? width;
  const ch = crop?.height ?? height;
  return {
    codec,
    description,
    tileWidth: tileSize.width,
    tileHeight: tileSize.height,
    tiles,
    width,
    height,
    crop,
    rotation,
    mirror,
    displayWidth: rotation % 2 === 1 ? ch : cw,
    displayHeight: rotation % 2 === 1 ? cw : ch,
  };
}

/**
 * Where a tile goes on a canvas of the cropped image scaled by (sx, sy): edges rounded from the
 * unscaled grid, so neighbouring tiles meet with no gap or overlap. Null when it lies outside.
 */
export function tileRect(
  img: Pick<HeifImage, "tileWidth" | "tileHeight" | "crop" | "width" | "height">,
  tile: Pick<HeifTile, "x" | "y">,
  sx: number,
  sy: number,
): { x: number; y: number; width: number; height: number } | null {
  const ox = img.crop?.x ?? 0;
  const oy = img.crop?.y ?? 0;
  const x0 = Math.round((tile.x - ox) * sx);
  const y0 = Math.round((tile.y - oy) * sy);
  const x1 = Math.round((tile.x + img.tileWidth - ox) * sx);
  const y1 = Math.round((tile.y + img.tileHeight - oy) * sy);
  const cw = img.crop?.width ?? img.width;
  const ch = img.crop?.height ?? img.height;
  if (x1 <= 0 || y1 <= 0 || x0 >= Math.round(cw * sx) || y0 >= Math.round(ch * sy)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/**
 * The canvas transform (setTransform's a, b, c, d, e, f) that draws a w x h picture rotated and
 * mirrored as the file says, onto a canvas of the display size (w and h swapped for a quarter turn).
 */
export function orientTransform(
  w: number,
  h: number,
  rotation: HeifImage["rotation"],
  mirror: HeifImage["mirror"],
): [number, number, number, number, number, number] {
  // Point mappings (x, y) -> (a x + c y + e, b x + d y + f), y pointing down.
  let m: [number, number, number, number, number, number] = [1, 0, 0, 1, 0, 0];
  let W = w;
  let H = h;
  const then = (n: [number, number, number, number, number, number]) => {
    // n after m.
    const [a, b, c, d, e, f] = m;
    const [A, B, C, D, E, F] = n;
    m = [
      A * a + C * b,
      B * a + D * b,
      A * c + C * d,
      B * c + D * d,
      A * e + C * f + E,
      B * e + D * f + F,
    ];
  };
  for (let i = 0; i < rotation; i++) {
    // A quarter turn anticlockwise: (x, y) -> (y, W - x); the size becomes H x W.
    then([0, -1, 1, 0, 0, W]);
    [W, H] = [H, W];
  }
  if (mirror === "left-right") then([-1, 0, 0, 1, W, 0]);
  if (mirror === "top-bottom") then([1, 0, 0, -1, 0, H]);
  return m.map((v) => v + 0) as typeof m; // no -0
}
