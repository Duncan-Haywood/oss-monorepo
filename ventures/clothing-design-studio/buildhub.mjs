// Fill launch.html's stage list and index.html's "Every tool" section from journey.mjs: node buildhub.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { hubHtml, studioToolsHtml, TOOLS_MARK } from "./journey.mjs";
const fill = (file, re, body) => {
  const p = new URL(`./${file}`, import.meta.url);
  const t = readFileSync(p, "utf8");
  if (!re.test(t)) throw new Error(`${file} has no markers for ${re}`);
  writeFileSync(p, t.replace(re, body));
};
fill("launch.html", /<!-- stages -->[\s\S]*?<!-- \/stages -->/, `<!-- stages -->\n${hubHtml()}\n<!-- /stages -->`);
fill("index.html", new RegExp(`${TOOLS_MARK[0]}[\\s\\S]*?${TOOLS_MARK[1]}`), `${TOOLS_MARK[0]}\n${studioToolsHtml()}\n  ${TOOLS_MARK[1]}`);
