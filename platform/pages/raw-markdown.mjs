// Markdown a renderer missed, shown to a visitor as source: `code` with its backticks,
// *emphasis* with its asterisks, [text](path) with its brackets. On 2026-11-14 a sweep of the
// built site found it on 40 pages from four causes: post descriptions went through esc() only
// (the dek and blog cards showed `curl | bash`), double-backtick code spans were not read by
// either renderer, emphasis after a slash ("1/*e*") was not read, and research logs showed
// relative links as "[`paper/draft.md`](paper/draft.md)". Hand-written tool pages had a few too.
//
// Only visible text is read: scripts, styles, code, pre, SVG, MathML, textareas and comments are
// cut first, so a page that shows Markdown on purpose does it inside <code> or <pre>.

const CUT = /<(script|style|code|pre|svg|math|textarea|kbd|samp)\b[\s\S]*?<\/\1>|<!--[\s\S]*?-->/gi;

// `x` with non-space ends and no template-literal syntax inside, between word boundaries.
const TICKS = /(^|[\s(“"'])`([^`\s<>][^`<>]{0,60}?[^`\s<>]|[^`\s<>])`(?=$|[\s.,;:!?)”"'])/;
// *x* opened after a space, "(", "/" or a quote and closed before a space or punctuation.
const STAR = /(^|[\s(/“])\*([A-Za-z](?:[^*<>]{0,40}?[A-Za-z.])?)\*(?=$|[\s.,;:!?)”])/;
// [text](target) with a target that looks like a path or URL.
const LINK = /\[[^\]<>]{0,80}\]\((?:https?:\/\/|\.{0,2}\/?[\w-]+[./])[^)\s]*\)/;

/** The text of a page a visitor sees, with tags turned into spaces (entities left as written). */
export function visibleText(html) {
  return String(html).replace(CUT, ' ').replace(/<[^>]+>/g, ' ');
}

/** Up to `limit` short snippets of raw Markdown in the page's visible text. */
export function rawMarkdownLeaks(html, limit = 5) {
  const text = visibleText(html);
  const found = [];
  for (const re of [TICKS, STAR, LINK]) {
    const g = new RegExp(re.source, 'g');
    for (const m of text.matchAll(g)) {
      found.push(m[0].trim().replace(/\s+/g, ' ').slice(0, 60));
      if (found.length >= limit) return found;
    }
  }
  return found;
}
