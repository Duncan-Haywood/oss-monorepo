/**
 * The lab: a contained place on the Pages site to try out what a tools website
 * can be, for the people who use it and for the agents working for them.
 * Published at `lab/`.
 *
 *   node platform/pages/lab.mjs --out=dist        # writes dist/lab/
 *
 * The rules of the lab:
 *
 *   - An experiment lives under `lab/<id>/` and touches nothing outside it, so
 *     a bad idea costs one directory and a good one costs nothing to try.
 *   - Experiments are `noindex` and in no sitemap while they are experiments: a
 *     half-built page should not be anyone's search result.
 *   - An experiment *graduates* when it has earned it (a browser check passes,
 *     a reading says people use it, or it plainly beats what the site does
 *     now). Graduating means pulling it into the shared templates (`build.mjs`,
 *     `site-nav.mjs`, `embed.mjs`) so every page gets it, then marking it
 *     `graduated` in `EXPERIMENTS` below with a pointer to where it went.
 *   - Everything still runs in the visitor's browser with no third-party
 *     script, cookie or request, as `/about/` promises for the whole site.
 *
 * The experiments themselves, built and not yet built, are the `EXPERIMENTS`
 * list below; the lab's index page is rendered from it, so adding an idea is
 * adding a row.
 *
 * `build.mjs` calls `buildLab` on every site build, after `catalog.json` is
 * written, because `lab/handoff/` reads it in the browser.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { REPO_URL, withSiteHeader, renderSiteFooterNav } from './site-nav.mjs';
import { EMBED_QUERY_PARAM, DEFAULT_EMBED_HEIGHT } from './embed.mjs';

export const LAB_PATH = 'lab/';

const esc = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Every experiment, newest ideas last. `status` is one of:
 *   live       built, under `lab/<id>/`, linked from the lab index
 *   idea       described, not built; the next session in the lab can take one
 *   graduated  pulled into the shared site; `href` says where it went
 */
export const EXPERIMENTS = [
  {
    id: 'handoff',
    status: 'live',
    title: 'Hand it to your agent',
    summary:
      'Pick any tool and get it in the form you need: a link for a person, an embed for a website, ' +
      'commands for a terminal or MCP client, or one prompt you paste into a coding agent that tells it ' +
      'how to put the tool into your own project.',
    why: 'Distribution where the tool travels with its own instructions. An agent can integrate a tool it was handed in one step instead of reverse-engineering a web page.',
  },
  {
    id: 'covers',
    status: 'live',
    title: 'Generative covers',
    summary:
      'Every tool gets its own cover art, drawn from its name by a few lines of code: same name, same picture, ' +
      'no image files, no AI bill. You can see them in the handoff experiment.',
    why: 'A catalogue of 1,000+ text cards is hard to scan. A stable picture per tool gives the eye a landmark, and the same function can draw social cards.',
    href: 'handoff/',
  },
  {
    id: 'palette',
    status: 'idea',
    title: 'Command palette on every page',
    summary: 'Press / or ⌘K anywhere to jump to any tool, category, guide or post, and run "hand to agent" from the same box.',
    why: 'Navigation for people who know what they want, and one place an agent can drive with the keyboard.',
  },
  {
    id: 'intent',
    status: 'idea',
    title: 'Ask, don’t browse',
    summary: 'A front door that starts from "what are you trying to do?" and answers with the two or three tools that fit, matched in the browser against catalog.json.',
    why: 'Most visitors arrive with a problem, not a tool name.',
  },
  {
    id: 'twins',
    status: 'idea',
    title: 'Agent twins of every page',
    summary: 'A plain-Markdown copy of each page beside it (`index.md`), linked with rel="alternate", carrying the inputs, the formula and the disclaimer.',
    why: 'Assistants read text better than forms. llms.txt points at the site; twins would let it point at every page.',
  },
  {
    id: 'explain',
    status: 'idea',
    title: 'Explain this result',
    summary: 'A reading mode on any result that shows the arithmetic step by step, in words, with the inputs that moved it most.',
    why: 'A number people can follow is a number they trust and come back to.',
  },
  {
    id: 'motion',
    status: 'idea',
    title: 'Programmatic video',
    summary: 'Short walkthroughs recorded from the live pages by the browser checks that already drive them (Playwright), captioned from the page copy. No camera, no paid generator.',
    why: 'Short-form video is a discovery channel, and the site already has a robot that clicks through every tool.',
  },
  {
    id: 'research-media',
    status: 'idea',
    title: 'Research in every format',
    summary: 'Each research project in `research/` as a short write-up, a 60-second short (its key chart, animated), a long-form walkthrough, and a podcast episode, all generated from the project’s own LOG.md, data and charts, so nothing is said that the research did not find.',
    why: 'Research people can build on has to reach them first; the findings, figures and logs are already committed, and a pipeline that renders them costs nothing per episode.',
  },
  {
    id: 'audio',
    status: 'idea',
    title: 'Engineering and research, read aloud',
    summary: 'The posts in `writing/` and the research write-ups as a podcast feed, voiced in the listener’s own browser (Web Speech) at first, and by a model on the owner’s key only if the owner switches that on.',
    why: 'The engineering writing already exists; audio is a second door into it at no marginal cost.',
  },
];

