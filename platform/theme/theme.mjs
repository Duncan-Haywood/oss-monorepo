// Universal light/dark mode for every page the site serves (owner,
// 2026-11-28: "we want universal dark/light mode").
//
// Before this, each page answered `prefers-color-scheme` on its own or not at
// all: site pages and some ventures followed the OS, most ventures were
// light-only, and nobody could choose. This pass runs over the built site
// (`node platform/theme/apply.mjs <dist>`) and gives every HTML page:
//
//   1. A boot script, first in <head>, that reads the visitor's choice
//      (Auto / Light / Dark, in localStorage under THEME_KEY) and sets
//      `data-theme` on <html> before anything paints. It also answers
//      `matchMedia('(prefers-color-scheme: …)')` with the choice, so a
//      page's own script (a chart palette, the venture chrome's measurement)
//      follows it too.
//   2. Its stylesheets rewritten (rewriteSchemeCss) so every
//      `@media (prefers-color-scheme: dark)` block also applies under an
//      explicit Dark and stops applying under an explicit Light, without
//      changing any selector's specificity (the added condition is in
//      `:where()`).
//   3. A fallback for pages with no dark styles of their own: under Dark
//      (chosen, or Auto on a dark OS) the page is drawn inverted with its
//      hues kept, and pictures, video and canvases are inverted back, so a
//      light-only tool is still dark rather than a white slab. A page that
//      designs its own dark mode is marked `data-theme-native` and never
//      inverted.
//   4. The Auto / Light / Dark control, added by pf-theme.js to the footer.
//
// Nothing is sent anywhere: the choice stays in the visitor's browser (the
// cookie policy lists it).

export const THEME_KEY = 'pfs-theme';
export const THEME_SCRIPT_FILE = 'pf-theme.js';
export const BOOT_MARKER = 'data-pfs-theme-boot';
export const NATIVE_ATTR = 'data-theme-native';
export const FALLBACK_ATTR = 'data-theme-fallback';

const SCHEME = /prefers-color-scheme\s*:\s*(dark|light)/i;

// ---------------------------------------------------------------------------
// CSS rewrite
// ---------------------------------------------------------------------------

/** Index just past a comment or string starting at `i`, or -1 when none starts there. */
function skipOpaque(css, i) {
  if (css[i] === '/' && css[i + 1] === '*') {
    const end = css.indexOf('*/', i + 2);
    return end === -1 ? css.length : end + 2;
  }
  const q = css[i];
  if (q === '"' || q === "'") {
    let j = i + 1;
    while (j < css.length && css[j] !== q) {
      if (css[j] === '\\') j += 1;
      else if (css[j] === '\n') break;
      j += 1;
    }
    return Math.min(j + 1, css.length);
  }
  return -1;
}

/** Index of the `}` matching the `{` at `open` (css.length when unbalanced). */
function matchBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; ) {
    const skip = skipOpaque(css, i);
    if (skip !== -1) {
      i = skip;
      continue;
    }
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  return css.length;
}

/**
 * Split a stylesheet (or a block's contents) into top-level statements:
 * `{ kind: 'block', prelude, body }` for `x { … }` and `@x … { … }`, and
 * `{ kind: 'raw', text }` for everything else (whitespace, comments,
 * `@import …;`, declarations). Joining `raw.text` and
 * `prelude + '{' + body + '}'` gives the input back exactly.
 */
export function parseBlocks(css) {
  const out = [];
  let start = 0;
  let i = 0;
  while (i < css.length) {
    const skip = skipOpaque(css, i);
    if (skip !== -1) {
      i = skip;
      continue;
    }
    const c = css[i];
    if (c === ';' || c === '}') {
      // A statement without a block (or a stray brace): keep it as text.
      out.push({ kind: 'raw', text: css.slice(start, i + 1) });
      start = i + 1;
      i += 1;
      continue;
    }
    if (c === '{') {
      const close = matchBrace(css, i);
      const preludeFull = css.slice(start, i);
      // Leading whitespace and comments stay raw, so a prelude is just the selector or at-rule.
      const lead = /^(\s|\/\*[\s\S]*?\*\/)*/.exec(preludeFull)[0];
      if (lead) out.push({ kind: 'raw', text: lead });
      out.push({ kind: 'block', prelude: preludeFull.slice(lead.length), body: css.slice(i + 1, close) });
      i = close + 1;
      start = i;
      continue;
    }
    i += 1;
  }
  if (start < css.length) out.push({ kind: 'raw', text: css.slice(start) });
  return out;
}

