// Fill launch.html's stage list from journey.mjs: node buildhub.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { hubHtml } from "./journey.mjs";
const p = new URL("./launch.html", import.meta.url);
const t = readFileSync(p, "utf8");
const out = t.replace(/<!-- stages -->[\s\S]*?<!-- \/stages -->/, `<!-- stages -->\n${hubHtml()}\n<!-- /stages -->`);
writeFileSync(p, out);