/**
 * The deterministic cover for a name: an SVG string. Same input, same picture,
 * forever, so it can be cached, shared and recognised. Kept dependency-free and
 * self-contained because its source is also shipped to the browser.
 */
export function coverSvg(name, size = 160) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Inline SVGs share one id namespace per document, so the gradient id must
  // be unique per cover or every cover paints with the first one's gradient.
  const gid = `pfc${h.toString(36)}`;
  const rand = () => {
    h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return h / 4294967296;
  };
  const hue = Math.floor(rand() * 360);
  const hue2 = (hue + 40 + Math.floor(rand() * 140)) % 360;
  const s = size;
  let shapes = '';
  const kind = Math.floor(rand() * 3);
  const count = 5 + Math.floor(rand() * 6);
  for (let i = 0; i < count; i++) {
    const x = (rand() * s).toFixed(1);
    const y = (rand() * s).toFixed(1);
    const r = (s * (0.08 + rand() * 0.3)).toFixed(1);
    const lightness = 45 + Math.floor(rand() * 35);
    const fill = `hsl(${i % 2 ? hue : hue2} 80% ${lightness}% / ${(0.35 + rand() * 0.5).toFixed(2)})`;
    if (kind === 0) {
      shapes += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
    } else if (kind === 1) {
      const angle = Math.floor(rand() * 180);
      shapes += `<rect x="${x}" y="${y}" width="${r}" height="${(r * 2.4).toFixed(1)}" rx="${(r / 6).toFixed(1)}" fill="${fill}" transform="rotate(${angle} ${x} ${y})"/>`;
    } else {
      const w = (s * (0.02 + rand() * 0.06)).toFixed(1);
      shapes += `<path d="M${x} ${y} Q ${(rand() * s).toFixed(1)} ${(rand() * s).toFixed(1)} ${(rand() * s).toFixed(1)} ${(rand() * s).toFixed(1)}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" fill="none"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}" role="img" aria-hidden="true">` +
    `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 22%)"/><stop offset="1" stop-color="hsl(${hue2} 70% 14%)"/></linearGradient></defs>` +
    `<rect width="${s}" height="${s}" fill="url(#${gid})"/>${shapes}</svg>`;
}

/**
 * The one prompt a person pastes into a coding agent to put `tool` into their
 * own project. `tool` is a `catalog.json` row ({ slug, name, url, description,
 * category }). Shipped to the browser as source, so it must stay self-contained.
 */
export function agentPrompt(tool, { repoUrl, embedParam, embedHeight }) {
  const src = `${tool.url}${tool.url.includes('?') ? '&' : '?'}${embedParam}=1`;
  const iframe = `<iframe src="${src}" title="${tool.name}" style="width:100%;max-width:820px;border:0;min-height:${embedHeight}px" loading="lazy"></iframe>`;
  return [
    `# Add "${tool.name}" to this project`,
    '',
    `${tool.description}`,
    '',
    `- Live tool: ${tool.url}`,
    `- Source: ${repoUrl} (MIT license)`,
    `- Category: ${tool.category}`,
    '- It computes in the browser or in Node. It needs no API key, account or server, and sends nothing anywhere.',
    '',
    'Read this project first, choose the ONE path below that fits it, and do it. Say which path you chose and why.',
    '',
    '## Path A: embed the page (a website, a docs page, a CMS; no build step)',
    '',
    'Put this where the tool should appear:',
    '',
    '```html',
    iframe,
    '```',
    '',
    `The frame works at that height on its own. For automatic height, add the one-line resizer script shown in the "Embed this tool" box at the foot of ${tool.url}.`,
    '',
    '## Path B: call it from code, a script or an agent (Node 18+)',
    '',
    '```sh',
    `git clone --depth 1 ${repoUrl}.git`,
    `node oss-monorepo/platform/agents/tools.mjs describe ${tool.slug}   # functions, parameters, defaults, source directory`,
    `node oss-monorepo/platform/agents/tools.mjs call ${tool.slug} <function> --input '{...}'`,
    '```',
    '',
    'Pass only the inputs that differ from the defaults `describe` prints. To give an AI client the tool directly, register the MCP server (use an absolute path):',
    '',
    '```json',
    '{ "mcpServers": { "monorepo-projects-tools": { "command": "node", "args": ["/abs/path/oss-monorepo/platform/agents/tools.mjs", "mcp"] } } }',
    '```',
    '',
    '## Path C: vendor the engine (copy the computation into this codebase)',
    '',
    `Run the \`describe\` command above. It names the source directory and the plain ES modules the page computes with. Copy those modules and anything they import, keep the MIT license notice, and link back to ${tool.url}.`,
    '',
    '## Whichever path',
    '',
    `- Check it: run one set of inputs through your integration and through ${tool.url}; the numbers must match.`,
    '- Keep the disclaimer: results are estimates from the inputs given, provided with no warranty, and are not legal, tax, financial or other professional advice. Show that wherever results reach people.',
    '- Do not present the tool as your own work or remove the attribution.',
    '',
  ].join('\n');
}

const BASE_STYLE = `
:root{--bg:#f6f5f1;--surface:#fff;--text:#1b1b20;--muted:#5d5c66;--border:#e2e0d8;--accent:#4338ca;--accent-ink:#fff;--code:#efede6;--glow:rgba(67,56,202,.12)}
@media (prefers-color-scheme:dark){:root{--bg:#0f0f13;--surface:#18181e;--text:#ececf1;--muted:#a4a3ae;--border:#2b2b33;--accent:#a5b4fc;--accent-ink:#111;--code:#24242c;--glow:rgba(165,180,252,.12)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
code{font:.86em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code);padding:.05em .3em;border-radius:4px}
.wrap{max-width:1040px;margin:0 auto;padding:0 16px}
.hero{padding:44px 0 20px}
.eyebrow{font:600 12px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
h1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.05;letter-spacing:-.025em;margin:.5rem 0 .8rem}
h2{font-size:1.25rem;margin:0 0 .4rem;letter-spacing:-.01em}
.lede{color:var(--muted);font-size:1.08rem;max-width:68ch;margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;margin:28px 0}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;transition:transform .15s,box-shadow .15s}
.card:hover{transform:translateY(-2px);box-shadow:0 10px 30px var(--glow)}
.card .art{aspect-ratio:16/7;overflow:hidden;display:block}
.card .art svg{width:100%;height:100%;display:block}
.card .body{padding:14px 16px 16px}
.card p{margin:.3rem 0;color:var(--muted);font-size:.95rem}
.badge{display:inline-block;font:600 11px/1 ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:.08em;padding:4px 7px;border-radius:999px;border:1px solid var(--border);color:var(--muted)}
.badge.live{background:var(--accent);color:var(--accent-ink);border-color:var(--accent)}
.why{font-style:italic}
footer{border-top:1px solid var(--border);margin-top:40px;padding:20px 0 40px;color:var(--muted);font-size:.9rem}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

function page({ title, description, body, toRoot, crumbs, extraStyle = '' }) {
  return withSiteHeader(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex">
<style>${BASE_STYLE}${extraStyle}</style>
</head>
<body>
${body}
<div class="wrap"><footer>
<p>An experiment, built by <a href="${REPO_URL}/blob/main/platform/pages/lab.mjs"><code>platform/pages/lab.mjs</code></a>. Provided as-is, with no warranty of any kind; nothing here is legal, tax, financial or other professional advice, and each tool's own page carries its own disclaimer.</p>
${renderSiteFooterNav({ toRoot })}
</footer></div>
</body>
</html>
`, { toRoot, crumbs });
}

