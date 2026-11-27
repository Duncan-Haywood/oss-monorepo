// HEIC photos read in Chrome, Edge and Firefox, which cannot open a HEIC as an image (Backup packets
// part 3). A HEIC is HEVC pictures in a HEIF container; where the browser can play HEVC video (it
// uses the computer's or phone's own decoder, so nothing is bundled or licensed here) WebCodecs'
// VideoDecoder decodes each picture. shared/heif.ts finds the pictures; this draws them, tile by
// tile, straight onto a canvas at the size the JPEG will be (so a 48-megapixel photo never needs a
// 48-megapixel canvas), then crops, turns and mirrors as the file says.
//
// When the browser has no VideoDecoder or says it cannot decode this HEVC profile, the decoder
// returns null and the original HEIC is uploaded, as before. Colour: the canvas gets what the
// browser's decoder outputs (iPhone photos are Display P3; on an sRGB canvas they look slightly less
// saturated than in Photos). Nothing leaves the browser.
import { type HeifImage, isHeic, orientTransform, parseHeic, tileRect } from "@shared/heif";
import type { Decoded } from "./packet-photo";

/** What this file needs from the browser, so tests can stand in for it. */
export interface HeicEnv {
  VideoDecoder?: typeof VideoDecoder;
  EncodedVideoChunk?: typeof EncodedVideoChunk;
  createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas | null;
}

function domCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}

const browserEnv = (): HeicEnv => ({
  VideoDecoder: typeof VideoDecoder === "function" ? VideoDecoder : undefined,
  EncodedVideoChunk: typeof EncodedVideoChunk === "function" ? EncodedVideoChunk : undefined,
  createCanvas: domCanvas,
});

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

async function toJpegBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  quality: number,
): Promise<Blob | null> {
  if ("convertToBlob" in canvas) {
    try {
      return await canvas.convertToBlob({ type: "image/jpeg", quality });
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

/**
 * Decodes every tile and draws it onto ctx, the cropped image scaled by (sx, sy). Resolves false if
 * the decoder fails or a tile never comes out.
 */
async function drawTiles(
  img: HeifImage,
  env: Required<Pick<HeicEnv, "VideoDecoder" | "EncodedVideoChunk">>,
  ctx: Ctx,
  sx: number,
  sy: number,
): Promise<boolean> {
  let failed = false;
  const drawn = new Set<number>();
  const decoder = new env.VideoDecoder({
    output: (frame) => {
      try {
        const i = frame.timestamp;
        const tile = img.tiles[i];
        const rect = tile ? tileRect(img, tile, sx, sy) : null;
        if (tile && !drawn.has(i)) {
          drawn.add(i);
          if (rect) {
            const sw = Math.min(img.tileWidth, frame.displayWidth);
            const sh = Math.min(img.tileHeight, frame.displayHeight);
            ctx.drawImage(frame, 0, 0, sw, sh, rect.x, rect.y, rect.width, rect.height);
          }
        }
      } catch {
        failed = true;
      } finally {
        frame.close();
      }
    },
    error: () => {
      failed = true;
    },
  });
  try {
    decoder.configure({
      codec: img.codec,
      description: img.description,
      codedWidth: img.tileWidth,
      codedHeight: img.tileHeight,
      optimizeForLatency: true,
    });
    for (const [i, tile] of img.tiles.entries()) {
      // Each tile is a picture of its own: a key frame, numbered by its place in the grid.
      decoder.decode(new env.EncodedVideoChunk({ type: "key", timestamp: i, data: tile.data }));
    }
    await decoder.flush();
  } catch {
    failed = true;
  } finally {
    if (decoder.state !== "closed") decoder.close();
  }
  return !failed && drawn.size === img.tiles.length;
}

/**
 * Decodes a HEIC with the browser's HEVC video decoder; null when the file is not a HEIC this
 * reader understands or the browser cannot decode it.
 */
export async function webCodecsHeic(
  file: Blob,
  env: HeicEnv = browserEnv(),
): Promise<Decoded | null> {
  const { VideoDecoder: VD, EncodedVideoChunk: Chunk } = env;
  if (!VD || !Chunk) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isHeic(bytes)) return null;
  const img = parseHeic(bytes);
  if (!img) return null;
  try {
    const support = await VD.isConfigSupported({
      codec: img.codec,
      description: img.description,
      codedWidth: img.tileWidth,
      codedHeight: img.tileHeight,
    });
    if (!support.supported) return null;
  } catch {
    return null;
  }
  return {
    width: img.displayWidth,
    height: img.displayHeight,
    toJpeg: async (w, h, quality) => {
      // w x h is the display size; before the quarter turns the picture is h x w.
      const turned = img.rotation % 2 === 1;
      const pw = turned ? h : w;
      const ph = turned ? w : h;
      const cw = img.crop?.width ?? img.width;
      const ch = img.crop?.height ?? img.height;
      const flat = env.createCanvas(pw, ph);
      const fctx = flat?.getContext("2d") as Ctx | null | undefined;
      if (!flat || !fctx) return null;
      const ok = await drawTiles(
        img,
        { VideoDecoder: VD, EncodedVideoChunk: Chunk },
        fctx,
        pw / cw,
        ph / ch,
      );
      if (!ok) return null;
      const out = env.createCanvas(w, h);
      const octx = out?.getContext("2d") as Ctx | null | undefined;
      if (!out || !octx) return null;
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, w, h);
      octx.setTransform(...orientTransform(pw, ph, img.rotation, img.mirror));
      octx.drawImage(flat, 0, 0);
      octx.setTransform(1, 0, 0, 1, 0, 0);
      return toJpegBlob(out, quality);
    },
    close: () => {},
  };
}
