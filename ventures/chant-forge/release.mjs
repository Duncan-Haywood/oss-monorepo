// Release-readiness check for a chant-forge release (one single or EP), run before anyone uploads
// to a distributor. It reads a plain JSON description of the release and reports what would be
// wrong or dishonest. It uploads nothing and needs no account.
//
// The limits below are common distributor requirements written from memory and NOT checked against
// any distributor's current rules this session: read the distributor's page before upload and
// override them with `limits`.

export const DEFAULT_LIMITS = {
  publicDomainBefore: 1929, // the sources this project keeps: pre-1929 printings (README, "Rules")
  coverMinPx: 3000,
  coverFormats: ['jpg', 'jpeg', 'png'],
  minTrackSeconds: 30, // a stream is usually counted after 30 s
  masterTargets: true, // require each track's master report (master.mjs analyze output) to pass
};

const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{2}\d{5}$/;
const UPC = /^\d{12,13}$/;
// Words that say a real religious community sang it.
const REAL_CHOIR = /\b(monks?|monastery|monastic|abbey|benedictines?|cistercians?|trappists?|seminar(?:y|ians?)|schola|friars?|brothers)\b/i;
const SYNTH_WORDS = /synth|ai|generated|virtual|sampled library|vocal model/i;

function mark(list, level, where, msg) {
  list.push({ level, where, msg });
}

export function checkRelease(rel, limits = {}) {
  const L = { ...DEFAULT_LIMITS, ...limits };
  const f = [];
  const r = rel || {};

  for (const k of ['title', 'artist', 'releaseDate', 'language']) {
    if (!r[k] || typeof r[k] !== 'string') mark(f, 'error', k, `missing ${k}`);
  }
  if (r.releaseDate && !/^\d{4}-\d{2}-\d{2}$/.test(r.releaseDate)) mark(f, 'error', 'releaseDate', 'use YYYY-MM-DD');
  if (r.upc != null && !UPC.test(String(r.upc))) mark(f, 'error', 'upc', 'a UPC/EAN is 12 or 13 digits (the distributor can assign one: leave it out)');

  // Cover art
  const c = r.cover;
  if (!c) mark(f, 'error', 'cover', 'no cover art described');
  else {
    if (!(c.width > 0 && c.height > 0)) mark(f, 'error', 'cover', 'give width and height in pixels');
    else {
      if (c.width !== c.height) mark(f, 'error', 'cover', `cover is ${c.width}x${c.height}: it must be square`);
      if (Math.min(c.width, c.height) < L.coverMinPx) mark(f, 'error', 'cover', `cover is under ${L.coverMinPx} px (${c.width}x${c.height})`);
    }
    const fmt = String(c.format || '').toLowerCase();
    if (!L.coverFormats.includes(fmt)) mark(f, 'error', 'cover', `format "${c.format}" is not one of ${L.coverFormats.join(', ')}`);
    if (c.hasText && /https?:|www\.|\.com\b/i.test(String(c.text || ''))) mark(f, 'error', 'cover', 'no web addresses on the cover');
    if (!c.origin) mark(f, 'error', 'cover', 'say where the artwork came from (made by us, or a public-domain work with its source): never a scraped image');
  }

  // Voices and honesty
  const v = r.voices || {};
  if (typeof v.synthesised !== 'boolean') mark(f, 'error', 'voices', 'say whether the voices are synthesised (voices.synthesised true or false)');
  const creditText = [r.title, r.artist, r.description, r.credits, ...(r.tracks || []).map((t) => t.title)].filter(Boolean).join(' \n ');
  if (v.synthesised === true) {
    if (!r.aiDisclosure || !String(r.aiDisclosure).trim()) mark(f, 'error', 'aiDisclosure', 'synthesised voices need a written AI disclosure for the distributor field');
    else if (!SYNTH_WORDS.test(r.aiDisclosure)) mark(f, 'warn', 'aiDisclosure', 'the disclosure never says "synthesised", "AI" or "generated"');
    if (REAL_CHOIR.test(creditText)) mark(f, 'error', 'credits', 'credits mention monks, a monastery or similar over synthesised voices: that implies a real community sang it');
  }
  if (v.synthesised === false && !v.singers) mark(f, 'error', 'voices', 'real singers: name them (voices.singers) and keep their written consent on file');
  if (r.samples && (!Array.isArray(r.samples) || r.samples.length)) mark(f, 'error', 'samples', 'this project never samples an existing recording: samples must be empty');

  // Tracks
  const tracks = Array.isArray(r.tracks) ? r.tracks : [];
  if (!tracks.length) mark(f, 'error', 'tracks', 'no tracks');
  const seenIsrc = new Set();
  tracks.forEach((t, i) => {
    const w = `tracks[${i}]${t.title ? ` "${t.title}"` : ''}`;
    if (!t.title) mark(f, 'error', w, 'missing title');
    if (t.isrc != null) {
      if (!ISRC.test(String(t.isrc))) mark(f, 'error', w, `ISRC "${t.isrc}" is malformed (CC-XXX-YY-NNNNN, no dashes)`);
      else if (seenIsrc.has(t.isrc)) mark(f, 'error', w, `ISRC ${t.isrc} used twice`);
      seenIsrc.add(t.isrc);
    }
    if (!(t.seconds >= L.minTrackSeconds)) mark(f, 'warn', w, `under ${L.minTrackSeconds} s: it may not count as a stream`);
    const s = t.source;
    if (!s || !s.book || !s.page || !s.year) mark(f, 'error', w, 'cite the chant source: book, page and year of the printing the notation was taken from');
    else if (!(Number(s.year) < L.publicDomainBefore)) mark(f, 'error', w, `source "${s.book}" is from ${s.year}: use a printing before ${L.publicDomainBefore}, as the project's rules say`);
    if (!t.textSource) mark(f, 'warn', w, 'name the source of the Latin text (it can differ from the notation)');
    if (t.translationUsed) mark(f, 'error', w, 'a modern translation can be under copyright: use the Latin or a pre-1929 translation with its source');
    if (t.gabcFile && !/\.gabc$/.test(t.gabcFile)) mark(f, 'warn', w, 'gabcFile does not end in .gabc');
    if (L.masterTargets) {
      if (!t.master) mark(f, 'error', w, 'no master report: run master-cli.mjs --json on the final file and attach it as `master`');
      else if (t.master.pass !== true) mark(f, 'error', w, 'master report did not pass: ' + (t.master.checks || []).filter((x) => !x.ok).map((x) => x.name).join(', '));
    }
    if (t.explicit) mark(f, 'warn', w, 'explicit flag set on a liturgical text: check it is right');
  });

  // Composer credit: chant is traditional; the arrangement is ours.
  if (!r.credits || !/traditional|public domain|plainchant|plainsong|gregorian/i.test(r.credits)) {
    mark(f, 'warn', 'credits', 'credit the chant as traditional / public domain and the arrangement to its maker');
  }

  const errors = f.filter((x) => x.level === 'error').length;
  return { ok: errors === 0, errors, warnings: f.length - errors, findings: f };
}
