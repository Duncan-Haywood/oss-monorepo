// The studio page's EP queue (2026-11-16): several converted tracks, each with its own settings,
// built into one release folder through the same releaseKit (ep-core.mjs) as the one-track button
// and ep-cli.mjs. Browser-safe: no Buffer, no fs. The page keeps the queue in localStorage through
// queueToJson / queueFromJson, so a reload does not lose it.
//
// A queued track holds what the page has after Convert, never rendered audio (a sung 3-minute
// track is ~30 MB of samples): { title, header, gabcText, gabcName, midi (bytes), lrc, isrc,
// warnings, coverMidis, sing, settings (a short line for the list) }. buildQueue renders each
// track at -14 LUFS when the folder is built.
import { releaseKit, EP_TARGET_LUFS, slugify } from './ep-core.mjs';

export const QUEUE_MAX = 12; // past this a release is an album well beyond what a distributor plan expects; the page says so

export function addTrack(queue, track) {
  if (!track || !track.midi || !track.header) throw new Error('convert a chant before adding it');
  if (queue.length >= QUEUE_MAX) throw new Error(`the queue holds at most ${QUEUE_MAX} tracks`);
  return [...queue, { ...track, id: track.id || newId(queue) }];
}
export function removeTrack(queue, id) { return queue.filter((t) => t.id !== id); }
export function moveTrack(queue, id, by) {
  const i = queue.findIndex((t) => t.id === id), j = i + by;
  if (i < 0 || j < 0 || j >= queue.length) return queue;
  const q = queue.slice();
  [q[i], q[j]] = [q[j], q[i]];
  return q;
}
function newId(queue) { let n = queue.length + 1; while (queue.some((t) => t.id === `t${n}`)) n++; return `t${n}`; }

// The title a track takes in the release, as releaseKit and ep.mjs derive it.
export function trackTitle(t) { return (t.title || t.header.name || 'Chant').replace(/\s*\(.*?\)\s*$/, '').trim(); }

// Two tracks may come from one chant (Pange lingua as house and as metal) or from two pasted chants
// with one name: each source keeps its own file in sources/, the second as name-2.gabc, unless the
// text is the same, when they share one.
export function sourceNames(queue) {
  const used = new Map(); // name -> gabc text
  return queue.map((t) => {
    const want = t.gabcName || `${slugify(trackTitle(t))}.gabc`;
    const stem = want.replace(/\.gabc$/i, '');
    for (let n = 1; ; n++) {
      const name = n === 1 ? want : `${stem}-${n}.gabc`;
      if (!used.has(name)) { used.set(name, t.gabcText); return name; }
      if (used.get(name) === t.gabcText) return name;
    }
  });
}

// The release type releaseJson would infer, said on the page before anything is rendered.
export function releaseType(n) { return n <= 3 ? 'single' : n <= 6 ? 'ep' : 'album'; }

// Render each queued track at -14 LUFS (render(midi, opts), render.mjs's renderMidi) and build the
// folder. onTrack(i, n, title) is called before each render so the page can say where it is and
// yield to the browser. The cover is drawn from the first track's opening notes, as ep-cli.mjs does.
export async function buildQueue(plan, queue, { render, wavBytes, deflate, today, coverSize, onTrack = () => {} } = {}) {
  if (!queue.length) throw new Error('the queue is empty: convert a chant and add it first');
  const names = sourceNames(queue);
  const tracks = [];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    await onTrack(i, queue.length, trackTitle(t));
    const wav = render(t.midi, { rate: 44100, targetLufs: EP_TARGET_LUFS, limit: true, sing: Boolean(t.sing) });
    tracks.push({ title: trackTitle(t), header: t.header, gabcText: t.gabcText, gabcName: names[i], midi: t.midi, wav, lrc: t.lrc,
      isrc: (t.isrc || '').trim(), warnings: t.warnings || [] });
  }
  return releaseKit(plan, tracks, { today, coverSize, coverMidis: queue[0].coverMidis, wavBytes, ...(deflate ? { deflate } : {}) });
}

// localStorage form: MIDI bytes as base64, everything else as it is.
export function queueToJson(queue) {
  return JSON.stringify({ v: 1, tracks: queue.map((t) => ({ ...t, midi: toB64(t.midi) })) });
}
export function queueFromJson(text) {
  try {
    const o = JSON.parse(text);
    if (!o || o.v !== 1 || !Array.isArray(o.tracks)) return [];
    return o.tracks.filter((t) => t && t.midi && t.header && typeof t.lrc === 'string' && typeof t.gabcText === 'string')
      .slice(0, QUEUE_MAX).map((t) => ({ ...t, midi: fromB64(t.midi) }));
  } catch { return []; }
}
function toB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(s) { const b = atob(s), out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; }
