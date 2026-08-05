import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";
import { classLists, colours, type ClassList } from "./classAudit";
import {
  AA_LARGE,
  AA_NORMAL,
  contrastRatio,
  parsePalette,
  resolveToken,
  type Rgb,
} from "./contrast";

/**
 * Every piece of text in the app, against the background it sits on, at the
 * WCAG AA floor.
 *
 * **Nothing here is exempt.** This audit used to carry a list of bare class
 * tokens — `text-white`, `text-amber-300` — matched with `String.includes`
 * against a whole class list, and any element carrying one was dropped from the
 * audit entirely, in both colour schemes. Thirteen such tokens voided the floor
 * for 185 of the 537 text-bearing class lists in this app, `text-white` alone
 * for 29 across 7 files, and the reason written beside each was prose that
 * nothing read. An exemption written that way does not excuse the element
 * someone actually looked at; it excuses every element that ever uses the
 * commonest colour in the venture, including ones written later by someone who
 * never saw the reason. It also excused three elements that really are below
 * the floor, which is how they survived.
 *
 * What those entries were recording is the limitation named in `classAudit.ts`:
 * a background set on an *ancestor* is invisible to a check that reads one
 * class list at a time, so text inside a dark container gets measured against
 * the page surface and reads as unreadable when it is fine. That is a missing
 * input, not a reason to stop checking. So instead of skipping the element,
 * `ON_ANCESTOR_BACKGROUND` supplies the surface the element actually sits on
 * and the contrast is computed and enforced against it exactly as everywhere
 * else. The floor never moves.
 */

const ROOT = process.cwd();
const PALETTE = parsePalette(readFileSync(join(ROOT, "node_modules/tailwindcss/theme.css"), "utf8"));

const LIGHT_SURFACE: Rgb = { r: 255, g: 255, b: 255 };
const DARK_SURFACE: Rgb = { r: 10, g: 10, b: 10 };

type Scheme = "light" | "dark";

/**
 * One element whose background comes from an ancestor rather than from itself.
 *
 * Every field is checked. `file`/`line`/`scheme`/`text` anchor the entry to a
 * single element carrying a single colour — not to a class token, so it cannot
 * drift onto anything else, and it goes stale loudly the moment that element
 * moves or changes colour. `background` is the claim being made about the DOM,
 * and it is verified against the source rather than believed: each token must
 * resolve in the palette and must be painted by a line at or above this one.
 * The entry must also be load-bearing — an annotation whose element passes
 * without it gets deleted, not kept "just in case".
 */
type AncestorBackground = {
  id: string;
  file: string;
  line: number;
  scheme: Scheme;
  /** The text colour token this entry describes, in that scheme. */
  text: string;
  /**
   * The ancestor surfaces this element sits on, outermost first, each
   * composited over the previous and the first over the page surface. A chain
   * rather than a single colour because containers nest, and a translucent
   * inner panel over a dark outer one is not the colour either of them names.
   *
   * For a gradient container this names the stop with the *worst* contrast, so
   * the number enforced is the floor across the whole sweep rather than the
   * flattering end of it.
   */
  background: string[];
  owner: string;
  issue: string;
  /** ISO date. Capped below, so this list cannot become permanent silence. */
  expires: string;
};

/** Same cap as `platform/image-tag-exceptions.yaml`. */
const MAX_EXPIRY_DAYS = 180;

const OWNER = "duncan";
const ISSUE = "docs/QUALITY-ENGINEERING.md#accessibility";
const EXPIRES = "2027-01-31";

