/**
 * The jump row and the grouped guide list, one shared component for every
 * tool page.
 *
 * Between 2026-11-13 and the run that added this file, ten tool pages moved
 * the link walls out of their intro (docs/reports/polish-2026-11-13-intro-walls.md
 * and the runs after it): a short row of pill links under the intro
 * (`<nav class="jump">`) and a "Guides" section lower down
 * (`<ul class="guide-list">`). Each page carried its own copy of the CSS,
 * written from the last one, and the copies had already drifted: two paddings,
 * two type sizes, two focus-ring widths, five top margins. A new page had to
 * copy the block again to adopt the pattern.
 *
 * Now the rules ride in `pf-chrome.css`, which every tool page already links,
 * so a page adopts the pattern with markup alone:
 *
 *   <nav class="pf-jump" aria-label="Guides">
 *     <a class="pf-jump-main" href="#tool">Start</a>   (optional filled pill)
 *     <a href="#guides">Every guide</a>
 *   </nav>
 *   <ul class="pf-guide-list pf-cols">...</ul>          (pf-cols: columns of 15rem)
 *
 * A page sets its own colours with custom properties on the row or any
 * ancestor; each has a fallback that reads on a light page, and the defaults
 * follow the text colour, so a dark page that sets nothing still gets a
 * readable row:
 *
 *   --jump-fg     pill text            (default: inherit)
 *   --jump-bg     pill fill            (default: transparent)
 *   --jump-line   pill border          (default: 28% of the text colour)
 *   --jump-hover  hover border and focus ring (default: the text colour),
 *                 and the main pill's fill (default: the site accent
 *                 #1f4e8c, never the text colour: the main pill's own text
 *                 is --jump-on, so currentColor there would be white on white)
 *   --jump-on     text on the main pill (default: #fff)
 *   --jump-margin the row's margin     (default: 8px 0 0)
 *
 * Specificity: `pf-chrome.css` is linked after a page's own `<style>`, so these
 * rules win a tie. They are written at one class (`.pf-jump a` is 0,1,1), so a
 * page's element rules (`header a`, `nav`) never restyle the pills, while a
 * page that needs a structural change can still write a more specific rule.
 *
 * Without the stylesheet (a page opened straight from the repository) the row
 * is a line of ordinary links and the list an ordinary bulleted list: nothing
 * is hidden or unreadable.
 */
export const JUMP_ROW_CSS = `
.pf-jump{display:flex;flex-wrap:wrap;gap:6px 8px;margin:var(--jump-margin,8px 0 0);padding:0;list-style:none}
.pf-jump a{display:inline-flex;align-items:center;box-sizing:border-box;min-height:34px;padding:0 12px;
  border:1px solid rgba(128,128,128,.45);border-color:var(--jump-line,color-mix(in srgb,currentColor 28%,transparent));
  border-radius:999px;background:var(--jump-bg,transparent);color:var(--jump-fg,inherit);
  font-size:.87rem;font-weight:600;line-height:1.25;text-decoration:none}
.pf-jump a:hover{border-color:var(--jump-hover,currentColor)}
.pf-jump a:focus-visible{outline:3px solid var(--jump-hover,currentColor);outline-offset:2px}
.pf-jump a.pf-jump-main{background:var(--jump-hover,#1f4e8c);border-color:var(--jump-hover,#1f4e8c);color:var(--jump-on,#fff)}
.pf-guide-list{margin:0 0 6px;padding-left:1.1rem}
.pf-guide-list li{margin:0 0 4px;break-inside:avoid}
.pf-guide-list.pf-cols{columns:15rem;column-gap:28px}
`;
