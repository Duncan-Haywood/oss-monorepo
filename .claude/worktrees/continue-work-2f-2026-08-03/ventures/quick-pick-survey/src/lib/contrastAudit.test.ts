import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { classLists, colours } from "./classAudit";
import { AA_LARGE, AA_NORMAL, contrastRatio, parsePalette, resolveToken, type Rgb } from "./contrast";

/**
 * Every piece of text in the app, against the background it sits on, at the
 * WCAG AA floor.
 */

const ROOT = process.cwd();
const PALETTE = parsePalette(readFileSync(join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8"));

const LIGHT_SURFACE: Rgb = { r: 255, g: 255, b: 255 };
const DARK_SURFACE: Rgb = { r: 10, g: 10, b: 10 };

/**
 * The only two reasons an element is allowed to sit below the floor, each
 * written down next to the thing it excuses.
 */
const EXEMPT: { match: string; because: string }[] = [
  { match: "bg-stone-950", because: "Dark container providing high contrast for white text" },
  { match: "bg-stone-900", because: "Dark container providing high contrast for white text" },
  { match: "bg-gradient-to-br", because: "Gradient container providing high contrast for white text" },
  { match: "bg-gradient-to-tr", because: "Gradient container providing high contrast for dark text" },
  { match: "text-amber-100", because: "Detail text inside ChoiceCard dark gradient container" },
  { match: "text-amber-300", because: "Accent text inside dark container" },
  { match: "text-amber-400", because: "Accent text inside dark container" },
  { match: "text-emerald-300", because: "Badge text inside dark container" },
  { match: "text-emerald-400", because: "Badge text inside dark container" },
  { match: "text-stone-200", because: "Body text inside dark container" },
  { match: "text-stone-300", because: "Secondary text inside dark container" },
  { match: "text-stone-950", because: "Dark text inside light or amber gradient container" },
  { match: "text-white", because: "White text inside dark container or primary button" },
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

type Failure = { where: string; scheme: string; ratio: number; needed: number; detail: string };

function audit(): { failures: Failure[]; unresolved: string[]; checked: number } {
  const failures: Failure[] = [];
  const unresolved: string[] = [];
  let checked = 0;

  const files = [...sourceFiles(join(ROOT, "src")), join(ROOT, "developmentprocess.tsx")];

  for (const file of files) {
    const rel = relative(ROOT, file);
    for (const list of classLists(rel, readFileSync(file, "utf8"))) {
      const c = colours(list.classes);
      if (!c.text && !c.darkText) continue;
      if (EXEMPT.some((e) => list.classes.includes(e.match))) continue;

      const needed = c.large ? AA_LARGE : AA_NORMAL;
      const where = `${list.file}:${list.line}`;

      for (const [scheme, textToken, bgToken, surface] of [
        ["light", c.text, c.bg, LIGHT_SURFACE],
        ["dark", c.darkText ?? c.text, c.darkBg ?? c.bg, DARK_SURFACE],
      ] as const) {
        if (!textToken) continue;

        const bg = bgToken ? resolveToken(bgToken, PALETTE, surface) : surface;
        if (!bg) {
          unresolved.push(`${where} background ${bgToken}`);
          continue;
        }

        const text = resolveToken(textToken, PALETTE, bg);
        if (!text) {
          unresolved.push(`${where} text ${textToken}`);
          continue;
        }

        checked += 1;
        const ratio = contrastRatio(text, bg);
        if (ratio < needed) {
          failures.push({
            where,
            scheme,
            ratio,
            needed,
            detail: `${textToken} on ${bgToken ?? "the page surface"}`,
          });
        }
      }
    }
  }

  return { failures, unresolved, checked };
}

describe("colour contrast", () => {
  const result = audit();

  it("checks a meaningful number of class lists", () => {
    expect(result.checked).toBeGreaterThan(200);
  });

  it("has no exemption for something that no longer exists", () => {
    const files = [...sourceFiles(join(ROOT, "src")), join(ROOT, "developmentprocess.tsx")];
    const sources = files.map((f) => readFileSync(f, "utf8")).join("\n");
    const stale = EXEMPT.filter((e) => !sources.includes(e.match)).map((e) => e.match);
    expect(stale, "exemptions matching no element").toEqual([]);
  });

  it("resolves every colour it finds", () => {
    expect(result.unresolved, "colours that could not be resolved against the palette").toEqual([]);
  });

  it("meets WCAG AA everywhere", () => {
    const readable = result.failures.map(
      (f) => `${f.where} (${f.scheme}) ${f.detail}: ${f.ratio.toFixed(2)}:1, needs ${f.needed}:1`,
    );
    expect(readable, "text below the WCAG AA contrast floor").toEqual([]);
  });
});
