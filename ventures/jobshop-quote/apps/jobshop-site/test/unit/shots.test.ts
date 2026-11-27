// The app screenshots (public/shots/, captured by apps/jobshop-quote `pnpm stills`): every committed
// still is shown, at its real size, with alt text, and the copy says the data is made up.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "@site/build";
import { LAUNCH } from "@site/config";
import { SHOTS } from "@site/pages";
import { describe, expect, it } from "vitest";

const SHOTS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "shots");
const files = buildSite({ siteUrl: "https://example.test", basePath: "", launch: LAUNCH });
const html = [...files].filter(([f]) => f.endsWith(".html")).map(([, c]) => c as string);

/** A VP8X WebP header stores canvas width-1 and height-1 as 24-bit little-endian at 24 and 27. */
function webpSize(name: string): [number, number] {
  const b = readFileSync(join(SHOTS_DIR, name));
  expect(b.subarray(12, 16).toString("latin1"), name).toBe("VP8X");
  return [b.readUIntLE(24, 3) + 1, b.readUIntLE(27, 3) + 1];
}

describe("app screenshots", () => {
  it("lists exactly the committed stills", () => {
    expect(
      Object.values(SHOTS)
        .map((s) => s.file)
        .sort(),
    ).toEqual(readdirSync(SHOTS_DIR).sort());
  });

  it.each(Object.values(SHOTS).map((s) => [s.file, s] as const))(
    "%s is shown at its real size, lazily, with alt text",
    (file, s) => {
      const [w, h] = webpSize(file);
      // The phone still is captured at 2x; width and height give its CSS size.
      const scale = w / s.width;
      expect([1, 2], `${file} is ${w}x${h}, SHOTS says ${s.width}x${s.height}`).toContain(scale);
      expect(h / scale, file).toBe(s.height);
      const tags = html.flatMap(
        (p) => p.match(new RegExp(`<img src="/shots/${file}"[^>]*>`, "g")) ?? [],
      );
      expect(tags.length, `${file} is on no page`).toBeGreaterThan(0);
      for (const t of tags) {
        expect(t).toContain(`width="${s.width}" height="${s.height}"`);
        expect(t).toContain('loading="lazy"');
        expect(t).toMatch(/alt="[^"]{80,}"/);
      }
    },
  );

  it("says the shop and part are made up, on the home page", () => {
    expect(files.get("index.html")).toContain("The shop, customer and part are made up");
  });
});
