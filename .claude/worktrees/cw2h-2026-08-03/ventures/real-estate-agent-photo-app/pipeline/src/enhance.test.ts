/**
 * enhance.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Generates synthetic source images (no real listing photos needed) and
 * asserts the batch pipeline actually produces resized, re-encoded,
 * sequentially-named JPEGs and reports coverage correctly. Exits non-zero
 * on failure so it's usable as a CI/pre-push gate.
 */

import { mkdtemp, readdir, rm } from "node:fs/promises";
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
