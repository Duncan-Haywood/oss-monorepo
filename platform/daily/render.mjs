// HTML for the daily brief and The Merge Report. Static pages, readable with
// no script; the "Listen" player is progressive enhancement on the browser's
// own speech synthesis (Web Speech API), so audio costs nothing to make, host
// or play, and nothing leaves the visitor's device.

import { withSiteHeader } from '../pages/site-nav.mjs';
import { longDate } from './compose.mjs';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const REPO_URL = 'https://github.com/Duncan-Haywood/oss-monorepo';
const prLink = (n) => (n ? ` <a class="pr" href="${REPO_URL}/pull/${n}">#${n}</a>` : '');

function blockHtml(b) {
  if (b.items) return `<ul>${b.items.map((i) => `<li data-say>${esc(i.text)}${prLink(i.pr)}</li>`).join('')}</ul>`;
  return `<p data-say>${esc(b.text)}</p>`;
}

export function sectionsHtml(script) {
  return script.sections
    .map((s) => `<section id="${esc(s.id)}"><h2 data-say>${esc(s.heading)}</h2>\n${s.blocks.map(blockHtml).join('\n')}${s.pr ? `<p class="meta">Pull request${prLink(s.pr)}</p>` : ''}</section>`)
    .join('\n');
}

// The player. Speaks [data-say] elements in page order, a sentence at a time
// (Chrome drops utterances longer than ~15 s), highlights what it is reading,
// and leaves PR numbers out of the audio. Counts a listen in the same local,
// opt-out-able tally the rest of the site uses (pf-site.js).
const PLAYER_JS = `
(function(){
  var bar=document.getElementById('listen');
  if(!bar)return;
  if(!('speechSynthesis' in window)||typeof SpeechSynthesisUtterance==='undefined'){bar.querySelector('.unsupported').hidden=false;return;}
  bar.querySelector('.controls').hidden=false;
  var synth=window.speechSynthesis,play=bar.querySelector('[data-act=play]'),stop=bar.querySelector('[data-act=stop]');
  var rate=bar.querySelector('select[name=rate]'),voiceSel=bar.querySelector('select[name=voice]'),status=bar.querySelector('.status');
  var queue=[],idx=0,state='idle',current=null,counted=false;
  function spoken(el){
    var c=el.cloneNode(true);c.querySelectorAll('.pr').forEach(function(x){x.remove();});
    return c.textContent.replace(/#(\\d+)/g,'number $1').replace(/([A-Za-z])[-_\\/]([A-Za-z0-9])/g,'$1 $2').replace(/([A-Za-z])[-_\\/]([A-Za-z0-9])/g,'$1 $2').replace(/\\s+/g,' ').trim();
  }
  function build(){
    queue=[];
    document.querySelectorAll('main [data-say]').forEach(function(el){
      var t=spoken(el);if(!t)return;
      (t.match(/[^.!?…]+[.!?…]*[\\u201d"']?\\s*/g)||[t]).forEach(function(s){if(s.trim())queue.push({el:el,text:s.trim()});});
    });
  }
  function voices(){
    var vs=synth.getVoices().filter(function(v){return /^en/i.test(v.lang);});
    var keep=voiceSel.value;voiceSel.innerHTML='<option value="">Device default</option>';
    vs.forEach(function(v){var o=document.createElement('option');o.value=v.name;o.textContent=v.name+' ('+v.lang+')';voiceSel.appendChild(o);});
    voiceSel.value=keep;
  }
  voices();if(typeof synth.onvoiceschanged!=='undefined')synth.onvoiceschanged=voices;
  function mark(el){if(current)current.classList.remove('speaking');current=el;if(el){el.classList.add('speaking');var r=el.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)el.scrollIntoView({block:'center',behavior:'smooth'});}}
  function next(){
    if(state!=='playing')return;
    if(idx>=queue.length){reset();status.textContent='Finished.';return;}
    var item=queue[idx],u=new SpeechSynthesisUtterance(item.text);
    u.rate=parseFloat(rate.value)||1;u.lang='en-GB';
    var v=synth.getVoices().filter(function(x){return x.name===voiceSel.value;})[0];if(v){u.voice=v;u.lang=v.lang;}
    u.onend=function(){if(state==='playing'){idx++;next();}};
    u.onerror=function(e){if(e.error==='interrupted'||e.error==='canceled')return;idx++;next();};
    mark(item.el);status.textContent=Math.min(100,Math.round(idx/queue.length*100))+'%';
    synth.speak(u);
  }
  function reset(){synth.cancel();state='idle';idx=0;mark(null);play.textContent='\\u25B6 Listen';stop.disabled=true;}
  play.addEventListener('click',function(){
    if(state==='playing'){synth.pause();state='paused';play.textContent='\\u25B6 Resume';return;}
    if(state==='paused'){state='playing';synth.resume();if(!synth.speaking){next();}play.textContent='\\u23F8 Pause';return;}
    build();synth.cancel();state='playing';idx=0;play.textContent='\\u23F8 Pause';stop.disabled=false;
    if(!counted){counted=true;try{var k='portfolio-hub-usage',c=JSON.parse(localStorage.getItem(k)||'{}');var e='daily_listen:'+bar.getAttribute('data-kind');c[e]=(c[e]||0)+1;localStorage.setItem(k,JSON.stringify(c));}catch(err){}}
    next();
  });
  stop.addEventListener('click',function(){reset();status.textContent='';});
  rate.addEventListener('change',function(){if(state==='playing'){synth.cancel();next();}});
  addEventListener('pagehide',function(){synth.cancel();});
})();
`;

