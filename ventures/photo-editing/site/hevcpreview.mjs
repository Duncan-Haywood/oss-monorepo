// Decodes the HEVC preview a Nikon Z8/Z9 NEF carries when it was shot in HLG
// tone mode (rawpreview.mjs finds it: r.hevc, largest first) into a JPEG blob,
// with the browser's own HEVC decoder through WebCodecs. Safari has one;
// Chrome and Edge have one where the machine's hardware decodes HEVC. Where
// there is none, this returns null and the page keeps the file's 160 x 120
// thumbnail. Nothing is downloaded: no software decoder is shipped.
//
// The bitstream is Annex B (start codes, VPS/SPS/PPS in band), so the decoder
// is configured with a "hev1" codec string and no description, and fed the
// strip as one key chunk. The frame is HLG in BT.2020; drawing it on a 2D
// canvas maps it to the canvas's sRGB, as the browser shows HDR video on an
// SDR page.

const supported = new Map();

/** Whether this browser can decode `codec` (cached per codec string). */
export async function hevcSupported(codec, env = globalThis) {
  if (supported.has(codec)) return supported.get(codec);
  let ok = false;
  try { ok = typeof env.VideoDecoder === "function" && !!(await env.VideoDecoder.isConfigSupported({ codec })).supported; } catch { ok = false; }
  supported.set(codec, ok);
  return ok;
}

/**
 * file: a File/Blob; h: { offset, length, codec } from readRaw's `hevc`.
 * Resolves { blob, width, height } or null when the browser cannot decode it.
 * Rejects when a decoder exists but the stream fails.
 */
export async function decodeHevcPreview(file, h, env = globalThis) {
  if (!h || !h.codec || !(await hevcSupported(h.codec, env))) return null;
  const data = new Uint8Array(await file.slice(h.offset, h.offset + h.length).arrayBuffer());
  const frame = await new Promise((resolve, reject) => {
    let got = null, failed = false;
    const dec = new env.VideoDecoder({
      output: (f) => { if (got) f.close(); else got = f; },
      error: (e) => { failed = true; reject(e); },
    });
    try {
      dec.configure({ codec: h.codec });
      dec.decode(new env.EncodedVideoChunk({ type: "key", timestamp: 0, data }));
    } catch (e) { reject(e); return; }
    dec.flush().then(
      () => { try { dec.close(); } catch { /* already closed */ } if (got) resolve(got); else reject(new Error("the HEVC preview gave no picture")); },
      (e) => { if (!failed) reject(e); },
    );
  });
  try {
    const w = frame.displayWidth, ht = frame.displayHeight;
    const c = env.makeCanvas ? env.makeCanvas(w, ht) : new env.OffscreenCanvas(w, ht);
    c.getContext("2d").drawImage(frame, 0, 0, w, ht);
    const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.9 });
    return { blob, width: w, height: ht };
  } finally {
    frame.close();
  }
}
