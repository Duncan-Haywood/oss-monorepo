/**
 * enhance.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Generates synthetic source images (no real listing photos needed) and
 * asserts the batch pipeline actually produces resized, re-encoded,
 * sequentially-named JPEGs and reports coverage correctly. Exits non-zero
 * on failure so it's usable as a CI/pre-push gate.
 */

import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { batchEnhance } from "./enhance";
import { checkCoverage, expectedShotCount } from "./coverage";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function makeSyntheticPhoto(path: string, color: { r: number; g: number; b: number }) {
  await sharp({
    create: { width: 800, height: 600, channels: 3, background: color },
  })
    .jpeg()
    .toFile(path);
}

async function run() {
  const inDir = await mkdtemp(join(tmpdir(), "listing-lens-in-"));
  const outDir = await mkdtemp(join(tmpdir(), "listing-lens-out-"));

  try {
    await makeSyntheticPhoto(join(inDir, "IMG_0001.jpg"), { r: 40, g: 40, b: 40 });
    await makeSyntheticPhoto(join(inDir, "IMG_0002.jpg"), { r: 200, g: 180, b: 150 });
    await makeSyntheticPhoto(join(inDir, "notes.txt"), { r: 0, g: 0, b: 0 }); // wrong ext, ignored below

    // notes.txt isn't a real image; write it as plain text instead so the
    // "skip unsupported/unreadable files" path is exercised honestly.
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(inDir, "notes.txt"), "not an image");

    const summary = await batchEnhance(inDir, outDir, {
      listingSlug: "123 Main St",
      maxWidth: 400,
      quality: 80,
    });

    assert(summary.processed.length === 2, `expected 2 processed images, got ${summary.processed.length}`);
    assert(summary.skipped.length === 1, `expected 1 skipped file, got ${summary.skipped.length}`);
    assert(summary.skipped[0].path === "notes.txt", "notes.txt should be the skipped file");

    const outFiles = (await readdir(outDir)).sort();
    assert(
      outFiles.join(",") === "123-main-st-01.jpg,123-main-st-02.jpg",
      `unexpected output filenames: ${outFiles.join(",")}`,
    );

    for (const result of summary.processed) {
      assert(result.width <= 400, `output width ${result.width} should be capped at 400`);
      assert(result.outputBytes > 0, "output file should be non-empty");

      // `outputBytes` used to report the length of an encoded buffer that was
      // then decoded and re-encoded on the way to disk, so the delivery report
      // described a file the customer never received.
      const { size } = await stat(result.outputPath);
      assert(
        result.outputBytes === size,
        `reported ${result.outputBytes} bytes but wrote ${size} to ${result.outputPath}`,
      );
    }

    // A portrait frame is the orientation the capture checklist asks agents to
    // shoot in. `maxWidth` is documented as a long-edge cap; constraining only
    // the width left the long edge above it and made a mixed-orientation shoot
    // inconsistent, against an offer that promises "a consistent MLS-ready
    // size".
    const portraitIn = await mkdtemp(join(tmpdir(), "listing-lens-portrait-in-"));
    const portraitOut = await mkdtemp(join(tmpdir(), "listing-lens-portrait-out-"));
    try {
      await sharp({ create: { width: 600, height: 800, channels: 3, background: { r: 90, g: 90, b: 90 } } })
        .jpeg()
        .toFile(join(portraitIn, "IMG_0100.jpg"));

      const portrait = await batchEnhance(portraitIn, portraitOut, {
        listingSlug: "9 Tall House",
        maxWidth: 400,
        quality: 80,
      });

      assert(portrait.processed.length === 1, "the portrait frame should be processed");
      const [shot] = portrait.processed;
      assert(
        Math.max(shot.width, shot.height) <= 400,
        `long edge ${Math.max(shot.width, shot.height)} exceeds the 400 cap`,
      );
      assert(shot.height >= shot.width, "the portrait frame should stay portrait");
    } finally {
      await rm(portraitIn, { recursive: true, force: true });
      await rm(portraitOut, { recursive: true, force: true });
    }

    // The requested JPEG quality has to reach the delivered file. Writing the
    // encoded buffer through a second `sharp()` re-encoded it at the library
    // default (80, no mozjpeg), so `--quality` was inert: quality 40 and
    // quality 95 produced files of the same size.
    const qualityIn = await mkdtemp(join(tmpdir(), "listing-lens-q-in-"));
    const lowOut = await mkdtemp(join(tmpdir(), "listing-lens-q-low-"));
    const highOut = await mkdtemp(join(tmpdir(), "listing-lens-q-high-"));
    try {
      // A gradient, so quality actually changes the encoded size — a flat
      // colour compresses identically at any setting and would pass vacuously.
      const noise = Buffer.alloc(600 * 600 * 3);
      for (let i = 0; i < noise.length; i += 1) {
        noise[i] = (i * 2654435761) % 256;
      }
      await sharp(noise, { raw: { width: 600, height: 600, channels: 3 } })
        .jpeg({ quality: 100 })
        .toFile(join(qualityIn, "IMG_0200.jpg"));

      const low = await batchEnhance(qualityIn, lowOut, {
        listingSlug: "quality probe",
        maxWidth: 600,
        quality: 40,
      });
      const high = await batchEnhance(qualityIn, highOut, {
        listingSlug: "quality probe",
        maxWidth: 600,
        quality: 95,
      });

      assert(
        low.processed[0].outputBytes < high.processed[0].outputBytes,
        `--quality does not reach the delivered file: quality 40 wrote ` +
          `${low.processed[0].outputBytes} bytes, quality 95 wrote ` +
          `${high.processed[0].outputBytes}`,
      );
    } finally {
      await rm(qualityIn, { recursive: true, force: true });
      await rm(lowOut, { recursive: true, force: true });
      await rm(highOut, { recursive: true, force: true });
    }

    assert(expectedShotCount() > 0, "capture checklist should define at least one shot");
    const shortCoverage = checkCoverage(1);
    assert(!shortCoverage.ok, "coverage check should fail when actual < expected");
    const fullCoverage = checkCoverage(expectedShotCount());
    assert(fullCoverage.ok, "coverage check should pass when actual === expected");

    console.log("enhance.test.ts: all assertions passed");
  } finally {
    await rm(inDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