const STYLE = `
  :root { --bg:#f6f8fb; --panel:#fff; --ink:#1d2530; --muted:#556275; --line:#d9e0e8; --accent:#2a5bd7; --hl:#fff3c4; }
  @media (prefers-color-scheme: dark) { :root { --bg:#10151c; --panel:#171e27; --ink:#e8eef5; --muted:#a2b0c0; --line:#2a3542; --accent:#7aa2ff; --hl:#3b3416; } }
  body { margin:0; background:var(--bg); color:var(--ink); font:17px/1.6 system-ui, -apple-system, Segoe UI, sans-serif; }
  .wrap { max-width:760px; margin:0 auto; padding:24px 16px 56px; }
  a { color:var(--accent); }
  h1 { margin:.2em 0 .1em; line-height:1.25; } h2 { margin-top:1.8em; font-size:1.2rem; }
  .kicker { text-transform:uppercase; letter-spacing:.06em; font-size:.78rem; color:var(--muted); margin:0; }
  .meta, .note { color:var(--muted); font-size:.9rem; }
  .listen { position:sticky; top:0; z-index:5; background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:10px 12px; margin:16px 0 8px; display:flex; flex-wrap:wrap; gap:8px 12px; align-items:center; }
  .listen .controls { display:flex; flex-wrap:wrap; gap:8px; align-items:center; }
  .listen button { font:inherit; padding:6px 14px; border-radius:8px; border:1px solid var(--line); background:var(--accent); color:#fff; cursor:pointer; }
  .listen button[data-act=stop] { background:transparent; color:var(--ink); }
  .listen button:disabled { opacity:.5; cursor:default; }
  .listen select { font:inherit; font-size:.9rem; max-width:220px; padding:4px; border-radius:6px; border:1px solid var(--line); background:var(--panel); color:var(--ink); }
  .listen .status, .listen .unsupported { color:var(--muted); font-size:.85rem; }
  .speaking { background:var(--hl); border-radius:4px; box-shadow:0 0 0 4px var(--hl); }
  .switch { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
  .switch a { padding:4px 12px; border:1px solid var(--line); border-radius:999px; text-decoration:none; font-size:.9rem; background:var(--panel); }
  .switch a[aria-current] { background:var(--accent); color:#fff; border-color:var(--accent); }
  li { margin:.35em 0; } .pr { font-size:.85em; white-space:nowrap; }
  .archive { columns:2 220px; padding-left:1.1em; }
  .disclaimer { margin-top:2.5em; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--panel); }
`;

const KIND = {
  brief: { label: 'Engineering brief', path: '', blurb: 'A morning brief for the engineering manager of the whole repository: CI and main, owner decisions, every product and research project that moved, the agent fleet and a watch list.' },
  show: { label: 'The Merge Report', path: 'show/', blurb: 'A light daily show about what an open-source studio of AI agents merged: the headline change, new products, research, plot twists and the numbers.' },
};

/**
 * One edition page. `toDaily` is the relative path from this page to dev/daily/.
 * `archive` lists every edition day, newest first.
 */
