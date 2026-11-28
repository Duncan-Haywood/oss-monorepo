// The site follows the visitor's light or dark setting (public/styles.css): the dark block redefines the
// same tokens, and every text pair the stylesheet uses keeps WCAG AA contrast in both schemes.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "@site/build";
import { LAUNCH } from "@site/config";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "styles.css"),
  "utf8",
);

/** The custom properties declared in the first `:root { ... }` after `from`. */
function tokens(from: number): Map<string, string> {
  const start = CSS.indexOf(":root {", from);
  const body = CSS.slice(start, CSS.indexOf("}", start));
  return new Map(
    [...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]),
  );
}

const light = tokens(0);
const darkAt = CSS.indexOf("@media (prefers-color-scheme: dark)");
const dark = new Map([...light, ...tokens(darkAt)]);

function resolve(scheme: Map<string, string>, name: string): string {
  let v = scheme.get(name);
  for (let i = 0; v?.startsWith("var("); i++) {
    if (i > 5) throw new Error(`var() loop at ${name}`);
    v = scheme.get(v.slice(4, -1).trim());
  }
  if (!v || !/^#[0-9a-f]{6}$/i.test(v)) throw new Error(`${name} is not a #rrggbb colour: ${v}`);
  return v;
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x = 0, y = 0] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// [text, background, minimum]: the pairs styles.css actually sets.
const PAIRS: readonly [string, string, number][] = [
  ["--n-700", "--n-0", 4.5], // body
  ["--n-900", "--n-0", 4.5], // headings
  ["--n-600", "--n-0", 4.5], // lead, captions
  ["--n-500", "--n-0", 4.5], // fineprint
  ["--n-500", "--n-50", 4.5], // fineprint in the footer and muted bands
  ["--n-600", "--n-50", 4.5], // footer links
  ["--n-600", "--n-100", 4.5], // muted pill
  ["--n-900", "--brand-50", 4.5], // last compare row
  ["--brand-700", "--n-0", 4.5], // links
  ["--brand-700", "--n-50", 4.5],
  ["--brand-800", "--brand-50", 4.5], // pills, tags
  ["--brand-800", "--n-0", 4.5], // eyebrow
  ["--accent-700", "--n-0", 4.5], // step numbers
  ["--warn-800", "--warn-50", 4.5], // status strip, warn pills
  ["--danger-700", "--danger-50", 4.5], // form alert
  ["--danger-700", "--n-0", 4.5], // field errors
  ["--on-brand", "--btn-bg", 4.5], // primary button, step dots
  ["--on-brand", "--btn-bg-hover", 4.5],
  ["--cta-fg", "--cta-bg", 4.5],
  ["--on-brand", "--cta-bg", 4.5],
  ["--cta-btn-fg", "--cta-btn-bg", 4.5],
  ["--cta-btn-fg", "--cta-btn-hover", 4.5],
  ["--brand-600", "--n-0", 3], // icons, logo, focus ring on cards (non-text, 1.4.11)
  ["--accent-500", "--n-0", 3], // focus outline
];

describe("dark mode", () => {
  it("declares both schemes and a dark token block", () => {
    expect(CSS).toMatch(/color-scheme:\s*light dark/);
    expect(darkAt).toBeGreaterThan(0);
    expect(tokens(darkAt).size).toBeGreaterThan(20);
  });

  for (const [name, scheme] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it.each(PAIRS)(`${name}: %s on %s is at least %d:1`, (fg, bg, min) => {
      expect(contrast(resolve(scheme, fg), resolve(scheme, bg))).toBeGreaterThanOrEqual(min);
    });
  }

  it("no rule outside :root paints with a raw colour, so the dark block covers everything", () => {
    const rules = CSS.replace(/:root\s*\{[^}]*\}/g, "");
    expect(rules.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
  });

  it("sets a theme-color for each scheme", () => {
    const files = buildSite({ siteUrl: "https://example.test", basePath: "", launch: LAUNCH });
    const home = files.get("index.html") as string;
    expect(home).toContain(
      'name="theme-color" content="#226955" media="(prefers-color-scheme: light)"',
    );
    expect(home).toContain(
      'name="theme-color" content="#161412" media="(prefers-color-scheme: dark)"',
    );
  });
});
