// A minimal ZIP writer (no dependency): files stored without compression, names in UTF-8 (general purpose
// bit 11), one CRC-32 per file, a central directory and its end record (PKWARE APPNOTE 6.3.10, sections
// 4.3.7, 4.3.12 and 4.3.16). Enough for a handful of CSV and text files a seller downloads at once: no
// ZIP64, so each file and the whole archive must stay under 4 GiB and 65,535 entries, which a shop's
// year-end records never approach. Every unzip tool and both operating systems' built-in viewers read it.

export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS date and time of a UTC instant (2-second resolution, 1980 to 2107). */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.min(Math.max(d.getUTCFullYear(), 1980), 2107);
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

const MAX_ENTRY_BYTES = 0xfffffffe;

export function zip(entries: ZipEntry[], modified: Date = new Date()): Uint8Array<ArrayBuffer> {
  if (entries.length > 0xffff) throw new Error("too many files for a ZIP without ZIP64");
  const enc = new TextEncoder();
  const { time, date } = dosDateTime(modified);
  const seen = new Set<string>();
  const files = entries.map((e) => {
    if (
      !e.name ||
      e.name.startsWith("/") ||
      e.name.split("/").includes("..") ||
      e.name.includes("\\")
    ) {
      throw new Error(`unsafe file name in ZIP: ${e.name}`);
    }
    if (seen.has(e.name)) throw new Error(`duplicate file name in ZIP: ${e.name}`);
    seen.add(e.name);
    const name = enc.encode(e.name);
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    if (data.length > MAX_ENTRY_BYTES)
      throw new Error(`file too large for a ZIP without ZIP64: ${e.name}`);
    return { name, data, crc: crc32(data) };
  });

  const localSize = files.reduce((s, f) => s + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((s, f) => s + 46 + f.name.length, 0);
  if (localSize + centralSize + 22 > MAX_ENTRY_BYTES)
    throw new Error("archive too large without ZIP64");
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number) => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number) => {
    view.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const bytes = (b: Uint8Array) => {
    out.set(b, p);
    p += b.length;
  };

  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(p);
    u32(0x04034b50); // local file header
    u16(20); // version needed: 2.0
    u16(0x0800); // UTF-8 names
    u16(0); // stored
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0); // no extra field
    bytes(f.name);
    bytes(f.data);
  }
  const centralStart = p;
  files.forEach((f, i) => {
    u32(0x02014b50); // central directory header
    u16(0x0314); // made by: UNIX, 2.0 (so the mode below is read)
    u16(20);
    u16(0x0800);
    u16(0);
    u16(time);
    u16(date);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk
    u16(0); // internal attributes
    u32((0o100644 << 16) >>> 0); // a regular file, rw-r--r--
    u32(offsets[i] as number);
    bytes(f.name);
  });
  const centralLength = p - centralStart;
  u32(0x06054b50); // end of central directory
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralLength);
  u32(centralStart);
  u16(0); // no comment
  return out;
}
