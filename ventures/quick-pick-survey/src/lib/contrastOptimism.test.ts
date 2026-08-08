import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { classLists, colours, type ClassList } from "./classAudit";
import { AA_LARGE, AA_NORMAL, contrastRatio, parsePalette, resolveToken, type Rgb } from "./contrast";

/**
 * The other direction an invisible ancestor can move the number.
 *
 * `contrastAudit.test.ts` handles the case where a container makes text *more*
 * readable than the page surface suggests: dark text on a dark page reads as a
 * failure until `ON_ANCESTOR_BACKGROUND` supplies the light panel it actually
 * sits on. Every one of its annotations is checked to be load-bearing, meaning
 * removing it turns the element red.
 *
 * That contract only ever admits annotations that *raise* a ratio, so the
 * opposite case has no home: a container that makes text **less** readable than
 * the page surface suggests. There the audit does not report a failure it
 * should not — it reports a pass it should not, which is worse, because a false
 * pass is silent.
 *
 * Five elements were in exactly that state. `text-amber-800/80` at 12px inside
 * a `bg-amber-50` panel measures 4.578:1 against the `#ffffff` page surface and
 * passes; against the amber-50 the user actually sees it is **4.458:1**, under
 * the 4.5 floor. The fifth, inside `bg-amber-50/50`, came to **4.499:1** — a
 * thousandth under, and passing every check in the venture. Dropping the `/80`
 * alpha takes all five to 6.836:1, which is the fix that shipped with this
 * file; the dark scheme was never affected (6.7–8.7:1) and is unchanged.
 *
 * So this list records the containers that make things worse, and each entry is
 * held to the floor against the surface it names. The anti-vacuity predicate is
 * the mirror of the one next door: an entry must be **stricter** than the page
 * surface it replaces. An entry that is not stricter is either misfiled or
 * measuring nothing, and it fails rather than sitting here looking diligent.
 */

type Scheme = "light" | "dark";

type OptimisticSurface = {
  id: string;
  file: string;
  line: number;
  scheme: Scheme;
  /** The text colour token this entry describes, in that scheme. */
  text: string;
  /** Ancestor surfaces, outermost first, each composited over the previous. */
  background: string[];
  owner: string;
  issue: string;
  /** ISO date. Capped below, as in contrastAudit.test.ts. */
  expires: string;
};

const MAX_EXPIRY_DAYS = 180;
const OWNER = "duncan";
const ISSUE = "docs/QUALITY-ENGINEERING.md#accessibility";
const EXPIRES = "2027-01-31";

