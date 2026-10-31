// Clicks the schedule page: marks the roof exposed, types a monthly weather rate, checks the finish moves.
// `node eval-schedule-click.mjs`; skips with exit 0 when Playwright or a Chromium is missing.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
const root = new URL(".", import.meta.url).pathname;
let chromium;
for (const c of ["playwright", process.env.PLAYWRIGHT_PATH, "file:///opt/node-tools/node_modules/playwright/index.mjs"].filter(Boolean)) { try { const m = await import(c); chromium = (m.default ?? m).chromium; if (chromium) break; } catch {} }
if (!chromium) { console.log("skipped: playwright not installed"); process.exit(0); }
const types={".html":"text/html",".mjs":"text/javascript"};
const server=createServer(async(req,res)=>{try{const b=await readFile(join(root,req.url.split("?")[0]));res.writeHead(200,{"content-type":types[extname(req.url.split("?")[0])]||"text/plain"}).end(b)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const b=await chromium.launch();const p=await b.newPage();const errs=[];p.on("pageerror",e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/schedule-calculator.html`);
{const j=JSON.parse(await p.inputValue("#src"));j.activities.find(a=>a.id==="roof").exposed=true;await p.fill("#src",JSON.stringify(j));}
const days = (t) => Number(/^\s*(\d+) working days/.exec(t)[1]);
const base = days(await p.textContent("#out"));
await p.fill("#wr", "2026-04:50");
const stretched = days(await p.textContent("#out"));
await p.fill("#wr", "garbage");
const bad = await p.textContent("#out");
await p.fill("#wr", "2026-04:95");
const high = await p.textContent("#out");
const ok = base === 36 && stretched === 41 && /not YYYY-MM:percent/.test(bad) && /0 to 0\.9/.test(high) && !errs.length;
console.log(ok ? "ok: monthly weather rate moves the finish 36 -> 41 days; bad input and 95% refused" : "FAIL", { base, stretched, errs });
await b.close(); server.close(); if (!ok) process.exit(1);
