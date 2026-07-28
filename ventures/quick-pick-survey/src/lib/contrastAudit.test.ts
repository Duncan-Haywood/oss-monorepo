import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { classLists, colours } from "./classAudit";
import { AA_LARGE, AA_NORMAL, contrastRatio, parsePalette, resolveToken, type Rgb } from "./contrast";

/**
 * Every piece of text in the app, against the background it sits on, at the
 * WCAG AA floor.
 *
 * This is the same shape of check as `routeInventory` and `screenInventory`: a
 * property that some elements have and others do not, made to show up as a
 * failing row rather than as something you would have to already suspect.
 * Reading contrast by eye is what let thirty small grey labels sit at 2.5:1 —
 * each one looked fine next to the ones beside it, because they were all the
 * same grey.
 *
 * The failure this guards against is not abstract. This app is answered on a
 * phone, in the gaps of a day, which includes outdoors; 11px text at 2.5:1 is
 * text somebody stops reading. "Worth answering the next question" is a goal,
 * and an unreadable label explaining why a result is not shown yet costs
 * exactly the person who was about to give up.
 *
 * What this cannot check: whether a colour is used for meaning without a
 * second cue, whether focus rings are visible, or anything a screen reader
 * does. Those still need a human — see IMPROVEMENT-PLAN.md.
 */

const ROOT = process.cwd();
const PALETTE = parsePalette(readFileSync(join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8"));

/**
 * What the page is painted with when an element sets no background of its own.
 * `globals.css` sets body to #ffffff / #0a0a0a; #0a0a0a is `neutral-950`.
 */
const LIGHT_SURFACE: Rgb = { r: 255, g: 255, b: 255 };
const DARK_SURFACE: Rgb = { r: 10, g: 10, b: 10 };

/**
 * The only two reasons an element is allowed to sit below the floor, each
 * written down next to the thing it excuses. "It's fine, it's decorative" is
 * exactly the claim that goes stale when somebody moves the text out from
 * under the label it was redundant with, so an entry has to say why.
 *
 * A background from an ancestor also lands here: this check reads class lists,
 * not a rendered tree, so text on a container's colour would otherwise be
 * measured against the page surface and get the wrong answer.
 */
const EXEMPT: { match: string; because: string }[] = [
  {
    match: "text-amber-500/85 dark:text-amber-400/75",
    because:
      "CategoryIcon: aria-hidden decorative art, always rendered beside the item's own " +
      "text label. WCAG 1.4.11 exempts a graphic that carries no information the text " +
      "does not. Darkening it would repaint every card to fix nothing.",
  },
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

      // A colour with no `dark:` counterpart applies in both schemes, so each
      // scheme is checked with whatever would actually render in it.
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
    // A scanner that silently stops matching would otherwise pass this file
    // with flying colours while checking nothing.
    expect(result.checked).toBeGreaterThan(200);
  });

  it("has no exemption for something that no longer exists", () => {
    // An exemption that matches nothing is an excuse outliving the element it
    // excused, and the next colour that happens to match the string inherits
    // a reason that was never about it.
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