const ON_LIGHTER_ANCESTOR: OptimisticSurface[] = [
  // "What we learned" callouts: `bg-amber-50` panels whose amber label the page
  // surface flatters. Fixed from `text-amber-800/80` to `text-amber-800`.
  { id: "OPTIMISM-001", file: "src/components/InsightsView.tsx", line: 150, scheme: "light", text: "amber-800", background: ["amber-50"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "OPTIMISM-002", file: "src/components/CoupleView.tsx", line: 377, scheme: "light", text: "amber-800", background: ["amber-50"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "OPTIMISM-003", file: "src/components/CoupleView.tsx", line: 631, scheme: "light", text: "amber-800", background: ["amber-50"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "OPTIMISM-004", file: "src/components/CoupleView.tsx", line: 844, scheme: "light", text: "amber-800", background: ["amber-50"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "OPTIMISM-005", file: "src/components/CoupleView.tsx", line: 1007, scheme: "light", text: "amber-800", background: ["amber-50/50"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
];

const ROOT = process.cwd();
const PALETTE = parsePalette(readFileSync(join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8"));
const LIGHT_SURFACE: Rgb = { r: 255, g: 255, b: 255 };
const DARK_SURFACE: Rgb = { r: 10, g: 10, b: 10 };

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

const SOURCES = (() => {
  const source = new Map<string, string>();
  const lists: ClassList[] = [];
  for (const file of [...sourceFiles(join(ROOT, "src")), join(ROOT, "developmentprocess.tsx")]) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    source.set(rel, text);
    lists.push(...classLists(rel, text));
  }
  return { source, lists };
})();

const ALPHA = /^\d{1,3}$/;
const PAINTS_BACKGROUND = ["bg", "from", "via", "to"] as const;

/** Whole-token match, never a substring: `bg-amber-5` must not match `bg-amber-50`. */
function paintsBackground(line: string, name: string): boolean {
  for (const token of line.split(/[\s"'`{}()[\],;]+/)) {
    const slash = token.indexOf("/");
    if (slash !== -1 && !ALPHA.test(token.slice(slash + 1))) continue;
    const bare = slash === -1 ? token : token.slice(0, slash);
    if (PAINTS_BACKGROUND.some((prefix) => bare === `${prefix}-${name}`)) return true;
  }
  return false;
}

function ancestorLine(source: string, token: string, before: number): number | null {
  const name = token.split("/")[0];
  const lines = source.split("\n");
  for (let i = Math.min(before, lines.length) - 1; i >= 0; i -= 1) {
    if (paintsBackground(lines[i], name)) return i + 1;
  }
  return null;
}

function surfaceOf(entry: OptimisticSurface, page: Rgb): Rgb | null {
  let acc = page;
  for (const token of entry.background) {
    const next = resolveToken(token, PALETTE, acc);
    if (!next) return null;
    acc = next;
  }
  return acc;
}

/** The element this entry anchors to, and the floor its size demands. */
function elementOf(entry: OptimisticSurface): { list: ClassList; needed: number } | null {
  const list = SOURCES.lists.find((l) => {
    if (l.file !== entry.file || l.line !== entry.line) return false;
    const c = colours(l.classes);
    return (entry.scheme === "light" ? c.text : (c.darkText ?? c.text)) === entry.text;
  });
  if (!list) return null;
  return { list, needed: colours(list.classes).large ? AA_LARGE : AA_NORMAL };
}

/** Contrast of this entry's text against a given surface, own background composited. */
function ratioAgainst(entry: OptimisticSurface, surface: Rgb): number | null {
  const found = elementOf(entry);
  if (!found) return null;
  const c = colours(found.list.classes);
  const own = entry.scheme === "light" ? c.bg : (c.darkBg ?? c.bg);
  const bg = own ? resolveToken(own, PALETTE, surface) : surface;
  if (!bg) return null;
  const text = resolveToken(entry.text, PALETTE, bg);
  if (!text) return null;
  return contrastRatio(text, bg);
}

describe("surfaces the audit is optimistic about", () => {
  it("anchors every entry to an element of that colour", () => {
    const misanchored = ON_LIGHTER_ANCESTOR.filter((e) => elementOf(e) === null).map(
      (e) => `${e.id} ${e.file}:${e.line} ${e.scheme} ${e.text}`,
    );
    expect(misanchored, "entries not resolving to an element of that colour").toEqual([]);
  });

  it("names an ancestor the source really paints, at or above the element", () => {
    const unproven: string[] = [];
    for (const e of ON_LIGHTER_ANCESTOR) {
      const source = SOURCES.source.get(e.file);
      if (!source) {
        unproven.push(`${e.id} unknown file ${e.file}`);
        continue;
      }
      let ceiling = e.line;
      for (const token of [...e.background].reverse()) {
        const at = ancestorLine(source, token, ceiling);
        if (at === null) {
          unproven.push(`${e.id} nothing paints ${token} at or above ${e.file}:${ceiling}`);
          break;
        }
        ceiling = at;
      }
    }
    expect(unproven, "ancestor backgrounds not found in the source").toEqual([]);
  });

  it("is stricter than the page surface it replaces", () => {
    // The anti-vacuity predicate, and the mirror of the load-bearing test in
    // contrastAudit.test.ts. An entry here exists because the real container
    // LOWERS the ratio; if it does not, it is either misfiled or inert, and
    // either way it must not sit here implying a check that is not happening.
    const notStricter: string[] = [];

    for (const e of ON_LIGHTER_ANCESTOR) {
      const page = e.scheme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
      const surface = surfaceOf(e, page);
      if (surface === null) continue; // reported below

      const real = ratioAgainst(e, surface);
      const optimistic = ratioAgainst(e, page);
      if (real === null || optimistic === null) continue;

      if (real >= optimistic - 1e-9) {
        notStricter.push(
          `${e.id} measures ${real.toFixed(3)}:1 on ${e.background.join(" over ")}, no worse than ${optimistic.toFixed(3)}:1 on the page surface`,
        );
      }
    }

    expect(notStricter, "entries that do not tighten the measurement").toEqual([]);
  });

  it("resolves every ancestor colour against the palette", () => {
    const bad = ON_LIGHTER_ANCESTOR.filter((e) => {
      const page = e.scheme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
      return surfaceOf(e, page) === null;
    }).map((e) => `${e.id} ${e.background.join(" over ")}`);
    expect(bad, "ancestor tokens absent from the palette").toEqual([]);
  });

  it("meets WCAG AA against the surface the user actually sees", () => {
    const failures: string[] = [];

    for (const e of ON_LIGHTER_ANCESTOR) {
      const page = e.scheme === "light" ? LIGHT_SURFACE : DARK_SURFACE;
      const surface = surfaceOf(e, page);
      const found = elementOf(e);
      if (surface === null || found === null) continue; // reported above

      const ratio = ratioAgainst(e, surface);
      if (ratio === null) {
        failures.push(`${e.id} ${e.file}:${e.line} could not be measured`);
        continue;
      }
      if (ratio < found.needed) {
        failures.push(
          `${e.id} ${e.file}:${e.line} (${e.scheme}) ${e.text} on ${e.background.join(" over ")}: ${ratio.toFixed(3)}:1, needs ${found.needed}:1`,
        );
      }
    }

    expect(failures, "text below the WCAG AA floor against its real container").toEqual([]);
  });

  it("carries a unique id, an owner, an issue and an unexpired review date", () => {
    const ids = ON_LIGHTER_ANCESTOR.map((e) => e.id);
    expect(new Set(ids).size, "duplicate entry ids").toBe(ids.length);

    const today = new Date();
    const cap = new Date(today.getTime() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const malformed: string[] = [];

    for (const e of ON_LIGHTER_ANCESTOR) {
      if (!/^OPTIMISM-\d{3}$/.test(e.id)) malformed.push(`${e.id} malformed id`);
      if (!/^[a-z][a-z0-9-]*$/.test(e.owner)) malformed.push(`${e.id} missing owner`);
      if (!/^docs\/[\w.-]+\.md#[\w-]+$/.test(e.issue)) malformed.push(`${e.id} missing issue`);

      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expires)) {
        malformed.push(`${e.id} malformed expiry`);
        continue;
      }
      const expires = new Date(`${e.expires}T00:00:00Z`);
      if (Number.isNaN(expires.getTime())) malformed.push(`${e.id} unparseable expiry`);
      else if (expires < today) malformed.push(`${e.id} expired on ${e.expires}`);
      else if (expires > cap) malformed.push(`${e.id} expires more than ${MAX_EXPIRY_DAYS} days out`);
    }

    expect(malformed, "entries missing an owner, issue or valid expiry").toEqual([]);
  });
});
