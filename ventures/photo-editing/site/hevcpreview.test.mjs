import { test } from "node:test";
import assert from "node:assert/strict";
import { readRaw, readRawFile, hevcCodec } from "./rawpreview.mjs";
import { decodeHevcPreview, hevcSupported } from "./hevcpreview.mjs";

// The first 88 bytes of the 1620 x 1080 HEVC preview in a Nikon Z8 NEF shot in
// HLG tone mode (aaron-rust/hdr-sample-images IMAGE_001.NEF): VPS, SPS and the
// start of the PPS. ffprobe reads it as Main 10, level 120 (4.0), BT.2020 HLG;
// its trace_headers gives progressive, non-packed, frame-only and
// one-picture-only constraint flags set (bytes B0 10).
const Z8_HEAD = Uint8Array.from(Buffer.from(
  "0000000140010c01ffff022000000300b010000003000078702400000001420101022000000300b010000003000078a003308011073caddeec8483d89b8489048040000000014401c0109181d8c800", "hex"));

test("hevcCodec reads the general profile_tier_level, emulation bytes removed", () => {
  assert.equal(hevcCodec(Z8_HEAD, 0, Z8_HEAD.length), "hev1.2.4.L120.B0.10");
  // The SPS alone (no VPS) gives the same string.
  const sps = Z8_HEAD.indexOf(0x42, 20) - 3;
  assert.equal(hevcCodec(Z8_HEAD, sps, Z8_HEAD.length - sps), "hev1.2.4.L120.B0.10");
  // A JPEG or noise gives none.
  assert.equal(hevcCodec(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0]), 0, 8), null);
});

// A little-endian NEF skeleton: IFD0 (Make, Model, a 160 x 120 thumbnail
// pointer to nothing decodable, SubIFDs) and two reduced-resolution SubIFDs
// with Compression 34713 whose strips hold Z8_HEAD, as the Z8 writes them.
function fakeNef(size) {
  const b = new Uint8Array(size), dv = new DataView(b.buffer);
  b.set([0x49, 0x49, 42, 0]); dv.setUint32(4, 8, true);
  const str = (o, s) => { b.set(new TextEncoder().encode(s + "\0"), o); };
  const ifd = (o, entries) => {
    dv.setUint16(o, entries.length, true);
    entries.forEach(([tag, type, count, val], i) => {
      const e = o + 2 + 12 * i;
      dv.setUint16(e, tag, true); dv.setUint16(e + 2, type, true); dv.setUint32(e + 4, count, true);
      if (type === 3 && count === 1) dv.setUint16(e + 8, val, true); else dv.setUint32(e + 8, val, true);
    });
    dv.setUint32(o + 2 + 12 * entries.length, 0, true);
  };
  str(400, "NIKON CORPORATION"); str(420, "NIKON Z 8");
  dv.setUint32(440, 600, true); dv.setUint32(444, 700, true);
  ifd(8, [[0x10f, 2, 18, 400], [0x110, 2, 10, 420], [0x14a, 4, 2, 440]]);
  const sub = (o, w, h, at, n) => ifd(o, [[0xfe, 4, 1, 1], [0x100, 3, 1, w], [0x101, 3, 1, h], [0x103, 3, 1, 34713], [0x111, 4, 1, at], [0x117, 4, 1, n]]);
  sub(600, 320, 212, 300000, 40000);
  sub(700, 1620, 1080, 200000, 90000);
  b.set(Z8_HEAD, 200000); b.set(Z8_HEAD, 300000);
  return b;
}

test("readRaw lists HEVC previews largest first with their codec", () => {
  const r = readRaw(fakeNef(400000), "IMAGE_001.NEF");
  assert.equal(r.format, "NEF");
  assert.equal(r.preview, null);
  assert.deepEqual(r.hevc.map((h) => [h.width, h.height, h.offset, h.length, h.codec]),
    [[1620, 1080, 200000, 90000, "hev1.2.4.L120.B0.10"], [320, 212, 300000, 40000, "hev1.2.4.L120.B0.10"]]);
});

test("readRawFile stops at the HEVC preview instead of reading the whole raw", async () => {
  const bytes = fakeNef(50 << 20);
  const r = await readRawFile(Object.assign(new Blob([bytes]), { name: "IMAGE_001.NEF" }));
  assert.equal(r.sparse, true);
  assert.ok(r.bytesRead < 1 << 20, `read ${r.bytesRead}`);
  assert.equal(r.hevc[0].codec, "hev1.2.4.L120.B0.10");
});

// A stand-in for WebCodecs: records what the page hands the decoder.
function fakeEnv({ supported = true, fail = false } = {}) {
  const seen = { configs: [], chunks: [], closed: 0 };
  class VideoDecoder {
    static async isConfigSupported(c) { return { supported, config: c }; }
    constructor({ output, error }) { this.output = output; this.error = error; }
    configure(c) { seen.configs.push(c); }
    decode(chunk) { seen.chunks.push(chunk); }
    async flush() {
      if (fail) { this.error(new Error("decode failed")); throw new Error("decode failed"); }
      this.output({ displayWidth: 1620, displayHeight: 1080, close() { seen.closed++; } });
    }
    close() {}
  }
  class EncodedVideoChunk { constructor(o) { Object.assign(this, o); } }
  const makeCanvas = (w, h) => ({ w, h, getContext: () => ({ drawImage: (f, x, y, dw, dh) => { seen.drawn = [dw, dh]; } }),
    convertToBlob: async (o) => new Blob(["jpeg"], { type: o.type }) });
  return { env: { VideoDecoder, EncodedVideoChunk, makeCanvas }, seen };
}

test("decodeHevcPreview feeds the strip as one Annex B key chunk and returns a JPEG", async () => {
  const bytes = fakeNef(400000);
  const file = new Blob([bytes]);
  const h = readRaw(bytes).hevc[0];
  const { env, seen } = fakeEnv();
  const d = await decodeHevcPreview(file, h, env);
  assert.deepEqual([d.width, d.height, d.blob.type], [1620, 1080, "image/jpeg"]);
  assert.deepEqual(seen.configs, [{ codec: "hev1.2.4.L120.B0.10" }]);
  assert.equal(seen.chunks.length, 1);
  assert.equal(seen.chunks[0].type, "key");
  assert.equal(seen.chunks[0].data.length, 90000);
  assert.deepEqual([...seen.chunks[0].data.subarray(0, 6)], [0, 0, 0, 1, 0x40, 0x01]);
  assert.deepEqual(seen.drawn, [1620, 1080]);
  assert.equal(seen.closed, 1);
});

test("no HEVC decoder gives null (the page keeps the thumbnail); a failed decode rejects", async () => {
  const bytes = fakeNef(400000);
  const h = { ...readRaw(bytes).hevc[0], codec: "hev1.2.4.L120.B0.10.test-unsupported" };
  assert.equal(await decodeHevcPreview(new Blob([bytes]), h, fakeEnv({ supported: false }).env), null);
  assert.equal(await hevcSupported("hev1.x", {}), false);
  const h2 = { ...h, codec: "hev1.2.4.L120.B0.10.test-fail" };
  await assert.rejects(decodeHevcPreview(new Blob([bytes]), h2, fakeEnv({ fail: true }).env), /decode failed/);
});
