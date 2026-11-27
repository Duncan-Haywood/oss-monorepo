// A small, safe Markdown-to-HTML renderer for the legal pages (src/site/legal.ts). Every piece of text
// goes through esc(); raw HTML in the source comes out as text. It covers what the app's legal
// documents use: "#" to "###" headings, paragraphs, "-" bullet lists, **bold**, *italic*, `code` and
// [links](href) with http(s), mailto or site-relative hrefs. Anything else (tables, numbered lists,
// block quotes, fences) throws, so a later edit to the documents fails the build and the drift test
// instead of publishing broken markup.
import { esc } from "./html";

/** The href if it is safe in an <a> (http, https, mailto, or relative without a scheme), else null. */
export function safeHref(raw: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control characters on purpose
  const cleaned = raw.replace(/[\u0000- \u007f-\u009f]/g, "");
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (/^https?:\/\/[^/\\]/.test(lower)) return cleaned;
  if (/^mailto:[^\s@]+@[^\s@]+$/.test(lower)) return cleaned;
  if (/^[a-z][a-z0-9+.-]*:/.test(lower)) return null;
  if (/^[/\\]{2}/.test(lower) || lower.startsWith("\\")) return null;
  return cleaned;
}

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** Inline Markdown to HTML. Bare email addresses become mailto links. */
export function inline(src: string): string {
  let out = "";
  let i = 0;
  let text = "";
  const flush = () => {
    out += esc(text).replace(EMAIL, (m) => `<a href="mailto:${m}">${m}</a>`);
    text = "";
  };
  while (i < src.length) {
    const rest = src.slice(i);
    const ch = src[i] as string;
    if (ch === "\\" && /[\\`*_[\]()#+\-.!>|]/.test(src[i + 1] ?? "")) {
      text += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out += `<code>${esc(src.slice(i + 1, end))}</code>`;
        i = end + 1;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        out += `<strong>${inline(src.slice(i + 2, end))}</strong>`;
        i = end + 2;
        continue;
      }
    }
    if (ch === "*" && !/\w/.test(src[i - 1] ?? " ") && src[i + 1] !== " ") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[end - 1] !== " ") {
        flush();
        out += `<em>${inline(src.slice(i + 1, end))}</em>`;
        i = end + 1;
        continue;
      }
    }
    if (ch === "[") {
      const m = /^\[([^\]]*)\]\(([^()\s]*)\)/.exec(rest);
      if (m) {
        flush();
        const label = inline(m[1] ?? "");
        const target = safeHref(m[2] ?? "");
        out += target ? `<a href="${esc(target)}">${label}</a>` : label;
        i += m[0].length;
        continue;
      }
    }
    text += ch;
    i += 1;
  }
  flush();
  return out;
}

export interface RenderOptions {
  /** Shift heading levels by this much ("#" becomes h1 + shift). */
  headingShift?: number;
  /** Drop the document's first "# " heading (the page supplies its own h1). */
  dropTitle?: boolean;
}

/** Block Markdown to HTML. */
export function markdownToHtml(md: string, opts: RenderOptions = {}): string {
  const shift = opts.headingShift ?? 0;
  const blocks: string[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let titleDropped = !opts.dropTitle;
  const flushPara = () => {
    if (para.length) blocks.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = [];
  };
  md.replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((rawLine, n) => {
      const line = rawLine.trimEnd();
      const heading = /^(#{1,3}) (.+)$/.exec(line);
      const bullet = /^- (.+)$/.exec(line);
      if (!line.trim()) {
        flushPara();
        flushList();
      } else if (heading) {
        flushPara();
        flushList();
        const level = (heading[1] as string).length;
        if (level === 1 && !titleDropped) {
          titleDropped = true;
          return;
        }
        const h = Math.min(6, level + shift);
        blocks.push(`<h${h}>${inline(heading[2] as string)}</h${h}>`);
      } else if (bullet) {
        flushPara();
        list.push(bullet[1] as string);
      } else if (/^(\s+[-*]|\d+[.)] |>|\||```|~~~|#{4,} |\* |\+ |---\s*$|___\s*$)/.test(line)) {
        throw new Error(`markdown.ts does not render line ${n + 1}: ${JSON.stringify(line)}`);
      } else if (list.length) {
        // A continuation line of the last bullet.
        list[list.length - 1] += ` ${line.trim()}`;
      } else {
        para.push(line.trim());
      }
    });
  flushPara();
  flushList();
  return blocks.join("\n");
}