export function renderLabIndex() {
  const cards = EXPERIMENTS.map((x) => {
    const href = x.status === 'idea' ? null : x.href ?? `${x.id}/`;
    const art = `<span class="art">${coverSvg(`lab:${x.id}`, 320)}</span>`;
    return `<article class="card" id="${esc(x.id)}">${href ? `<a class="art" href="${esc(href)}" tabindex="-1" aria-hidden="true">${art}</a>` : art}<div class="body">
<span class="badge${x.status === 'live' ? ' live' : ''}">${esc(x.status)}</span>
<h2>${href ? `<a href="${esc(href)}">${esc(x.title)}</a>` : esc(x.title)}</h2>
<p>${esc(x.summary)}</p>
<p class="why">${esc(x.why)}</p>
</div></article>`;
  }).join('\n');
  return page({
    title: 'The lab — experiments in what a tools website can be',
    description: 'Contained experiments on making this site more useful, more beautiful, and easier for both people and AI agents to use. The ones that work get pulled into the rest of the site.',
    toRoot: '../',
    crumbs: [{ label: 'Lab' }],
    body: `<div class="wrap">
<section class="hero">
<span class="eyebrow">Maris Stella Labs · Lab</span>
<h1>What can a page of free tools be?</h1>
<p class="lede">This is where the site tries things. Each experiment lives in its own corner and touches nothing else, so ideas are cheap to try. The ones that prove useful get pulled into every page; the rest stay here. Two rules carry over from the site: everything runs in your browser with no tracking, and every tool works for you <em>and</em> for the AI agent working for you.</p>
</section>
<div class="grid">
${cards}
</div>
<p class="lede">Ideas are rows in <a href="${REPO_URL}/blob/main/platform/pages/lab.mjs"><code>EXPERIMENTS</code></a>. To try one, build it under <code>lab/&lt;id&gt;/</code> and flip its status to <code>live</code>.</p>
</div>`,
  });
}