/** Split a selector list on its top-level commas. */
export function splitSelectors(list) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; ) {
    const skip = skipOpaque(list, i);
    if (skip !== -1) {
      i = skip;
      continue;
    }
    const c = list[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  parts.push(list.slice(start));
  return parts;
}

/**
 * One selector, scoped to `<html>` matching `cond` (an attribute condition
 * such as `[data-theme="dark"]`), with its specificity unchanged.
 */
export function scopeSelector(sel, cond) {
  const lead = /^\s*/.exec(sel)[0];
  const tail = /\s*$/.exec(sel)[0];
  const s = sel.slice(lead.length, sel.length - tail.length);
  if (s === '') return sel;
  let m = /^:root(?![\w-])/i.exec(s);
  if (m) return `${lead}:root:where(${cond})${s.slice(m[0].length)}${tail}`;
  m = /^html(?![\w-])/i.exec(s);
  if (m) return `${lead}html:where(${cond})${s.slice(m[0].length)}${tail}`;
  return `${lead}:where(:root${cond}) ${s}${tail}`;
}

const RECURSE_AT = /^@(media|supports|layer|container|document|-moz-document|scope|starting-style)\b/i;

/** Scope every style rule in `body` (recursing into conditional at-rules). */
function scopeBody(body, cond) {
  return parseBlocks(body)
    .map((n) => {
      if (n.kind === 'raw') return n.text;
      const p = n.prelude.trim();
      if (p.startsWith('@')) {
        if (RECURSE_AT.test(p)) return `${n.prelude}{${scopeBody(n.body, cond)}}`;
        return `${n.prelude}{${n.body}}`; // @keyframes, @font-face, @page, @property: as they are
      }
      return `${splitSelectors(n.prelude).map((s) => scopeSelector(s, cond)).join(',')}{${n.body}}`;
    })
    .join('');
}

/**
 * Read a media prelude. Returns `{ scheme, rest }` when it is a plain
 * conjunction containing exactly one `(prefers-color-scheme: x)` (rest is the
 * remaining conditions, '' when none), or null for anything else (lists,
 * `not`, `or`), which is left as written.
 */
export function readSchemeQuery(prelude) {
  const q = prelude.replace(/^@media\b/i, '').trim();
  if (!SCHEME.test(q)) return null;
  if (/,|\bnot\b|\bor\b|\bonly\b/i.test(q)) return null;
  const parts = q.split(/\s+and\s+/i);
  const hits = parts.filter((p) => /^\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/i.test(p.trim()));
  if (hits.length !== 1) return null;
  const scheme = SCHEME.exec(hits[0])[1].toLowerCase();
  const rest = parts.filter((p) => p !== hits[0]).join(' and ').trim();
  return { scheme, rest: /^(all)?$/i.test(rest) ? '' : rest };
}

/**
 * Make a stylesheet's `prefers-color-scheme` blocks obey the visitor's
 * choice. Each `@media (prefers-color-scheme: dark) { R }` becomes
 *
 *   @media (prefers-color-scheme: dark) { R, unless <html data-theme="light"> }
 *   R, when <html data-theme="dark">
 *
 * in the same place, so the cascade order is the original's (and the same
 * for `light`). Idempotent: a block already rewritten is not touched again.
 */
export function rewriteSchemeCss(css) {
  if (!SCHEME.test(css)) return css;
  return parseBlocks(css)
    .map((n) => {
      if (n.kind === 'raw') return n.text;
      const p = n.prelude.trim();
      if (!p.startsWith('@')) return `${n.prelude}{${n.body}}`;
      if (/^@media\b/i.test(p)) {
        const q = readSchemeQuery(p);
        if (q) {
          if (n.body.includes('[data-theme=')) return `${n.prelude}{${n.body}}`; // already done
          const other = q.scheme === 'dark' ? 'light' : 'dark';
          const auto = `${n.prelude}{${scopeBody(n.body, `:not([data-theme="${other}"])`)}}`;
          const forcedBody = scopeBody(n.body, `[data-theme="${q.scheme}"]`);
          const forced = q.rest ? `@media ${q.rest}{${forcedBody}}` : forcedBody;
          return auto + forced;
        }
      }
      if (RECURSE_AT.test(p)) return `${n.prelude}{${rewriteSchemeCss(n.body)}}`;
      return `${n.prelude}{${n.body}}`;
    })
    .join('');
}

/** True when the stylesheet styles a dark scheme itself. */
export function hasDarkStyles(css) {
  return /prefers-color-scheme\s*:\s*dark/i.test(css) || /\[data-theme=["']?dark/i.test(css);
}

// ---------------------------------------------------------------------------
// What goes into each page
// ---------------------------------------------------------------------------

/**
 * The fallback for pages without dark styles: invert the page, keep hues,
 * and invert pictures back. `invert(.9)` rather than 1 keeps white from
 * becoming pure black and black text from becoming pure white (about 15:1
 * instead of 21:1, easier on the eyes). Elements meant to be dark in both
 * schemes (the site footer band, the homepage hero) are inverted back too.
 * A filter on the root element does not become the containing block of its
 * fixed descendants (Filter Effects 1, section 5), so sticky bars stay put.
 */
const FALLBACK_SELECTOR_ON = `html[${FALLBACK_ATTR}]`;
const REINVERT = 'img,picture,video,canvas,iframe,embed,object,svg image,[data-theme-keep],footer:has(.pfs-foot),.pf-hero';
const fallbackRules = (root) =>
  `${root}{filter:invert(.9) hue-rotate(180deg)}` +
  `${root} :is(${REINVERT}){filter:invert(1) hue-rotate(180deg)}` +
  `${root} :is(${REINVERT}) :is(${REINVERT}){filter:none}`;

export const THEME_HEAD_CSS =
  `:root[data-theme="dark"]:not([${FALLBACK_ATTR}]){color-scheme:dark}` +
  `:root[data-theme="light"]{color-scheme:light}` +
  `@media (prefers-color-scheme:dark){${fallbackRules(`${FALLBACK_SELECTOR_ON}:not([data-theme="light"])`)}}` +
  fallbackRules(`${FALLBACK_SELECTOR_ON}[data-theme="dark"]`) +
  `@media print{html[${FALLBACK_ATTR}]{filter:none!important}}`;

/**
 * The boot script: first thing in <head>, synchronous, so the page's first
 * paint is already in the chosen scheme. It defines `window.pfsTheme`
 * (get/set/subscribe) for pf-theme.js and answers colour-scheme media
 * queries with the choice.
 */
export const THEME_BOOT_JS = `(function(){var d=document.documentElement,K=${JSON.stringify(THEME_KEY)},w=window,subs=[],t='auto';
function rd(){var v;try{v=localStorage.getItem(K)}catch(e){}return v==='light'||v==='dark'?v:'auto'}
var omm=w.matchMedia&&w.matchMedia.bind(w),os=omm?omm('(prefers-color-scheme: dark)'):null;
function eff(){return t==='auto'?(os&&os.matches?'dark':'light'):t}
function ap(){if(t==='auto')d.removeAttribute('data-theme');else d.setAttribute('data-theme',t);
d.style.colorScheme=t==='auto'||d.hasAttribute('${FALLBACK_ATTR}')?'':t}
function fire(){for(var i=0;i<subs.length;i++)try{subs[i]()}catch(e){}}
t=rd();ap();
w.pfsTheme={get:function(){return t},effective:eff,set:function(v){t=v==='light'||v==='dark'?v:'auto';try{if(t==='auto')localStorage.removeItem(K);else localStorage.setItem(K,t)}catch(e){}ap();fire()},on:function(f){subs.push(f)}};
if(os){var oc=function(){if(t==='auto')fire()};if(os.addEventListener)os.addEventListener('change',oc);else if(os.addListener)os.addListener(oc)}
try{w.addEventListener('storage',function(e){if(e.key===K){t=rd();ap();fire()}})}catch(e){}
if(omm)w.matchMedia=function(q){var m=/^\\s*\\(?\\s*prefers-color-scheme\\s*:\\s*(dark|light)\\s*\\)?\\s*$/i.exec(String(q));if(!m)return omm(q);
var want=m[1].toLowerCase(),ls=[],o={media:String(q),onchange:null,addListener:function(f){ls.push(f)},removeListener:function(f){ls=ls.filter(function(x){return x!==f})},
addEventListener:function(ty,f){if(ty==='change')ls.push(f)},removeEventListener:function(ty,f){if(ty==='change')o.removeListener(f)},dispatchEvent:function(){return true}};
Object.defineProperty(o,'matches',{get:function(){return eff()===want},enumerable:true});
var last=o.matches;subs.push(function(){var now=o.matches;if(now===last)return;last=now;var ev={matches:now,media:o.media};ls.slice().forEach(function(f){try{f.call(o,ev)}catch(e){}});if(typeof o.onchange==='function')try{o.onchange(ev)}catch(e){}});
return o}})();`;

/**
 * pf-theme.js: the Auto / Light / Dark control. It goes at the end of the
 * site footer (or the venture footer), else at the end of the page, and is
 * styled from currentColor so it sits on any footer's colours. It also
 * checks a fallback page really is light: a page that is dark by design but
 * has no `prefers-color-scheme` rule is switched to native rather than
 * inverted into a light one.
 */
export const THEME_UI_JS = `(function(){
var T=window.pfsTheme,d=document.documentElement;if(!T||!document.querySelector)return;
function lum(node){for(;node&&node.nodeType===1;node=node.parentElement){var m=/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?/.exec(getComputedStyle(node).backgroundColor||'');
if(m&&(m[4]===undefined||+m[4]>0.5)){var l=function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*l(+m[1])+0.7152*l(+m[2])+0.0722*l(+m[3])}}return 1}
if(d.hasAttribute('${FALLBACK_ATTR}')&&document.body&&lum(document.body)<0.18){d.removeAttribute('${FALLBACK_ATTR}');d.setAttribute('${NATIVE_ATTR}','dark-only');T.set(T.get())}
if(document.querySelector('.pfs-theme'))return;
var st=document.createElement('style');st.textContent='.pfs-theme{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:14px 0 0;padding:0;font:inherit;font-size:14px;color:inherit}'+
'aside.pf-chrome-foot>.pfs-theme{max-width:1080px;margin-inline:auto;padding:0 16px}'+
'.pfs-theme-l{opacity:.8}.pfs-theme-g{display:inline-flex;border:1px solid color-mix(in srgb,currentColor 45%,transparent);border-radius:999px;padding:2px;gap:2px}'+
'.pfs-theme button{font:inherit;font-size:13px;line-height:1.2;color:inherit;background:none;border:0;border-radius:999px;padding:5px 12px;min-height:30px;cursor:pointer}'+
'.pfs-theme button[aria-pressed="true"]{font-weight:700;box-shadow:inset 0 0 0 1.5px currentColor}'+
'.pfs-theme button:focus-visible{outline:2px solid currentColor;outline-offset:2px}@media print{.pfs-theme{display:none}}';
document.head.appendChild(st);
var box=document.createElement('div');box.className='pfs-theme';
box.innerHTML='<span class="pfs-theme-l" id="pfs-theme-l">Theme</span><span class="pfs-theme-g" role="group" aria-labelledby="pfs-theme-l"></span>';
var g=box.lastChild,opts=[['auto','Auto'],['light','Light'],['dark','Dark']],btns=[];
opts.forEach(function(o){var b=document.createElement('button');b.type='button';b.setAttribute('data-v',o[0]);
b.title=o[0]==='auto'?'Follow your device setting':o[1]+' theme on every page';b.textContent=o[1];
b.addEventListener('click',function(){T.set(o[0])});g.appendChild(b);btns.push(b)});
function sync(){var t=T.get();btns.forEach(function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===t))})}
sync();T.on(sync);
var host=document.querySelector('aside.pf-chrome-foot')||document.querySelector('footer:has(.pfs-foot)')||document.querySelector('body>footer:last-of-type');
if(!host){host=document.createElement('div');host.style.cssText='padding:12px 0 24px';document.body.appendChild(host)}
host.appendChild(box);
})();`;

/** The <script> for <head>; carries the CSS too, so one insertion is the whole boot. */
export function bootTag() {
  return `<style ${BOOT_MARKER}>${THEME_HEAD_CSS}</style><script ${BOOT_MARKER}>${THEME_BOOT_JS}</script>`;
}
