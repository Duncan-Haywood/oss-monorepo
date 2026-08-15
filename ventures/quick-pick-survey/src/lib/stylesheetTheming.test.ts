import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";

/**
 * One switch decides what "dark" means.
 *
 * `globals.css` declares `@variant dark (&:where(.dark, .dark *))`, so every
 * `dark:` utility in this app — every `dark:text-*`, every `dark:bg-*` — is
 * gated on the `.dark` class, which the blocking script in `layout.tsx` sets
 * from `localStorage.pairwise_theme`, consulting the OS preference only when
 * the user has stored none. `ProfileView` lets the user set it explicitly.
 *
 * `globals.css` also carried a `@media (prefers-color-scheme: dark)` block that
 * repointed `--background` and `--foreground` at the dark values. `body` paints
 * `background: var(--background)`, and that rule is unlayered, so it wins over
 * the `bg-neutral-50` utility on `<body>` — verified in a browser: the page
 * surface really is `--background`, not the utility.
 *
 * Those two mechanisms answered different questions, and for any user whose
 * stored choice contradicted their OS they gave opposite answers. Confirmed in
 * a real browser against the production build, with `pairwise_theme = "light"`
 * and the OS preferring dark: the root element carried no `dark` class, so
 * every `dark:` utility was inactive and text kept its light-scheme colour,
 * while `getComputedStyle(document.body).backgroundColor` was `rgb(10, 10, 10)`
 * — light-mode text on a near-black surface. The same happened with JavaScript
 * disabled, where `.dark` is never applied but the media query still fires.
 *
 * `contrastAudit.test.ts` cannot see this. It models exactly two worlds — light
 * tokens on `#ffffff`, dark tokens on `#0a0a0a` — and the failure is the third
 * combination, light tokens on `#0a0a0a`, which the class strategy is supposed
 * to make unreachable. So the invariant is asserted here instead: the theme
 * variables have one source of truth, the `.dark` class.
 */

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

/** The custom properties `body` paints the page surface and text from. */
const THEME_VARIABLES = ["--background", "--foreground"];

/** Strip comments so prose describing the defect cannot satisfy or trip a check. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every `@media (...)` block in the stylesheet, as `[condition, body]`. */
function mediaBlocks(css: string): { condition: string; body: string }[] {
  const blocks: { condition: string; body: string }[] = [];
  const re = /@media([^{]*)\{/g;
  let match: RegExpExecArray | null;

  while ((match = re.exec(css)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
    blocks.push({ condition: match[1].trim(), body: css.slice(re.lastIndex, i - 1) });
  }
  return blocks;
}

describe("theme variables have one source of truth", () => {
  const css = withoutComments(CSS);

  it("gates the dark variant on the class, not on the OS", () => {
    // If this line ever changes to a media-query strategy the rest of this
    // file is arguing about the wrong mechanism, so it is checked rather than
    // assumed.
    expect(css, "class-based dark variant in globals.css").toContain(
      "@variant dark (&:where(.dark, .dark *))",
    );
  });

  it("never redefines a theme variable from prefers-color-scheme", () => {
    // The exact defect: a second, OS-driven definition that disagrees with the
    // class every `dark:` utility reads.
    const offenders: string[] = [];

    for (const { condition, body } of mediaBlocks(css)) {
      if (!condition.includes("prefers-color-scheme")) continue;
      for (const variable of THEME_VARIABLES) {
        if (new RegExp(`${variable}\\s*:`).test(body)) {
          offenders.push(`${variable} redefined under @media ${condition}`);
        }
      }
    }

    expect(offenders, "theme variables set from the OS colour scheme").toEqual([]);
  });

  it("defines each theme variable exactly twice: the default and the .dark root", () => {
    // Two definitions and no more. A third would be another switch, which is
    // how the first one got out of step.
    const wrong: string[] = [];

    for (const variable of THEME_VARIABLES) {
      const count = (css.match(new RegExp(`${variable}\\s*:`, "g")) ?? []).length;
      if (count !== 2) wrong.push(`${variable} defined ${count} times, expected 2`);

      const inDark = new RegExp(`:root\\.dark\\s*\\{[^}]*${variable}\\s*:`).test(css);
      if (!inDark) wrong.push(`${variable} not defined on :root.dark`);

      const inRoot = new RegExp(`:root\\s*\\{[^}]*${variable}\\s*:`).test(css);
      if (!inRoot) wrong.push(`${variable} not defined on the default :root`);
    }

    expect(wrong, "theme variable definitions").toEqual([]);
  });
});