const HANDOFF_STYLE = `
.finder{position:relative;max-width:720px}
.finder input{width:100%;font:inherit;font-size:1.1rem;padding:14px 16px;border-radius:14px;border:1px solid var(--border);background:var(--surface);color:var(--text);box-shadow:0 6px 24px var(--glow)}
.finder input:focus{outline:2px solid var(--accent);outline-offset:2px}
.results{list-style:none;margin:8px 0 0;padding:0;max-width:720px}
.results li button{all:unset;box-sizing:border-box;display:flex;gap:12px;align-items:center;width:100%;padding:8px 10px;border-radius:10px;cursor:pointer}
.results li button:hover,.results li button[aria-selected="true"]{background:var(--surface);outline:1px solid var(--border)}
.results li button:focus-visible{outline:2px solid var(--accent)}
.results .thumb{flex:0 0 40px;height:40px;border-radius:9px;overflow:hidden}
.results .thumb svg{width:100%;height:100%;display:block}
.results small{display:block;color:var(--muted)}
.hint{color:var(--muted);font-size:.9rem;margin:.6rem 0}
kbd{font:.8em ui-monospace,Menlo,monospace;border:1px solid var(--border);border-bottom-width:2px;border-radius:5px;padding:0 .35em;background:var(--surface)}
.picked{margin:28px 0;background:var(--surface);border:1px solid var(--border);border-radius:18px;overflow:hidden}
.picked .head{display:flex;gap:18px;align-items:center;padding:18px}
.picked .head .art{flex:0 0 96px;height:96px;border-radius:16px;overflow:hidden}
.picked .head .art svg{width:100%;height:100%;display:block}
.picked h2{font-size:1.4rem;margin:0}
.picked .head p{margin:.2rem 0;color:var(--muted)}
.tabs{display:flex;gap:4px;padding:0 18px;border-bottom:1px solid var(--border);overflow-x:auto}
.tabs button{font:inherit;font-size:.95rem;background:none;border:0;border-bottom:2px solid transparent;padding:10px 12px;color:var(--muted);cursor:pointer;white-space:nowrap}
.tabs button[aria-selected="true"]{color:var(--text);border-bottom-color:var(--accent)}
.panel{padding:16px 18px 20px}
.panel p{margin:.2rem 0 .8rem;color:var(--muted)}
.panel pre{margin:0;background:var(--code);border-radius:12px;padding:14px;overflow:auto;max-height:440px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
.copy{font:inherit;font-weight:600;background:var(--accent);color:var(--accent-ink);border:0;border-radius:10px;padding:9px 14px;cursor:pointer;margin:0 0 12px}
@media (max-width:520px){.picked .head{flex-direction:column;align-items:flex-start}}
`;

