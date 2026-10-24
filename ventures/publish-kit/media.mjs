// @ts-check
// Reads what a publishing step needs from an audio or image file's own bytes:
// duration, bitrate, sample rate, channels and constant-vs-variable bitrate
// for MP3 / M4A / M4B / WAV, and pixel size and colour model for PNG / JPEG.
//
// Pure: takes a Uint8Array, does no I/O, so the CLI (which reads the file from
// disk) and the browser page (which reads a dropped File) get the same answer.
// No decoding of audio samples except for 16-bit PCM WAV, where loudness can be
// measured directly (see measureWavLoudness).

const MP3_BITRATES = {
  v1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** @param {Uint8Array} b @param {number} o */
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
/** @param {Uint8Array} b @param {number} o */
const u16 = (b, o) => (b[o] << 8) + b[o + 1];
/** @param {Uint8Array} b @param {number} o */
const le32 = (b, o) => b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + ((b[o + 3] << 24) >>> 0);
/** @param {Uint8Array} b @param {number} o */
const le16 = (b, o) => b[o] + (b[o + 1] << 8);
/** @param {Uint8Array} b @param {number} o @param {number} n */
const ascii = (b, o, n) => String.fromCharCode(...b.subarray(o, o + n));

/**
 * Guesses the container from magic bytes.
 * @param {Uint8Array} b
 * @returns {'mp3'|'mp4'|'wav'|'png'|'jpeg'|'unknown'}
 */
export function sniff(b) {
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WAVE') return 'wav';
  if (b.length >= 12 && ascii(b, 4, 4) === 'ftyp') return 'mp4';
  if (b.length >= 3 && ascii(b, 0, 3) === 'ID3') return 'mp3';
  if (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

/**
 * Parses one MPEG audio frame header at offset o, or returns null.
 * @param {Uint8Array} b @param {number} o
 */
export function mp3FrameHeader(b, o) {
  if (o + 4 > b.length || b[o] !== 0xff || (b[o + 1] & 0xe0) !== 0xe0) return null;
  const version = (b[o + 1] >> 3) & 3; // 3 = MPEG-1, 2 = MPEG-2, 0 = MPEG-2.5
  const layer = (b[o + 1] >> 1) & 3; // 1 = Layer III
  const bitrateIndex = b[o + 2] >> 4;
  const rateIndex = (b[o + 2] >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) return null;
  const kbps = (version === 3 ? MP3_BITRATES.v1 : MP3_BITRATES.v2)[bitrateIndex];
  const sampleRate = MP3_SAMPLE_RATES[version][rateIndex];
  const padding = (b[o + 2] >> 1) & 1;
  const mono = (b[o + 3] >> 6) === 3;
  const samples = version === 3 ? 1152 : 576;
  const length = Math.floor(((samples / 8) * kbps * 1000) / sampleRate) + padding;
  return { version, kbps, sampleRate, channels: mono ? 1 : 2, samples, length };
}

/** @param {Uint8Array} b */
function id3v2Size(b) {
  if (b.length < 10 || ascii(b, 0, 3) !== 'ID3') return 0;
  const size = (b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9];
  return 10 + size + (b[5] & 0x10 ? 10 : 0);
}

/**
 * Walks every frame of an MP3, so duration is exact and a file that mixes
 * bitrates is reported as VBR even when it carries no Xing header.
 * @param {Uint8Array} b
 */
export function probeMp3(b) {
  let pos = id3v2Size(b);
  const end = b.length >= 128 && ascii(b, b.length - 128, 3) === 'TAG' ? b.length - 128 : b.length;
  let frames = 0, samples = 0, sampleRate = 0, channels = 0, audioBytes = 0, skipped = 0;
  const bitrates = new Set();
  let first = true;
  while (pos < end - 4) {
    const h = mp3FrameHeader(b, pos);
    if (!h || h.length < 4 || pos + h.length > end + 1) { pos++; skipped++; continue; }
    // A Xing/Info/VBRI frame describes the stream; it carries no audio.
    if (first) {
      first = false;
      const side = h.version === 3 ? (h.channels === 1 ? 17 : 32) : (h.channels === 1 ? 9 : 17);
      const tag = ascii(b, pos + 4 + side, 4);
      if (tag === 'Xing' || tag === 'Info' || ascii(b, pos + 36, 4) === 'VBRI') { pos += h.length; continue; }
    }
    frames++;
    samples += h.samples;
    sampleRate = h.sampleRate;
    channels = Math.max(channels, h.channels);
    bitrates.add(h.kbps);
    audioBytes += h.length;
    pos += h.length;
  }
  if (!frames) return { format: 'mp3', error: 'no MPEG audio frames found' };
  const duration = samples / sampleRate;
  const list = [...bitrates].sort((x, y) => x - y);
  return {
    format: 'mp3',
    mime: 'audio/mpeg',
    duration: round(duration),
    sampleRate,
    channels,
    bitrateKbps: list.length === 1 ? list[0] : Math.round((audioBytes * 8) / duration / 1000),
    cbr: list.length === 1,
    minKbps: list[0],
    maxKbps: list[list.length - 1],
    frames,
    junkBytes: skipped,
  };
}

/**
 * Walks ISO-BMFF boxes (M4A / M4B / MP4) for duration, the AAC sample entry,
 * and whether the file carries chapter markers.
 * @param {Uint8Array} b
 */
export function probeMp4(b) {
  /** @type {{duration?: number, sampleRate?: number, channels?: number, chapters: boolean, mdat: number, brand: string}} */
  const out = { chapters: false, mdat: 0, brand: ascii(b, 8, 4).trim() };
  const containers = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'udta', 'edts', 'tref']);
  /** @param {number} start @param {number} stop */
  const walk = (start, stop) => {
    let p = start;
    while (p + 8 <= stop) {
      let size = u32(b, p);
      const type = ascii(b, p + 4, 4);
      let header = 8;
      if (size === 1) { size = u32(b, p + 8) * 2 ** 32 + u32(b, p + 12); header = 16; }
      else if (size === 0) size = stop - p;
      if (size < header) break;
      const body = p + header;
      if (type === 'mvhd') {
        const v = b[body];
        const ts = v === 1 ? u32(b, body + 20) : u32(b, body + 12);
        const dur = v === 1 ? u32(b, body + 24) * 2 ** 32 + u32(b, body + 28) : u32(b, body + 16);
        if (ts) out.duration = dur / ts;
      } else if (type === 'stsd') {
        walk(body + 8, Math.min(p + size, stop));
      } else if (type === 'mp4a') {
        out.channels = u16(b, body + 16);
        out.sampleRate = u16(b, body + 24);
      } else if (type === 'chpl' || type === 'chap') {
        out.chapters = true;
      } else if (type === 'mdat') {
        out.mdat += size - header;
      } else if (type === 'meta') {
        walk(body + 4, Math.min(p + size, stop));
      } else if (containers.has(type)) {
        walk(body, Math.min(p + size, stop));
      }
      p += size;
    }
  };
  walk(0, b.length);
  if (!out.duration) return { format: 'mp4', error: 'no movie header (moov/mvhd) found' };
  return {
    format: 'mp4',
    mime: out.brand.startsWith('M4B') ? 'audio/x-m4b' : 'audio/mp4',
    brand: out.brand,
    duration: round(out.duration),
    sampleRate: out.sampleRate ?? null,
    channels: out.channels ?? null,
    bitrateKbps: out.mdat ? Math.round((out.mdat * 8) / out.duration / 1000) : null,
    chapters: out.chapters,
  };
}

/** @param {Uint8Array} b */
function wavChunks(b) {
  /** @type {{fmt?: {audioFormat: number, channels: number, sampleRate: number, byteRate: number, bits: number}, data?: {offset: number, size: number}}} */
  const out = {};
  let p = 12;
  while (p + 8 <= b.length) {
    const id = ascii(b, p, 4);
    const size = le32(b, p + 4);
    if (id === 'fmt ') {
      out.fmt = { audioFormat: le16(b, p + 8), channels: le16(b, p + 10), sampleRate: le32(b, p + 12), byteRate: le32(b, p + 16), bits: le16(b, p + 22) };
    } else if (id === 'data') {
      out.data = { offset: p + 8, size: Math.min(size, b.length - p - 8) };
    }
    p += 8 + size + (size & 1);
  }
  return out;
}

/** @param {Uint8Array} b */
export function probeWav(b) {
  const { fmt, data } = wavChunks(b);
  if (!fmt || !data) return { format: 'wav', error: 'missing fmt or data chunk' };
  return {
    format: 'wav',
    mime: 'audio/wav',
    duration: round(data.size / fmt.byteRate),
    sampleRate: fmt.sampleRate,
    channels: fmt.channels,
    bitDepth: fmt.bits,
    bitrateKbps: Math.round((fmt.byteRate * 8) / 1000),
    cbr: true,
  };
}

/**
 * Loudness of a 16-bit PCM WAV: overall RMS, sample peak, and the quietest
 * half-second window's RMS (a stand-in for the noise floor, measured on the
 * room tone at the head and tail of a chapter). All in dBFS.
 * @param {Uint8Array} b
 */
export function measureWavLoudness(b) {
  const { fmt, data } = wavChunks(b);
  if (!fmt || !data) return { error: 'missing fmt or data chunk' };
  if (fmt.audioFormat !== 1 || fmt.bits !== 16) return { error: 'loudness is measured on 16-bit PCM WAV only' };
  const view = new DataView(b.buffer, b.byteOffset + data.offset, data.size - (data.size % 2));
  const n = view.byteLength / 2;
  const win = Math.max(1, Math.floor((fmt.sampleRate * fmt.channels) / 2));
  let sum = 0, peak = 0, winSum = 0, winCount = 0, minWin = Infinity;
  for (let i = 0; i < n; i++) {
    const s = view.getInt16(i * 2, true) / 32768;
    const sq = s * s;
    sum += sq;
    winSum += sq;
    if (Math.abs(s) > peak) peak = Math.abs(s);
    if (++winCount === win) { minWin = Math.min(minWin, winSum / win); winSum = 0; winCount = 0; }
  }
  const db = (/** @type {number} */ x) => (x > 0 ? round(10 * Math.log10(x), 1) : -Infinity);
  return {
    rmsDb: db(sum / n),
    peakDb: peak > 0 ? round(20 * Math.log10(peak), 1) : -Infinity,
    noiseFloorDb: db(minWin === Infinity ? sum / n : minWin),
  };
}

/** @param {Uint8Array} b */
export function probePng(b) {
  const colorType = b[25];
  return {
    format: 'png', mime: 'image/png',
    width: u32(b, 16), height: u32(b, 20),
    colorModel: colorType === 0 || colorType === 4 ? 'grayscale' : 'rgb',
  };
}

/** @param {Uint8Array} b */
export function probeJpeg(b) {
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) { p++; continue; }
    const marker = b[p + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue; }
    const len = u16(b, p + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const components = b[p + 9];
      return {
        format: 'jpeg', mime: 'image/jpeg',
        height: u16(b, p + 5), width: u16(b, p + 7),
        colorModel: components === 1 ? 'grayscale' : components === 4 ? 'cmyk' : 'rgb',
        progressive: marker === 0xc2,
      };
    }
    p += 2 + len;
  }
  return { format: 'jpeg', error: 'no frame header found' };
}

/**
 * Probes any supported file. Always returns an object with `format`; on a file
 * it cannot read, also `error`.
 * @param {Uint8Array} b
 * @returns {Record<string, any>}
 */
export function probe(b) {
  const kind = sniff(b);
  const info = kind === 'mp3' ? probeMp3(b)
    : kind === 'mp4' ? probeMp4(b)
    : kind === 'wav' ? probeWav(b)
    : kind === 'png' ? probePng(b)
    : kind === 'jpeg' ? probeJpeg(b)
    : { format: 'unknown', error: 'not an MP3, M4A/M4B, WAV, PNG or JPEG file' };
  return { ...info, bytes: b.length };
}

/** @param {number} x @param {number} [digits] */
function round(x, digits = 3) {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

/**
 * 3725.4 -> "01:02:05" (the itunes:duration form podcast apps all read).
 * @param {number} seconds
 */
export function hhmmss(seconds) {
  const s = Math.round(seconds);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