export function renderEdition(script, { toDaily, archive, latest = false, generatedAt, toRoot, baseUrl }) {
  const k = KIND[script.kind];
  const other = script.kind === 'brief' ? 'show' : 'brief';
  const dayDir = latest ? '' : `${script.day}/`;
  const canonical = `${String(baseUrl).replace(/\/$/, '')}/dev/daily/${script.day}/${k.path}`;
  const switchHtml = ['brief', 'show']
    .map((kind) => `<a href="${toDaily}${dayDir}${KIND[kind].path}"${kind === script.kind ? ' aria-current="page"' : ''}>${KIND[kind].label}</a>`)
    .join('');
  const archiveHtml = archive
    .map((d) => `<li><a href="${toDaily}${d}/${k.path}">${esc(longDate(d))}</a></li>`)
    .join('');
  const description = `${k.label} for ${longDate(script.day)}: ${k.blurb} About ${script.minutes} minutes to read or listen.`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: script.title,
    datePublished: script.day,
    description,
    isAccessibleForFree: true,
    author: { '@type': 'Organization', name: 'monorepo-projects' },
    url: canonical,
  };
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(script.title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" type="application/atom+xml" title="Daily engineering brief and The Merge Report" href="${toDaily}feed.xml">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
<style>${STYLE}</style>
</head>
<body>
<main class="wrap">
  <p class="kicker">${esc(k.label)} · ${esc(longDate(script.day))}</p>
  <h1>${esc(script.title)}</h1>
  <p class="meta">About ${script.minutes} minutes aloud (${script.words.toLocaleString('en-US')} words). ${esc(k.blurb)}</p>
  <nav class="switch" aria-label="Edition">${switchHtml}</nav>
  <div class="listen" id="listen" data-kind="${script.kind}">
    <div class="controls" hidden>
      <button type="button" data-act="play">&#9654; Listen</button>
      <button type="button" data-act="stop" disabled>Stop</button>
      <label>Speed <select name="rate"><option value="0.9">0.9×</option><option value="1" selected>1×</option><option value="1.15">1.15×</option><option value="1.3">1.3×</option><option value="1.5">1.5×</option></select></label>
      <label>Voice <select name="voice"><option value="">Device default</option></select></label>
      <span class="status" aria-live="polite"></span>
    </div>
    <span class="unsupported" hidden>This browser cannot read aloud; the full script is below.</span>
    <noscript><span class="status">Listening needs JavaScript; the full script is below.</span></noscript>
  </div>
${sectionsHtml(script)}
  <h2>Other days</h2>
  <ul class="archive">${archiveHtml}</ul>
  <p class="meta">Also: <a href="${toDaily}${dayDir}${KIND[other].path}">${KIND[other].label} for this day</a> · <a href="${toDaily}../">Development dashboard</a> · <a href="${toDaily}feed.xml">Atom feed</a> · <a href="${toDaily}${script.day}/facts.json">The facts behind this page (JSON)</a></p>
  <div class="disclaimer note">
    <strong>How this is made.</strong> Written automatically, by a template and not by a person or a language model, from this repository’s git history, its agent run records, the owner’s decision queue and, for the newest edition, a CI snapshot taken when the site was built (${esc(String(generatedAt).slice(0, 16).replace('T', ' '))} UTC). Titles are quoted from pull requests as their authors wrote them. Costs are API-list-price equivalents, not charges. The audio is your own device’s speech synthesis: nothing is uploaded. Informational only; nothing here is advice.
  </div>
</main>
<script src="${toRoot}pf-site.js" data-pf-slug="dev-daily-${script.kind}"></script>
<script>${PLAYER_JS}</script>
</body>
</html>
`;
  return withSiteHeader(html, { toRoot, crumbs: [{ href: `${toDaily}../`, label: 'Development dashboard' }, { href: toDaily, label: 'Daily' }, { label: k.label }] });
}

/** An Atom feed of every edition of both kinds, newest first. */
export function renderFeed(editions, { baseUrl, generatedAt }) {
  const base = `${String(baseUrl).replace(/\/$/, '')}/dev/daily/`;
  const entries = editions.flatMap(({ brief, show }) => [brief, show]).map((s) => {
    const url = `${base}${s.day}/${KIND[s.kind].path}`;
    const summary = s.sections[0]?.blocks.filter((b) => b.text).map((b) => b.text).slice(0, 3).join(' ') ?? '';
    return `  <entry>
    <title>${esc(s.title)}</title>
    <link href="${esc(url)}"/>
    <id>${esc(url)}</id>
    <updated>${s.day}T23:59:59Z</updated>
    <summary>${esc(summary)}</summary>
  </entry>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Daily engineering brief and The Merge Report</title>
  <subtitle>What an open-source monorepo built mostly by AI agents merged each day, for its engineering manager and for everyone else.</subtitle>
  <link href="${esc(base)}"/>
  <link rel="self" href="${esc(base)}feed.xml"/>
  <id>${esc(base)}</id>
  <updated>${esc(generatedAt)}</updated>
  <author><name>monorepo-projects</name></author>
${entries.join('\n')}
</feed>
`;
}