/**
 * The browser script for `lab/handoff/`. Built from the same `coverSvg` and
 * `agentPrompt` the tests exercise, so the page and the tests cannot disagree.
 */
export function handoffScript() {
  const opts = { repoUrl: REPO_URL, embedParam: EMBED_QUERY_PARAM, embedHeight: DEFAULT_EMBED_HEIGHT };
  return `(function(){
"use strict";
var coverSvg=${coverSvg.toString()};
var agentPrompt=${agentPrompt.toString()};
var OPTS=${JSON.stringify(opts)};
var input=document.getElementById("q"),list=document.getElementById("results"),out=document.getElementById("picked"),status=document.getElementById("status");
var tools=[],shown=[],active=-1;
function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}
function score(t,words){var hay=(t.name+" "+t.slug+" "+t.category+" "+(t.subcategory||"")+" "+t.description).toLowerCase(),s=0;
  for(var i=0;i<words.length;i++){var w=words[i],at=hay.indexOf(w);if(at<0)return -1;s+=(t.name.toLowerCase().indexOf(w)>=0?10:1)+(at===0?5:0);}return s;}
function render(){var q=input.value.trim().toLowerCase(),words=q.split(/\\s+/).filter(Boolean);
  shown=!words.length?[]:tools.map(function(t){return [score(t,words),t];}).filter(function(p){return p[0]>=0;})
    .sort(function(a,b){return b[0]-a[0]||a[1].name.localeCompare(b[1].name);}).slice(0,8).map(function(p){return p[1];});
  active=shown.length?0:-1;
  list.innerHTML=shown.map(function(t,i){return '<li role="presentation"><button type="button" role="option" id="opt-'+i+'" aria-selected="'+(i===active)+'" data-i="'+i+'"><span class="thumb">'+coverSvg(t.slug,80)+'</span><span><strong>'+esc(t.name)+'</strong><small>'+esc(t.category)+'</small></span></button></li>';}).join("");
  input.setAttribute("aria-activedescendant",active>=0?"opt-"+active:"");
  status.textContent=words.length?(shown.length?shown.length+" match"+(shown.length===1?"":"es")+" shown":"No tool matches all of those words."):"";}
function highlight(){var bs=list.querySelectorAll("button");for(var i=0;i<bs.length;i++)bs[i].setAttribute("aria-selected",String(i===active));
  input.setAttribute("aria-activedescendant",active>=0?"opt-"+active:"");}
function pick(t,focus){
  var src=t.url+(t.url.indexOf("?")>=0?"&":"?")+OPTS.embedParam+"=1";
  var formats=[
    ["agent","For your agent","Paste this into Claude Code, Cursor, Copilot or any coding agent working in your project. It explains three ways to integrate the tool and lets the agent pick the one that fits.",agentPrompt(t,OPTS)],
    ["embed","Embed","Paste this HTML wherever the tool should appear. It runs on this site, inside a frame, and computes in your visitor's browser.",'<iframe src="'+src+'" title="'+t.name+'" style="width:100%;max-width:820px;border:0;min-height:'+OPTS.embedHeight+'px" loading="lazy"></iframe>'],
    ["cli","Terminal & MCP","Run the tool with no browser. Node 18+, no install, no network after the clone.","git clone --depth 1 "+OPTS.repoUrl+".git\\nnode oss-monorepo/platform/agents/tools.mjs describe "+t.slug+"\\nnode oss-monorepo/platform/agents/tools.mjs call "+t.slug+" <function> --input '{...}'\\n\\n# or as an MCP server:\\nnode oss-monorepo/platform/agents/tools.mjs mcp"],
    ["link","Link","For a person: the tool's own page.",t.url],
    ["json","JSON","The tool's row from catalog.json, for anything that reads data.",JSON.stringify(t,null,2)]
  ];
  out.hidden=false;
  out.innerHTML='<div class="head"><span class="art">'+coverSvg(t.slug,192)+'</span><div><h2>'+esc(t.name)+'</h2><p>'+esc(t.description)+'</p><p><a href="'+esc(t.url)+'">Open the tool</a> · '+esc(t.category)+'</p></div></div>'+
    '<div class="tabs" role="tablist" aria-label="Formats">'+formats.map(function(f,i){return '<button type="button" role="tab" id="tab-'+f[0]+'" aria-controls="panel" aria-selected="'+(i===0)+'" data-f="'+i+'">'+f[1]+'</button>';}).join("")+'</div>'+
    '<div class="panel" id="panel" role="tabpanel"></div>';
  var panel=out.querySelector("#panel");
  function show(i){var f=formats[i];var tabs=out.querySelectorAll("[role=tab]");for(var k=0;k<tabs.length;k++)tabs[k].setAttribute("aria-selected",String(k===i));
    panel.setAttribute("aria-labelledby","tab-"+f[0]);
    panel.innerHTML='<p>'+esc(f[2])+'</p><button type="button" class="copy">Copy</button><pre tabindex="0">'+esc(f[3])+'</pre>';
    panel.querySelector(".copy").addEventListener("click",function(e){var b=e.currentTarget;
      var done=function(){b.textContent="Copied";setTimeout(function(){b.textContent="Copy";},1600);};
      if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(f[3]).then(done,function(){selectPre();});else selectPre();});
    function selectPre(){var r=document.createRange();r.selectNodeContents(panel.querySelector("pre"));var s=getSelection();s.removeAllRanges();s.addRange(r);}}
  out.querySelector(".tabs").addEventListener("click",function(e){var b=e.target.closest("[data-f]");if(b)show(+b.getAttribute("data-f"));});
  out.querySelector(".tabs").addEventListener("keydown",function(e){var tabs=[].slice.call(out.querySelectorAll("[role=tab]")),i=tabs.indexOf(document.activeElement);if(i<0)return;
    if(e.key==="ArrowRight"||e.key==="ArrowLeft"){e.preventDefault();var n=(i+(e.key==="ArrowRight"?1:tabs.length-1))%tabs.length;show(n);tabs[n].focus();}});
  show(0);
  if(location.hash!=="#"+t.slug)history.replaceState(null,"","#"+t.slug);
  if(focus)out.querySelector("h2").setAttribute("tabindex","-1"),out.querySelector("h2").focus();}
input.addEventListener("input",render);
input.addEventListener("keydown",function(e){
  if(e.key==="ArrowDown"&&shown.length){e.preventDefault();active=(active+1)%shown.length;highlight();}
  else if(e.key==="ArrowUp"&&shown.length){e.preventDefault();active=(active+shown.length-1)%shown.length;highlight();}
  else if(e.key==="Enter"&&active>=0){e.preventDefault();pick(shown[active],true);}});
list.addEventListener("click",function(e){var b=e.target.closest("[data-i]");if(b)pick(shown[+b.getAttribute("data-i")],true);});
document.addEventListener("keydown",function(e){if(e.key==="/"&&document.activeElement!==input&&!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)){e.preventDefault();input.focus();}});
fetch("../../catalog.json").then(function(r){if(!r.ok)throw new Error(r.status);return r.json();}).then(function(c){
  tools=c.tools||[];input.disabled=false;input.placeholder="Search "+tools.length.toLocaleString("en-US")+" tools, e.g. roof bid, 1099, CI minutes";
  var slug=decodeURIComponent(location.hash.slice(1));var t=tools.filter(function(x){return x.slug===slug;})[0];if(t)pick(t,false);
  if(input.value)render();
}).catch(function(){status.textContent="The tool list (catalog.json) could not be loaded, so search is unavailable. Every tool is still listed at ../../c/.";});
})();`;
}

