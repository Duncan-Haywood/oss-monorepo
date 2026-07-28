import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { describe, expect, it } from "vitest";

/**
 * Every error message a screen renders, checked for `role="alert"`.
 *
 * docs/ACCESSIBILITY.md claims `role="alert"` is on "the error paragraphs the
 * screens render". That claim was false for five of the ten when it was
 * checked: `AdminView`, `CoupleView`, `ProfileView`, `ReportWidget` and the
 * perspective picker in `UnifiedRunner` all rendered their failure text as a
 * plain paragraph. Five others had it, which is why nobody noticed — the
 * pattern was there, it just was not everywhere, and the ones missing it were
 * the ones added later.
 *
 * Without the role, a screen reader announces nothing when a request fails.
 * The text appears, focus stays where it was, and the person is left waiting
 * on a button that already came back with an answer they cannot hear. That is
 * the one moment in the app where silence is actively misleading.
 *
 * This is the same shape of check as `contrastAudit`, `routeInventory` and
 * `screenInventory`: a property some elements have and others do not, made to
 * fail as a named row rather than something you would have to already suspect.
 *
 * What it cannot check: whether the message says anything useful, or whether
 * `role="alert"` is the right choice over `aria-live="polite"` for a given
 * message. It checks only that a rendered error is announced at all.
 */

const ROOT = process.cwd();

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

/**
 * A conditional render of an error string into its own element. Both spellings
 * the codebase uses are matched — `{error && <p ...>}` on one line, and
 * `{error && (` with the element on the next — because the two that already
 * had `role="alert"` were written the second way and an earlier version of
 * this regex silently scored them as absent.
 *
 * Matching the source rather than the DOM is deliberate: the alternative is
 * mounting every screen in every failure state, which is a much larger test
 * that would still miss any screen nobody remembered to add to it.
 *
 * Not matched, and deliberately so: an unconditional `<p role="alert">` inside
 * a branch that only renders on failure (`InsightsView.tsx:69` and friends).
 * There is no `error &&` to key on, and nothing to check — they already carry
 * the role by construction.
 */
const ERROR_ELEMENT = /\{\s*(\w*[eE]rror\w*)\s*&&\s*\(?\s*(<[a-z]+\b[^>]*>)/g;

type Site = { where: string; tag: string; announced: boolean };

function errorSites(): Site[] {
  const sites: Site[] = [];

  for (const file of sourceFiles(join(ROOT, "src"))) {
    const rel = relative(ROOT, file);
    const source = readFileSync(file, "utf8");

    for (const match of source.matchAll(ERROR_ELEMENT)) {
      const [whole, variable, tag] = match;
      const tagName = tag.match(/^<([a-z]+)/)![1];

      // Only the element that renders the message itself. `{error && <button
      // …>Retry</button>}` is gated on the same variable but is a control, not
      // an announcement — the text beside it is what gets read out, and
      // putting `role="alert"` on the button would announce the word "Retry".
      const after = source.slice(match.index! + whole.length);
      const close = after.indexOf(`</${tagName}>`);
      const body = close === -1 ? "" : after.slice(0, close);
      if (!new RegExp(`\\{\\s*${variable}\\b`).test(body)) continue;

      sites.push({
        where: `${rel}:${source.slice(0, match.index).split("\n").length}`,
        tag,
        announced: /\brole="alert"/.test(tag) || /\baria-live=/.test(tag),
      });
    }
  }

  return sites;
}

describe("rendered errors are announced", () => {
  it("finds the error paragraphs at all", () => {
    // Guards the regex itself: if a refactor changes how these are written,
    // this test would otherwise pass by finding nothing to check.
    expect(errorSites().length).toBeGreaterThanOrEqual(7);
  });

  it("gives every rendered error an alert role", () => {
    const silent = errorSites().filter((s) => !s.announced);

    expect(
      silent.map((s) => `${s.where}  ${s.tag}`),
      "these render an error with no role=\"alert\" and no aria-live, so a screen reader announces nothing when the request fails",
    ).toEqual([]);
  });
});
