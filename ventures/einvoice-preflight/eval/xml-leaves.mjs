// Shared by eval/nbsp-amounts.mjs and eval/nbsp-other-formats.mjs.
// Leaf elements with their raw text span in the source, by a token walk that
// mirrors parseXmlTree (same regex), so a mutant changes one leaf only.
export function leaves(source) {
  const tokens = [];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[^>]+>|[^<]+/g;
  let m;
  while ((m = re.exec(source))) tokens.push({ text: m[0], at: m.index });
  const out = [];
  const stack = [{ name: "", counts: new Map(), path: "", leaf: null }];
  for (let i = 0; i < tokens.length; i++) {
    const { text, at } = tokens[i];
    if (text.startsWith("<?") || text.startsWith("<!")) continue;
    if (text.startsWith("</")) {
      const node = stack.pop();
      if (node && node.isLeaf && node.textAt !== null) out.push({ path: node.path, name: node.name, at: node.textAt, raw: node.raw });
      continue;
    }
    if (text.startsWith("<")) {
      const parent = stack[stack.length - 1];
      parent.isLeaf = false;
      const name = text.slice(1).replace(/^\/+/, "").split(/[\s>/]/, 1)[0].split(":").pop();
      const index = (parent.counts.get(name) || 0) + 1;
      parent.counts.set(name, index);
      const node = { name, counts: new Map(), path: `${parent.path}/${name}[${index}]`, isLeaf: true, textAt: null, raw: "" };
      if (!/\/>$/.test(text)) stack.push(node);
      continue;
    }
    const node = stack[stack.length - 1];
    if (node.textAt === null) { node.textAt = at; node.raw = text; }
  }
  return out;
}