export function renderHandoffPage() {
  return page({
    title: 'Hand it to your agent — take any tool into your own project',
    description: 'Pick any of the free tools and get it as a link, an embed, terminal and MCP commands, or a ready-to-paste prompt that tells a coding agent how to integrate it into your project.',
    toRoot: '../../',
    crumbs: [{ label: 'Lab', href: '../' }, { label: 'Hand it to your agent' }],
    extraStyle: HANDOFF_STYLE,
    body: `<div class="wrap">
<section class="hero">
<span class="eyebrow">Lab experiment · live</span>
<h1>Hand it to your agent</h1>
<p class="lede">Find a tool, then take it with you: a link for a person, an embed for a website, commands for a terminal or MCP client, or one prompt you paste into your coding agent that tells it exactly how to put the tool into your project, with the license and disclaimer intact.</p>
</section>
<div class="finder">
<label for="q" class="hint">Search the catalogue (press <kbd>/</kbd> to jump here, <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>Enter</kbd> to choose)</label>
<input id="q" type="search" role="combobox" aria-expanded="true" aria-controls="results" aria-autocomplete="list" autocomplete="off" spellcheck="false" placeholder="Loading the tool list…" disabled>
<ul id="results" class="results" role="listbox" aria-label="Matching tools"></ul>
<p id="status" class="hint" role="status" aria-live="polite"></p>
</div>
<section id="picked" class="picked" hidden aria-live="polite"></section>
<noscript><p class="lede">This page needs JavaScript to search. The same information is in <a href="../../catalog.json">catalog.json</a> and <a href="../../llms.txt">llms.txt</a>, and every tool is listed at <a href="../../c/">All tools by category</a>.</p></noscript>
</div>
<script>${handoffScript()}</script>`,
  });
}

export async function buildLab(outDir) {
  const dir = path.join(outDir, LAB_PATH);
  await fs.mkdir(path.join(dir, 'handoff'), { recursive: true });
  await fs.writeFile(path.join(dir, 'index.html'), renderLabIndex());
  await fs.writeFile(path.join(dir, 'handoff', 'index.html'), renderHandoffPage());
  return EXPERIMENTS;
}

const invokedDirectly = process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]));
if (invokedDirectly) {
  const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const out = arg('out') ?? path.join(path.dirname(new URL(import.meta.url).pathname), 'dist');
  const experiments = await buildLab(out);
  console.log(`lab: wrote ${path.join(out, LAB_PATH)} (${experiments.filter((x) => x.status === 'live').length} live, ${experiments.filter((x) => x.status === 'idea').length} ideas)`);
}
