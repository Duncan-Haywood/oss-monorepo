// Timed lyrics in LRC format (one line per phrase), for lyric displays and
// distributor lyric uploads. A phrase ends at any bar line. Words are joined
// from syllables using the GABC word starts.
export function lrcLines(events, { bpm = 124, pulsesPerBeat = 2 } = {}) {
  const lines = [];
  let p = 0;
  let cur = null;
  for (const e of events) {
    if (e.type === 'note' && e.syllable) {
      if (!cur) cur = { t: (p / pulsesPerBeat) * (60 / bpm), text: '' };
      cur.text += (cur.text && e.wordStart ? ' ' : '') + e.syllable;
    } else if (e.type === 'bar' && cur) {
      lines.push(cur);
      cur = null;
    }
    p += e.pulses;
  }
  if (cur) lines.push(cur);
  return lines;
}

function stamp(t) {
  const cs = Math.round(t * 100);
  const m = Math.floor(cs / 6000);
  const s = (cs % 6000) / 100;
  return `[${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}]`;
}

export function lrc(events, opts = {}, title = '') {
  const head = title ? `[ti:${title}]\n` : '';
  return head + lrcLines(events, opts).map((l) => stamp(l.t) + l.text).join('\n') + '\n';
}