const ON_ANCESTOR_BACKGROUND: AncestorBackground[] = [
  // Header wordmark chip: `bg-gradient-to-tr from-amber-500 to-orange-400` on
  // the element itself, which the class reader cannot resolve to a colour.
  { id: "CONTRAST-001", file: "src/app/page.tsx", line: 38, scheme: "dark", text: "stone-950", background: ["amber-500"], owner: OWNER, issue: ISSUE, expires: EXPIRES },

  // "Designed for Couples" card: `bg-gradient-to-br from-amber-500 via-orange-500
  // to-amber-600` at line 234. amber-600 is the darkest stop.
  { id: "CONTRAST-002", file: "src/app/page.tsx", line: 234, scheme: "dark", text: "stone-950", background: ["amber-600"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-003", file: "src/app/page.tsx", line: 237, scheme: "dark", text: "stone-950", background: ["amber-600"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-004", file: "src/app/page.tsx", line: 243, scheme: "dark", text: "stone-950", background: ["amber-600"], owner: OWNER, issue: ISSUE, expires: EXPIRES },

  // Couples overlap preview box: `bg-stone-950` at line 261, with an inner
  // `bg-stone-900/90` conversation-starter panel at line 305.
  { id: "CONTRAST-005", file: "src/app/page.tsx", line: 263, scheme: "light", text: "amber-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-006", file: "src/app/page.tsx", line: 266, scheme: "light", text: "emerald-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-007", file: "src/app/page.tsx", line: 277, scheme: "light", text: "amber-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-008", file: "src/app/page.tsx", line: 287, scheme: "light", text: "amber-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-009", file: "src/app/page.tsx", line: 297, scheme: "light", text: "amber-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-010", file: "src/app/page.tsx", line: 306, scheme: "light", text: "amber-300", background: ["stone-950", "stone-900/90"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-011", file: "src/app/page.tsx", line: 307, scheme: "light", text: "stone-200", background: ["stone-950", "stone-900/90"], owner: OWNER, issue: ISSUE, expires: EXPIRES },

  // Pricing "Together" tier: `bg-stone-900` at line 361.
  { id: "CONTRAST-012", file: "src/app/page.tsx", line: 367, scheme: "light", text: "amber-300", background: ["stone-900"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-013", file: "src/app/page.tsx", line: 370, scheme: "light", text: "white", background: ["stone-900"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-014", file: "src/app/page.tsx", line: 371, scheme: "light", text: "amber-400", background: ["stone-900"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-015", file: "src/app/page.tsx", line: 372, scheme: "light", text: "stone-300", background: ["stone-900"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-016", file: "src/app/page.tsx", line: 374, scheme: "light", text: "stone-300", background: ["stone-900"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-017", file: "src/app/page.tsx", line: 379, scheme: "light", text: "stone-200", background: ["stone-900"], owner: OWNER, issue: ISSUE, expires: EXPIRES },

  // Confidence bell curve panel: `bg-stone-950` at line 108.
  { id: "CONTRAST-018", file: "src/components/marketing/ConvergenceVisualizer.tsx", line: 109, scheme: "light", text: "stone-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
  { id: "CONTRAST-019", file: "src/components/marketing/ConvergenceVisualizer.tsx", line: 141, scheme: "light", text: "amber-300", background: ["stone-950"], owner: OWNER, issue: ISSUE, expires: EXPIRES },
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

/** Read every source file once; the audit runs many times over the result. */
function readSources(): { source: Map<string, string>; lists: ClassList[] } {
  const source = new Map<string, string>();
  const lists: ClassList[] = [];
  for (const file of [...sourceFiles(join(ROOT, "src")), join(ROOT, "developmentprocess.tsx")]) {
    const rel = relative(ROOT, file);
    const text = readFileSync(file, "utf8");
    source.set(rel, text);
    lists.push(...classLists(rel, text));
  }
  return { source, lists };
}

const SOURCES = readSources();

/** A background token's base name, without any `/40` alpha suffix. */
function baseName(token: string): string {
  return token.split("/")[0];
}

/** The class prefixes that paint a background: a fill, or a gradient stop. */
const PAINTS_BACKGROUND = ["bg", "from", "via", "to"] as const;

const ALPHA = /^\d{1,3}$/;

/**
 * Does this line carry a class that paints `name` as a background?
 *
 * Whole-token comparison, not a substring search, for the same reason the
 * annotations are anchored rather than matched: `bg-stone-95` must not be
 * satisfied by `bg-stone-950`. Built from string equality rather than an
 * interpolated `RegExp` so that no palette token can become pattern syntax.
 */
function paintsBackground(line: string, name: string): boolean {
  for (const token of line.split(/[\s"'`{}()[\],;]+/)) {
    const slash = token.indexOf("/");
    if (slash !== -1 && !ALPHA.test(token.slice(slash + 1))) continue;
    const bare = slash === -1 ? token : token.slice(0, slash);
    if (PAINTS_BACKGROUND.some((prefix) => bare === `${prefix}-${name}`)) return true;
  }
  return false;
}

/**
 * The last line at or above `before` that paints `token` as a background —
 * either `bg-<token>` or a gradient stop. An ancestor has to open before its
 * child does, so this is the structural half of the claim an entry makes, and
 * the part that used to be unverifiable prose.
 */
function ancestorLine(source: string, token: string, before: number): number | null {
  const name = baseName(token);
  const lines = source.split("\n");
  for (let i = Math.min(before, lines.length) - 1; i >= 0; i -= 1) {
    if (paintsBackground(lines[i], name)) return i + 1;
  }
  return null;
}

/** Composite an entry's ancestor chain down onto the page surface. */
function ancestorSurface(entry: AncestorBackground, surface: Rgb): Rgb | null {
  let acc = surface;
  for (const token of entry.background) {
    const next = resolveToken(token, PALETTE, acc);
    if (!next) return null;
    acc = next;
  }
  return acc;
}

type Failure = { where: string; scheme: Scheme; ratio: number; needed: number; detail: string };

/**
 * The audit. `annotations` is a parameter so a test can take one away and see
 * whether it was holding anything up.
 */
function audit(annotations: AncestorBackground[]): {
  failures: Failure[];
  unresolved: string[];
  checked: number;
  used: Set<string>;
} {
  const failures: Failure[] = [];
  const unresolved: string[] = [];
  const used = new Set<string>();
  let checked = 0;

  for (const list of SOURCES.lists) {
    const c = colours(list.classes);
    if (!c.text && !c.darkText) continue;

    const needed = c.large ? AA_LARGE : AA_NORMAL;
    const where = `${list.file}:${list.line}`;

    for (const [scheme, textToken, bgToken, pageSurface] of [
      ["light", c.text, c.bg, LIGHT_SURFACE],
      ["dark", c.darkText ?? c.text, c.darkBg ?? c.bg, DARK_SURFACE],
    ] as const) {
      if (!textToken) continue;

      // An annotation replaces the page surface with the surface an ancestor
      // actually paints. It never removes the element from the audit.
      const entry = annotations.find(
        (e) =>
          e.file === list.file &&
          e.line === list.line &&
          e.scheme === scheme &&
          e.text === textToken,
      );

      let surface: Rgb = pageSurface;
      if (entry) {
        const resolved = ancestorSurface(entry, pageSurface);
        if (!resolved) {
          unresolved.push(`${where} ancestor background ${entry.background.join(" over ")}`);
          continue;
        }
        surface = resolved;
        used.add(entry.id);
      }

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
        const on = bgToken ?? (entry ? entry.background.join(" over ") : "the page surface");
        failures.push({ where, scheme, ratio, needed, detail: `${textToken} on ${on}` });
      }
    }
  }

  return { failures, unresolved, checked, used };
}

/** Every colour measurement the audit owes an answer for. */
function measurementsOwed(): number {
  let n = 0;
  for (const list of SOURCES.lists) {
    const c = colours(list.classes);
    if (!c.text && !c.darkText) continue;
    if (c.text) n += 1;
    if (c.darkText ?? c.text) n += 1;
  }
  return n;
}

describe("colour contrast", () => {
  const result = audit(ON_ANCESTOR_BACKGROUND);

  it("checks a meaningful number of class lists", () => {
    expect(result.checked).toBeGreaterThan(1000);
  });

  it("leaves no element out of the audit", () => {
    // The defect this replaces: a bare-token exemption removed the element from
    // the audit entirely, in both schemes. Every colour must now reach a floor
    // or be reported as unresolvable; there is no third outcome.
    expect(result.checked + result.unresolved.length, "colours that reached a floor").toBe(
      measurementsOwed(),
    );
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

describe("ancestor-background annotations", () => {
  const result = audit(ON_ANCESTOR_BACKGROUND);

  it("each names one element, never a class token", () => {
    const misanchored = ON_ANCESTOR_BACKGROUND.filter(
      (e) =>
        !SOURCES.lists.some((l) => {
          if (l.file !== e.file || l.line !== e.line) return false;
          const c = colours(l.classes);
          return (e.scheme === "light" ? c.text : (c.darkText ?? c.text)) === e.text;
        }),
    ).map((e) => `${e.id} ${e.file}:${e.line} ${e.scheme} ${e.text}`);

    expect(misanchored, "annotations not resolving to an element of that colour").toEqual([]);
  });

  it("names an ancestor the source really paints, at or above the element", () => {
    const unproven: string[] = [];

    for (const e of ON_ANCESTOR_BACKGROUND) {
      const source = SOURCES.source.get(e.file);
      if (!source) {
        unproven.push(`${e.id} unknown file ${e.file}`);
        continue;
      }
      // Innermost first, walking outwards: each ancestor must open at or above
      // the one it contains.
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

  it("resolves every ancestor colour against the palette", () => {
    const bad = ON_ANCESTOR_BACKGROUND.filter((e) => ancestorSurface(e, LIGHT_SURFACE) === null).map(
      (e) => `${e.id} ${e.background.join(" over ")}`,
    );
    expect(bad, "ancestor tokens absent from the palette").toEqual([]);
  });

  it("is load-bearing: removing any one of them turns that element red", () => {
    const inert: string[] = [];

    for (const e of ON_ANCESTOR_BACKGROUND) {
      const without = audit(ON_ANCESTOR_BACKGROUND.filter((x) => x.id !== e.id));
      const reported = without.failures.some(
        (f) => f.where === `${e.file}:${e.line}` && f.scheme === e.scheme,
      );
      if (!reported) inert.push(`${e.id} ${e.file}:${e.line} ${e.scheme}`);
    }

    expect(inert, "annotations that excuse nothing and should be deleted").toEqual([]);
  });

  it("is applied: the audit reaches every annotation", () => {
    const unreached = ON_ANCESTOR_BACKGROUND.filter((e) => !result.used.has(e.id)).map((e) => e.id);
    expect(unreached, "annotations the audit never applied").toEqual([]);
  });

  it("carries a unique id, an owner, an issue and an unexpired review date", () => {
    const ids = ON_ANCESTOR_BACKGROUND.map((e) => e.id);
    expect(new Set(ids).size, "duplicate annotation ids").toBe(ids.length);

    const today = new Date();
    const cap = new Date(today.getTime() + MAX_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const malformed: string[] = [];

    for (const e of ON_ANCESTOR_BACKGROUND) {
      if (!/^CONTRAST-\d{3}$/.test(e.id)) malformed.push(`${e.id} malformed id`);
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

    expect(malformed, "annotations missing an owner, issue or valid expiry").toEqual([]);
  });
});
