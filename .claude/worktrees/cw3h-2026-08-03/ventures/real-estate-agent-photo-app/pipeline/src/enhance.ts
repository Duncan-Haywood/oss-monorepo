/**
 * enhance.ts — the "Enhance" step of STRATEGY.md's 5-step workflow
 * (Guide -> Enhance -> Polish -> Deliver -> Brand), automated.
 *
 * Deliberately deterministic, local, and dependency-light (sharp only, no
 * cloud AI calls, no API keys) so it can run during a concierge shoot on a
 * laptop with no setup cost and no per-image spend — see the pipeline
 * decision in process/decisions-log.ts for why. It approximates the
 * exposure/white-balance/perspective cleanup a human editor would do by
 * hand; it is not a replacement for the "Polish" step (virtual staging,
 * twilight, object removal), which stays a human/cloud task.
 */

import { mkdir, readdir, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

import sharp from "sharp";

export const SUPPORTED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".tiff", ".tif", ".webp"]);

export type EnhanceOptions = {
  /** Long-edge cap in pixels. MLS platforms commonly cap around 2048-3000px. */
  maxWidth: number;
  /** JPEG output quality, 1-100. */
  quality: number;
};

export const DEFAULT_ENHANCE_OPTIONS: EnhanceOptions = {
  maxWidth: 2048,
  quality: 88,
};

export type EnhanceResult = {
  inputPath: string;
  outputPath: string;
  inputBytes: number;
  outputBytes: number;
  width: number;
  height: number;
};

/**
 * Applies the automated enhancement pass to a single image: auto-orient
 * from EXIF, per-channel contrast normalization (stand-in for exposure +
 * white balance correction), a light sharpen pass, and a resize/re-encode
 * to a consistent MLS-ready JPEG.
 */
export async function enhanceImage(
  inputPath: string,
  outputPath: string,
  options: EnhanceOptions = DEFAULT_ENHANCE_OPTIONS,
): Promise<EnhanceResult> {
  const inputStat = await stat(inputPath);

  const pipeline = sharp(inputPath)
    .rotate()
    .resize({ width: options.maxWidth, withoutEnlargement: true })
    .normalise()
    .sharpen({ sigma: 0.6 })
    .jpeg({ quality: options.quality, mozjpeg: true });

  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await sharp(data).toFile(outputPath);

  return {
    inputPath,
    outputPath,
    inputBytes: inputStat.size,
    outputBytes: data.length,
    width: info.width,
    height: info.height,
  };
}

export type BatchEnhanceOptions = EnhanceOptions & {
  /** Slug used as the output filename prefix, e.g. a listing address. */
  listingSlug: string;
};

export type BatchEnhanceSummary = {
  processed: EnhanceResult[];
  skipped: { path: string; reason: string }[];
};

function slugify(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "listing"
  );
}

/**
 * Enhances every supported image in `inputDir` and writes the result to
 * `outputDir` with sequential, MLS-upload-friendly filenames
 * (`{listing-slug}-01.jpg`, `-02.jpg`, ...). Files are processed in
 * directory-listing order, which on most cameras/phones is capture order —
 * that keeps delivered numbering roughly matching the shoot's room order.
 */
export async function batchEnhance(
  inputDir: string,
  outputDir: string,
  options: BatchEnhanceOptions,
): Promise<BatchEnhanceSummary> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const slug = slugify(options.listingSlug);
  const summary: BatchEnhanceSummary = { processed: [], skipped: [] };

  let index = 1;
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      summary.skipped.push({ path: file, reason: `Unsupported extension "${ext}"` });
      continue;
    }
    const outputName = `${slug}-${String(index).padStart(2, "0")}.jpg`;
    const result = await enhanceImage(join(inputDir, file), join(outputDir, outputName), options);
    summary.processed.push(result);
    index += 1;
  }

  return summary;
}
