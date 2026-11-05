// Permit packet preflight: match a jurisdiction's published submittal checklist
// (pasted by the user, never built in) against the file names in a packet.
// Pure functions, no network. Matching is by keyword overlap, so it is a
// completeness hint, not a review of the content of any sheet.
const STOP = new Set(['the','a','an','of','and','or','for','to','in','on','with','all','any','if','is','are','be','by','as','at','plan','plans','form','copy','copies','required','submit','submitted','sheet','sheets','document','documents','pdf']);
const SYN = { site:['site','plot','survey'], survey:['survey','plot','site'], energy:['energy','insulation','rescheck','comcheck','title24'], structural:['structural','struct','engineering','calcs','calculations'], calcs:['calcs','calculations','calculation'], elevation:['elevation','elevations','elev'], floor:['floor','floorplan'], foundation:['foundation','footing'], application:['application','app'], truss:['truss','trusses'], drainage:['drainage','stormwater','grading'], owner:['owner','authorization','authorisation'], contractor:['contractor','license','licence'] };
export function tokens(s) {
  if (typeof s !== 'string') return [];
  return s.toLowerCase().replace(/\.[a-z0-9]{2,4}$/,'').split(/[^a-z0-9]+/).filter(t => t && !STOP.has(t));
}
export function parseChecklist(text) {
  if (typeof text !== 'string') return { items: [], errors: ['checklist must be text'] };
  if (text.length > 200000) return { items: [], errors: ['checklist over 200000 characters'] };
  const items = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•□☐\[\]x ]+|\d+[.)])\s*/i, '').trim();
    if (line.length < 3) continue;
    const optional = /\b(if applicable|when applicable|optional|as needed|if required)\b/i.test(line);
    items.push({ text: line, optional, tokens: tokens(line.replace(/\(.*?\)/g, ' ')) });
  }
  return { items, errors: items.length ? [] : ['no checklist lines found'] };
}
function variants(t) { return SYN[t] || [t]; }
function score(item, fileTokens) {
  if (!item.tokens.length || !fileTokens.length) return 0;
  const near = (a, b) => a === b || (a.length > 3 && b.length > 3 && (a.startsWith(b) || b.startsWith(a)));
  const hasF = t => variants(t).some(v => fileTokens.some(f => near(f, v)));
  const hit = item.tokens.filter(hasF).length;
  const fhit = fileTokens.filter(f => item.tokens.some(t => variants(t).some(v => near(f, v)))).length;
  return Math.max(hit / item.tokens.length, 0.9 * fhit / fileTokens.length);
}
export function preflight(checklistText, fileNames, { threshold = 0.4 } = {}) {
  const { items, errors } = parseChecklist(checklistText);
  if (errors.length) return { ok: false, errors };
  if (!Array.isArray(fileNames) || fileNames.some(f => typeof f !== 'string')) return { ok: false, errors: ['fileNames must be a list of text'] };
  if (!(threshold > 0 && threshold <= 1)) return { ok: false, errors: ['threshold must be above 0 and at most 1'] };
  const files = fileNames.map(f => ({ name: f, tokens: tokens(f) }));
  const used = new Set();
  const rows = items.map(it => {
    let best = null, bs = 0;
    for (const f of files) { const s = score(it, f.tokens); if (s > bs) { bs = s; best = f; } }
    const matched = best && bs >= threshold;
    if (matched) used.add(best.name);
    return { item: it.text, optional: it.optional, status: matched ? 'found' : (it.optional ? 'optional-missing' : 'missing'), file: matched ? best.name : null, confidence: Math.round(bs * 100) / 100 };
  });
  const missing = rows.filter(r => r.status === 'missing');
  return { ok: true, rows, missing: missing.map(r => r.item), unmatchedFiles: files.map(f => f.name).filter(n => !used.has(n)), summary: { required: rows.filter(r => !r.optional).length, found: rows.filter(r => r.status === 'found').length, missing: missing.length } };
}
export function report(res) {
  if (!res.ok) return 'Cannot check: ' + res.errors.join('; ');
  const L = [`Permit packet preflight: ${res.summary.missing} required item(s) with no matching file (of ${res.summary.required} required).`];
  for (const r of res.rows) L.push(`${r.status === 'found' ? '[x]' : r.status === 'missing' ? '[ ]' : '[-]'} ${r.item}${r.file ? '  <- ' + r.file : ''}`);
  if (res.unmatchedFiles.length) L.push('Files that matched no line: ' + res.unmatchedFiles.join(', '));
  L.push('A name match is not a content check. The city decides completeness.');
  return L.join('\n');
}
