// The standard non-image PDF filters (ISO 32000-1 section 7.4) against the specification's own
// examples, round trips through small reference encoders written here, and hostile inputs.

import { lzwEncode } from "@test/unit/lzw-encode";
import { describe, expect, it } from "vitest";
import {
  ascii85Decode,
  asciiHexDecode,
  FilterDataError,
  InflateLimitError,
  lzwDecode,
  runLengthDecode,
  untiffPredictor,
} from "./filters";

const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const text = (b: Uint8Array) => String.fromCharCode(...b);

/** A deterministic pseudo-random byte source, so failures reproduce. */
function noise(n: number, seed: number, alphabet = 256) {
  const out = new Uint8Array(n);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = (x >>> 0) % alphabet;
  }
  return out;
}

describe("asciiHexDecode", () => {
  it("reads hex pairs, skips white space and stops at >", () => {
    expect(text(asciiHexDecode(bytes("48 65\n6C6c 6F>ignored")))).toBe("Hello");
  });
  it("pads an odd final digit with 0", () => {
    expect([...asciiHexDecode(bytes("7>"))]).toEqual([0x70]);
  });
  it("refuses a character that is not hex", () => {
    expect(() => asciiHexDecode(bytes("4G>"))).toThrow(FilterDataError);
  });
});

describe("ascii85Decode", () => {
  it("decodes the classic example and a short final group", () => {
    expect(text(ascii85Decode(bytes("9jqo^BlbD-BleB1DJ+*+F(f,q~>")))).toBe("Man is distinguished");
    // Python's base64.a85encode(b"Retainage 10%!", adobe=True), with its <~ ~> frame.
    expect(text(ascii85Decode(bytes("<~;IsrYBl7?lAKW]],p<~>")))).toBe("Retainage 10%!");
  });
  it("reads z as four zero bytes and ignores white space", () => {
    expect([...ascii85Decode(bytes("z\n z~>"))]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
  });
  it("refuses characters outside ! to u and a lone final character", () => {
    expect(() => ascii85Decode(bytes("9jqo{~>"))).toThrow(FilterDataError);
    expect(() => ascii85Decode(bytes("9jqo^B~>"))).toThrow(FilterDataError);
  });
  it("refuses a group above 2^32 - 1", () => {
    expect(() => ascii85Decode(bytes("uuuuu~>"))).toThrow(FilterDataError);
  });
});

describe("lzwDecode", () => {
  it("decodes the specification's example (ISO 32000-1, 7.4.4.2)", () => {
    const encoded = Uint8Array.of(0x80, 0x0b, 0x60, 0x50, 0x22, 0x0c, 0x0c, 0x85, 0x01);
    expect([...lzwDecode(encoded)]).toEqual([45, 45, 45, 45, 45, 65, 45, 45, 45, 66]);
  });
  it("round-trips text and noise through every code length and a table reset", () => {
    const samples = [
      bytes("BT /F1 12 Tf 72 720 Td (Drywall, level 2) Tj ET\n".repeat(400)),
      noise(20000, 7, 4), // long runs of few symbols: fills the table and resets it
      noise(30000, 11), // incompressible: reaches 12-bit codes quickly
      new Uint8Array(5000), // KwKwK on every code
    ];
    for (const data of samples) {
      for (const early of [1, 0]) {
        expect(lzwDecode(lzwEncode(data, early), early)).toEqual(data);
      }
    }
  });
  it("keeps what it decoded when the data ends without the end code", () => {
    const full = lzwEncode(bytes("progress billing"));
    const cut = lzwDecode(full.subarray(0, full.length - 2));
    expect(text(cut)).toBe("progress billing".slice(0, cut.length));
    expect(cut.length).toBeGreaterThan(10);
  });
  it("refuses a code past the table", () => {
    // 9-bit codes: 65, then 400 (only 258 exists).
    const v = (65 << 9) | 400;
    expect(() => lzwDecode(Uint8Array.of(v >> 10, (v >> 2) & 0xff, (v & 3) << 6))).toThrow(
      FilterDataError,
    );
  });
  it("stops past the byte limit", () => {
    expect(() => lzwDecode(lzwEncode(new Uint8Array(100000)), 1, 1000)).toThrow(InflateLimitError);
  });
});

describe("runLengthDecode", () => {
  it("copies literal runs, repeats runs and stops at 128", () => {
    const encoded = Uint8Array.of(2, 65, 66, 67, 254, 90, 128, 1, 2);
    expect(text(runLengthDecode(encoded))).toBe("ABCZZZ");
  });
  it("stops past the byte limit", () => {
    const bomb = new Uint8Array(2000);
    for (let i = 0; i < bomb.length; i += 2) bomb[i] = 129; // 128 copies of the next byte
    expect(() => runLengthDecode(bomb, 10000)).toThrow(InflateLimitError);
  });
});

describe("untiffPredictor", () => {
  const encode = (row: number[], colors: number) =>
    row.map((v, i) => (i >= colors ? (v - (row[i - colors] as number)) & 0xff : v));

  it("undoes horizontal differencing per colour, row by row", () => {
    const rowA = [10, 20, 30, 15, 25, 35, 200, 100, 50];
    const rowB = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const data = Uint8Array.from([...encode(rowA, 3), ...encode(rowB, 3)]);
    expect([...untiffPredictor(data, 3, 8, 3)]).toEqual([...rowA, ...rowB]);
  });
  it("handles 16-bit samples", () => {
    // Samples 1000, 1500, 400 stored as 1000, +500, -1100 (mod 65536).
    const d = [1000, 500, (400 - 1500 + 65536) & 0xffff];
    const data = Uint8Array.from(d.flatMap((v) => [v >> 8, v & 0xff]));
    expect([...untiffPredictor(data, 1, 16, 3)]).toEqual([3, 232, 5, 220, 1, 144]);
  });
  it("handles 4-bit samples", () => {
    // Samples 3, 5, 9, 2 stored as 3, +2, +4, -7 (mod 16) in two bytes.
    const data = Uint8Array.of(0x32, 0x49);
    expect([...untiffPredictor(data, 1, 4, 4)]).toEqual([0x35, 0x92]);
  });
  it("refuses bit depths TIFF does not define", () => {
    expect(() => untiffPredictor(new Uint8Array(4), 1, 3, 4)).toThrow(FilterDataError);
  });
});
