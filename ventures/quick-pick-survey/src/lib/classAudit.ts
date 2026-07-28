/**
 * Pull colour and size information out of Tailwind class strings.
 *
 * There is no runtime here that could measure real contrast — the app renders
 * to a phone, not to a canvas this repo can sample — so the check reads the
 * class lists instead. That constrains what it can honestly claim, and the
 * constraints are worth stating:
 *
 *  - **One string literal is treated as one element.** That is what a class
 *    list is in practice in this codebase, including the two-branch ternaries
 *    where each branch is its own literal.
 *  - **A background must be on the element itself** to be seen. Text whose
 *    background comes from an ancestor is checked against the page surface,
 *    which is right for the ordinary case (a card is white on white) and wrong
 *    for text inside a dark or coloured container. Those are the entries in
 *    `ON_ANCESTOR_BACKGROUND` in the test, each with the ancestor named.
 *  - **Unresolvable colours are reported, not skipped.** An arbitrary value
 *    like `text-[#8a8a8a]` cannot be checked, and silence would read as a pass.
 */

/** A class list found in a source file, with its position for error messages. */
export type ClassList = {
  file: string;
  line: number;
  classes: string;
};

export type ElementColours = {
  /** Text colour with no variant prefix — applies in both schemes unless overridden. */
  text: string | null;
  /** Text colour under `dark:`. */
  darkText: string | null;
  /** Background set on this element, if any. */
  bg: string | null;
  darkBg: string | null;
  /** True when WCAG's large-text threshold (18.66px bold / 24px) is met. */
  large: boolean;
};

/**
 * Font sizes in this codebase, in px, from Tailwind's defaults plus the
 * arbitrary values actually used. Anything absent is treated as the inherited
 * 16px, which is the strict reading.
 */
const SIZES: Record<string, number> = {
  "text-[10px]": 10,
  "text-[11px]": 11,
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
  "text-5xl": 48,
};

const BOLD = /\bfont-(semibold|bold|extrabold|black)\b/;

/** `text-neutral-400`, `dark:bg-amber-950/40`, `bg-white`, `text-white/70`. */
const COLOUR_SOURCE = /(?:^|\s)(dark:)?(text|bg)-((?:[a-z]+-\d{2,3}|white|black)(?:\/\d{1,3})?)(?=\s|$)/;
const COLOUR = new RegExp(COLOUR_SOURCE, "g");

export function colours(classes: string): ElementColours {
  const found: ElementColours = { text: null, darkText: null, bg: null, darkBg: null, large: false };

  for (const m of classes.matchAll(COLOUR)) {
    const [, dark, property, token] = m;
    if (property === "text") {
      if (dark) found.darkText = token;
      else found.text = token;
    } else if (dark) found.darkBg = token;
    else found.bg = token;
  }

  // WCAG large text: 24px, or 18.66px when bold. The px sizes below that are
  // the ones this app actually leans on, so the distinction matters.
  const size = Object.keys(SIZES).find((c) => classes.split(/\s+/).includes(c));
  const px = size ? SIZES[size] : 16;
  found.large = px >= 24 || (px >= 18.66 && BOLD.test(classes));

  return found;
}

/**
 * Every string literal in a source file that carries at least one colour class.
 *
 * Template literals are included with their `${...}` holes blanked out, so a
 * conditional inside one cannot glue two unrelated classes into a token.
 */
export function classLists(file: string, source: string): ClassList[] {
  const out: ClassList[] = [];
  const lines = source.split("\n");

  for (const [i, line] of lines.entries()) {
    for (const m of line.matchAll(/"([^"\n]*)"|`([^`\n]*)`/g)) {
      const raw = m[1] ?? m[2] ?? "";
      const literal = raw.replace(/\$\{[^}]*\}/g, " ");
      // A class list, not prose: prose in this codebase lives in JSX text or in
      // longer strings without hyphenated colour tokens.
      if (!COLOUR_SOURCE.test(` ${literal}`)) continue;
      out.push({ file, line: i + 1, classes: literal });
    }
  }

  return out;
}
