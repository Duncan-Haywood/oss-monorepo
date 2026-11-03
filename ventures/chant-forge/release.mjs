// Release kit: checks a release.json (and the files it names) before a distributor upload.
// Rules here are the common distributor/DSP ones; each check says what it tests. Not legal advice.
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { readWav, analyze } from './master.mjs';

// ISRC: 12 chars, CC (country, letters) + XXX (registrant, alnum) + YY (year) + NNNNN (digits); hyphens are display only.
export function isrcOk(s) { return /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(String(s || '').replace(/-/g, '').toUpperCase()); }
// UPC-A (12) / EAN-13 (13): GS1 mod-10 check digit, weights 3,1 from the right of the data digits.
export function gtinOk(s) {
  s = String(s || ''); if (!/^\d{12}$|^\d{13}$/.test(s)) return false;
  const d = s.split('').map(Number), c = d.pop();
  const sum = d.reverse().reduce((a, v, i) => a + v * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === c;
}
// Image size from PNG or JPEG bytes, no dependencies.
export function imageSize(b) {
  if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) return { type: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1], len = b.readUInt16BE(i + 2);
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { type: 'jpeg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  }
  return null;
}
const AI_LEVELS = ['none', 'assisted', 'generated'];
const PD_OK = /public.?domain|pd\b|cc0/i;

export function checkRelease(rel, baseDir = '.', opts = {}) {
  const out = [];
  const add = (ok, name, note, level = 'FAIL') => out.push({ ok, level: ok ? 'PASS' : level, name, note });
  const t = (rel.title || '').trim();
  add(!!t, 'title', t || 'missing');
  add(!!(rel.artist || '').trim(), 'artist', rel.artist || 'missing');
  add(!/\b(feat\.?|ft\.?)\b/i.test(t), 'title has no featured-artist text', 'put featured artists in the artist field, not the title', 'WARN');
  add(!!rel.type && ['single', 'ep', 'album'].includes(rel.type), 'release type', rel.type || 'missing (single, ep or album)');
  const n = (rel.tracks || []).length;
  const lim = { single: [1, 3], ep: [4, 6], album: [7, 99] }[rel.type];
  if (lim) add(n >= lim[0] && n <= lim[1], 'track count fits type', `${n} tracks as ${rel.type}`, 'WARN');
  add(/^\d{4}-\d{2}-\d{2}$/.test(rel.releaseDate || ''), 'release date', rel.releaseDate || 'missing (YYYY-MM-DD)');
  if (/^\d{4}-\d{2}-\d{2}$/.test(rel.releaseDate || '') && opts.today) {
    const days = (Date.parse(rel.releaseDate) - Date.parse(opts.today)) / 864e5;
    add(days >= 7, 'release date at least 7 days out', `${days} days (distributors ask for lead time for playlist pitching)`, 'WARN');
  }
  add(/^(℗|\(P\)|P) ?\d{4} .+/.test(rel.pLine || ''), 'p-line', rel.pLine || 'missing, e.g. "℗ 2026 Name"');
  add(/^(©|\(C\)|C) ?\d{4} .+/.test(rel.cLine || ''), 'c-line', rel.cLine || 'missing, e.g. "© 2026 Name"');
  add(!!rel.label || true, 'label', rel.label || 'none (distributor default)', 'WARN');
  if (rel.upc) add(gtinOk(rel.upc), 'UPC/EAN check digit', rel.upc); else add(true, 'UPC/EAN', 'none given; the distributor assigns one');

  // cover art
  if (!rel.cover) add(false, 'cover art', 'missing');
  else {
    const p = resolve(baseDir, rel.cover);
    if (!existsSync(p)) add(false, 'cover art file', `${rel.cover} not found`);
    else {
      const s = imageSize(readFileSync(p));
      if (!s) add(false, 'cover art format', 'not a PNG or JPEG');
      else {
        add(s.w === s.h, 'cover is square', `${s.w}x${s.h}`);
        add(s.w >= 3000, 'cover at least 3000 px', `${s.w} px (3000x3000 is what the big stores ask for; 1400 is the floor some accept)`, s.w >= 1400 ? 'WARN' : 'FAIL');
      }
    }
  }

  // AI disclosure
  const ai = rel.aiDisclosure || {};
  add(AI_LEVELS.includes(ai.level), 'AI disclosure level', ai.level || `missing (${AI_LEVELS.join(' | ')})`);
  if (ai.level && ai.level !== 'none') add(!!(ai.tools || '').trim() && !!(ai.parts || '').trim(), 'AI disclosure names tools and parts', 'say which tools and which parts (vocals, instruments, arrangement, artwork)');
  if (ai.level === 'none' && /synth|vocal model|ai/i.test(JSON.stringify(rel.credits || []))) add(false, 'AI level matches credits', 'credits mention AI or a voice model but the level is "none"');

  // tracks
  const seenIsrc = new Set();
  (rel.tracks || []).forEach((tr, i) => {
    const k = `track ${i + 1}`;
    add(!!(tr.title || '').trim(), `${k} title`, tr.title || 'missing');
    add(isrcOk(tr.isrc), `${k} ISRC`, tr.isrc || 'missing (the distributor can issue one; then leave a placeholder out and fill it in here)', 'FAIL');
    if (tr.isrc) { const u = tr.isrc.replace(/-/g, '').toUpperCase(); add(!seenIsrc.has(u), `${k} ISRC unique`, u); seenIsrc.add(u); }
    add(['la', 'en', 'zxx'].includes(tr.language), `${k} language`, tr.language || 'missing (la, en or zxx for instrumental)', 'WARN');
    add(typeof tr.explicit === 'boolean', `${k} explicit flag`, String(tr.explicit), 'FAIL');
    // composition source
    const src = tr.source || {};
    add(!!src.edition && !!src.year, `${k} source edition named`, src.edition ? `${src.edition} (${src.year})` : 'missing: name the edition and year');
    add(src.year && Number(src.year) <= 1929, `${k} source edition pre-1929`, src.year ? `${src.year}` : 'unknown', 'WARN');
    add(PD_OK.test(src.rights || ''), `${k} composition rights stated`, src.rights || 'missing: say public domain and why');
    add(!!src.gabcFile, `${k} GABC file`, src.gabcFile || 'missing');
    if (src.gabcFile) add(existsSync(resolve(baseDir, src.gabcFile)), `${k} GABC file exists`, src.gabcFile);
    // audio
    if (!tr.audio) add(false, `${k} audio`, 'missing');
    else {
      const p = resolve(baseDir, tr.audio);
      if (!existsSync(p)) add(false, `${k} audio file`, `${tr.audio} not found`);
      else {
        try {
          const w = readWav(readFileSync(p));
          add([44100, 48000, 88200, 96000].includes(w.rate), `${k} sample rate`, `${w.rate} Hz`);
          add(w.channels.length === 2, `${k} stereo`, `${w.channels.length} ch`, 'WARN');
          if (!opts.skipMaster) {
            const a = analyze(w);
            for (const c of a.checks) add(c.ok, `${k} ${c.name}`, c.note, 'FAIL');
          }
        } catch (e) { add(false, `${k} audio file`, `${tr.audio}: ${e.message}`); }
      }
    }
  });
  // credits
  add(Array.isArray(rel.credits) && rel.credits.length > 0, 'credits listed', `${(rel.credits || []).length} entries`);
  const fail = out.filter((c) => c.level === 'FAIL').length, warn = out.filter((c) => c.level === 'WARN').length;
  return { checks: out, fail, warn, pass: fail === 0 };
}
export function loadRelease(file) { return { rel: JSON.parse(readFileSync(file, 'utf8')), dir: dirname(resolve(file)) }; }
