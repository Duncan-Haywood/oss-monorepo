// The WebCodecs HEIC decoder (client/lib/heic-webcodecs.ts) with a stand-in VideoDecoder and canvas:
// which chunks it feeds, where each decoded tile is drawn, and when it gives up so the original HEIC
// is uploaded. The real decode is checked in Chromium by test/fixtures/pdf-sources/heic-webcodecs-check.cjs.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type HeicEnv, webCodecsHeic } from "../../src/client/lib/heic-webcodecs";

const fixture = (name: string) =>
  new Blob([new Uint8Array(readFileSync(new URL(`../fixtures/${name}`, import.meta.url)))]);

interface Options {
  supported?: boolean;
  /** Tile index whose decode reports an error. */
  failAt?: number;
  /** Drop this tile's output, as a decoder that loses a frame would. */
  dropAt?: number;
}

function env(opts: Options = {}) {
  const chunks: { type: string; timestamp: number; byteLength: number }[] = [];
  const configs: unknown[] = [];
  const draws: number[][] = [];
  const transforms: number[][] = [];
  class FakeChunk {
    type: string;
    timestamp: number;
    byteLength: number;
    constructor(init: { type: string; timestamp: number; data: Uint8Array }) {
      this.type = init.type;
      this.timestamp = init.timestamp;
      this.byteLength = init.data.byteLength;
    }
  }
  class FakeDecoder {
    state = "unconfigured";
    private out: (f: unknown) => void;
    private err: (e: unknown) => void;
    private queue: number[] = [];
    constructor(init: { output: (f: unknown) => void; error: (e: unknown) => void }) {
      this.out = init.output;
      this.err = init.error;
    }
    static async isConfigSupported(config: unknown) {
      configs.push(config);
      return { supported: opts.supported ?? true };
    }
    configure() {
      this.state = "configured";
    }
    decode(chunk: FakeChunk) {
      chunks.push({ type: chunk.type, timestamp: chunk.timestamp, byteLength: chunk.byteLength });
      this.queue.push(chunk.timestamp);
    }
    async flush() {
      // Out of order, as a decoder may return them: the timestamp says which tile it is.
      for (const t of [...this.queue].reverse()) {
        if (t === opts.failAt) {
          this.err(new Error("decode failed"));
          continue;
        }
        if (t === opts.dropAt) continue;
        this.out({ timestamp: t, displayWidth: 256, displayHeight: 256, close() {} });
      }
    }
    close() {
      this.state = "closed";
    }
  }
  const canvases: { w: number; h: number }[] = [];
  const e: HeicEnv = {
    VideoDecoder: FakeDecoder as unknown as typeof VideoDecoder,
    EncodedVideoChunk: FakeChunk as unknown as typeof EncodedVideoChunk,
    createCanvas: (w, h) => {
      canvases.push({ w, h });
      const ctx = {
        fillStyle: "",
        fillRect() {},
        setTransform: (...m: number[]) => transforms.push(m),
        drawImage: (src: { timestamp?: number }, ...args: number[]) => {
          if (src.timestamp !== undefined) draws.push([src.timestamp, ...args]);
        },
      };
      return {
        width: w,
        height: h,
        getContext: () => ctx,
        convertToBlob: async () =>
          new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" }),
      } as unknown as OffscreenCanvas;
    },
  };
  return { env: e, chunks, configs, draws, transforms, canvases };
}

describe("webCodecsHeic", () => {
  it("feeds every tile as a key frame and draws each where the grid puts it", async () => {
    const t = env();
    const d = await webCodecsHeic(fixture("heic-grid-libheif.heic"), t.env);
    expect(d).toMatchObject({ width: 600, height: 400 });
    expect(t.configs[0]).toMatchObject({
      codec: "hvc1.3.E.L60.90",
      codedWidth: 256,
      codedHeight: 256,
    });
    const jpeg = await d!.toJpeg(600, 400, 0.9);
    expect(jpeg?.type).toBe("image/jpeg");
    expect(t.chunks.map((c) => [c.type, c.timestamp])).toEqual(
      [0, 1, 2, 3, 4, 5].map((i) => ["key", i]),
    );
    const byTile = new Map(t.draws.map(([i, ...rest]) => [i, rest]));
    expect(byTile.get(0)).toEqual([0, 0, 256, 256, 0, 0, 256, 256]);
    expect(byTile.get(2)).toEqual([0, 0, 256, 256, 512, 0, 256, 256]);
    expect(byTile.get(4)).toEqual([0, 0, 256, 256, 256, 256, 256, 256]);
    expect(t.canvases).toEqual([
      { w: 600, h: 400 },
      { w: 600, h: 400 },
    ]);
  });
  it("draws a turned photo unturned first, then turns it onto the display-size canvas", async () => {
    const t = env();
    const d = await webCodecsHeic(fixture("heic-grid-rot-libheif.heic"), t.env);
    expect(d).toMatchObject({ width: 400, height: 600 });
    await d!.toJpeg(200, 300, 0.9);
    expect(t.canvases).toEqual([
      { w: 300, h: 200 },
      { w: 200, h: 300 },
    ]);
    // Three quarter turns anticlockwise of a 300 x 200 picture: (x, y) -> (200 - y, x).
    expect(t.transforms[0]).toEqual([0, 1, -1, 0, 200, 0]);
    // Scaled by a half: the third tile starts at x 256 and runs to the canvas edge.
    const third = t.draws.find(([i]) => i === 2)!;
    expect(third.slice(5)).toEqual([256, 0, 128, 128]);
  });
  it("gives up when the browser cannot decode this HEVC, has no WebCodecs or the file is not a HEIC", async () => {
    expect(
      await webCodecsHeic(fixture("heic-grid-libheif.heic"), env({ supported: false }).env),
    ).toBeNull();
    const none = env().env;
    expect(
      await webCodecsHeic(fixture("heic-grid-libheif.heic"), { ...none, VideoDecoder: undefined }),
    ).toBeNull();
    expect(await webCodecsHeic(fixture("exif-photo-pillow.jpg"), env().env)).toBeNull();
  });
  it("writes no JPEG when a tile fails or never comes out", async () => {
    const failing = await webCodecsHeic(fixture("heic-grid-libheif.heic"), env({ failAt: 3 }).env);
    expect(await failing!.toJpeg(600, 400, 0.9)).toBeNull();
    const dropping = await webCodecsHeic(fixture("heic-grid-libheif.heic"), env({ dropAt: 5 }).env);
    expect(await dropping!.toJpeg(600, 400, 0.9)).toBeNull();
  });
});
