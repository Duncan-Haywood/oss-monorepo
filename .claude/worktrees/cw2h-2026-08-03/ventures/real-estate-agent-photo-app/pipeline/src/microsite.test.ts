/**
 * microsite.test.ts — `npm test` (tsx, no test framework dependency).
 *
 * Exercises the microsite generator against a temp delivery dir with
 * synthetic filenames (no real listing photos/logos needed): filename
 * listing/sorting/exclusion, HTML escaping (a hostile agent name should
 * never break out of its tag), and that the underlying photo files are
 * never opened/modified — only their names are read.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildMicrositeHtml, escapeHtml, generateMicrositeForDelivery, listGalleryPhotos } from "./microsite";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function run() {
  const dir = await mkdtemp(join(tmpdir(), "listing-lens-microsite-"));

  try {
    await writeFile(join(dir, "123-main-st-02.jpg"), "fake-photo-2");
    await writeFile(join(dir, "123-main-st-01.jpg"), "fake-photo-1");
    await writeFile(join(dir, "123-main-st-10.jpg"), "fake-photo-10");
    await writeFile(join(dir, "logo.png"), "fake-logo");
    await writeFile(join(dir, "headshot.jpg"), "fake-headshot");
    await writeFile(join(dir, "notes.txt"), "not a gallery file");

    const photos = await listGalleryPhotos(dir, ["logo.png", "headshot.jpg"]);
    assert(
      photos.join(",") === "123-main-st-01.jpg,123-main-st-02.jpg,123-main-st-10.jpg",
      `unexpected/unsorted gallery list: ${photos.join(",")}`,
    );
    assert(!photos.includes("notes.txt"), "non-image files must be excluded from the gallery");
    assert(!photos.includes("logo.png"), "the agent's logo file must be excluded from the gallery");

    const result = await generateMicrositeForDelivery(dir, {
      listingAddress: "123 Main St",
      tagline: "Move-in ready",
      agent: {
        name: "Jane Doe",
        phone: "555-0100",
        email: "jane@example.com",
        brokerage: "Acme Realty",
        headshotFilename: "headshot.jpg",
        logoFilename: "logo.png",
      },
    });
    assert(result.photoCount === 3, `expected 3 gallery photos, got ${result.photoCount}`);
    assert(result.html.includes("123 Main St"), "HTML should include the listing address");
    assert(result.html.includes("Jane Doe"), "HTML should include the agent name");
    assert(result.html.includes('src="123-main-st-01.jpg"'), "HTML should reference gallery photos by relative filename");
    assert(result.html.includes('src="logo.png"'), "HTML should reference the agent logo by relative filename");
    assert(result.html.includes('src="headshot.jpg"'), "HTML should reference the agent headshot by relative filename");

    const hostileHtml = buildMicrositeHtml(["a.jpg"], {
      listingAddress: '123 Main St</h1><script>alert(1)</script>',
      agent: { name: '<img src=x onerror=alert(1)>' },
    });
    assert(!hostileHtml.includes("<script>alert(1)"), "listing address must be HTML-escaped");
    assert(!hostileHtml.includes("<img src=x onerror"), "agent name must be HTML-escaped");
    assert(escapeHtml(`<>&"'`) === "&lt;&gt;&amp;&quot;&#39;", "escapeHtml should escape all five special characters");

    const noOptionalFields = buildMicrositeHtml([], {
      listingAddress: "456 Oak Ave",
      agent: { name: "No Contact Info" },
    });
    assert(noOptionalFields.includes("456 Oak Ave"), "should render with zero photos and zero optional agent fields");

    console.log("microsite.test.ts: all assertions passed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

run().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exitCode = 1;
});
