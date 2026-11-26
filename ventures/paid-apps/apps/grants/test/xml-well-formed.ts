// Strict-enough XML 1.0 well-formedness checker for tests (happy-dom's DOMParser tolerates bare
// & and <, and workerd has no DOMParser at all). Shared by unit and worker tests.

const ENTITY = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/;
const ILLEGAL_XML_CHAR = /[^\t\n\r\u0020-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/u;
const NAME = "[A-Za-z_][\\w.:-]*";
const OPEN_TAG = new RegExp(
  `^<(${NAME})((?:\\s+${NAME}\\s*=\\s*(?:"[^"<]*"|'[^'<]*'))*)\\s*(/?)>$`,
);
const CLOSE_TAG = new RegExp(`^</(${NAME})\\s*>$`);
const ATTR = new RegExp(`(${NAME})\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "g");

function checkText(t: string, where: string) {
  for (let i = t.indexOf("&"); i !== -1; i = t.indexOf("&", i + 1)) {
    if (!ENTITY.test(t.slice(i))) throw new Error(`bare & in ${where}: ${t.slice(i, i + 20)}`);
  }
}

/** Throws with a reason when `xml` is not well-formed (single root, balanced tags, valid entities). */
export function assertWellFormed(xml: string) {
  if (ILLEGAL_XML_CHAR.test(xml)) throw new Error("illegal XML character");
  let s = xml;
  if (s.startsWith("<?xml")) s = s.slice(s.indexOf("?>") + 2);
  const stack: string[] = [];
  let roots = 0;
  let i = 0;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    const text = s.slice(i, lt === -1 ? undefined : lt);
    if (text.includes(">")) throw new Error(`unescaped > in text: ${text.slice(0, 40)}`);
    checkText(text, "text");
    if (!stack.length && text.trim()) throw new Error("text outside the root element");
    if (lt === -1) break;
    const gt = s.indexOf(">", lt);
    if (gt === -1) throw new Error("unterminated tag");
    const tag = s.slice(lt, gt + 1);
    const close = CLOSE_TAG.exec(tag);
    const open = OPEN_TAG.exec(tag);
    if (close) {
      const top = stack.pop();
      if (top !== close[1]) throw new Error(`</${close[1]}> closes <${top}>`);
    } else if (open) {
      const seen = new Set<string>();
      for (const m of (open[2] ?? "").matchAll(ATTR)) {
        if (seen.has(m[1] ?? "")) throw new Error(`duplicate attribute ${m[1]}`);
        seen.add(m[1] ?? "");
        checkText(m[2] ?? m[3] ?? "", `attribute ${m[1]}`);
      }
      if (!stack.length) roots++;
      if (open[3] !== "/") stack.push(open[1] ?? "");
    } else {
      throw new Error(`malformed tag: ${tag.slice(0, 60)}`);
    }
    i = gt + 1;
  }
  if (stack.length) throw new Error(`unclosed <${stack.at(-1)}>`);
  if (roots !== 1) throw new Error(`expected one root element, got ${roots}`);
}
