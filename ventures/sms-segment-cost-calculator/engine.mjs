// SMS segment counter and cost model. Pure functions, no I/O.
//
// A text message is not billed per message but per *segment*. A message that
// fits GSM-7 holds 160 characters in one segment and 153 per segment once it is
// split; one character outside GSM-7 (a curly quote, an emoji) switches the
// whole message to UCS-2, which holds 70 and 67. So one smart apostrophe can
// turn a 150-character reminder from 1 segment into 3.

export const PRICES_AS_OF = "approximate US long-code list prices as best known in 2025; every figure is editable";

// GSM 03.38 basic character set. ESC (0x1B) is the escape to the extension table.
const BASIC =
  "@£$¥èéùìòÇ\nØø\rÅå" +
  "Δ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ" +
  " !\"#¤%&'()*+,-./" +
  "0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§" +
  "¿abcdefghijklmnopqrstuvwxyzäöñüà";
const BASIC_SET = new Set(BASIC.replace("\u001b", ""));
// Each extension character costs two septets (escape + character).
const EXTENDED_SET = new Set("\f^{}\\[~]|€");

// Characters people paste from word processors and phones, with the GSM-7
// replacement that keeps the meaning.
export const LOOKALIKES = {
  "‘": "'", "’": "'", "‚": "'", "‛": "'",
  "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "−": "-",
  "…": "...", " ": " ", " ": " ", "​": "",
  "•": "-", "·": "-", "™": "(TM)", "©": "(c)", "®": "(R)",
  "→": "->", "✓": "", "×": "x",
};

export function classify(text) {
  const chars = Array.from(String(text ?? ""));
  const offenders = [];
  let septets = 0;
  let extended = 0;
  for (const ch of chars) {
    if (BASIC_SET.has(ch)) septets += 1;
    else if (EXTENDED_SET.has(ch)) { septets += 2; extended += 1; }
    else offenders.push(ch);
  }
  return { chars, offenders, septets, extended };
}

export function countSegments(text) {
  const { chars, offenders, septets, extended } = classify(text);
  if (chars.length === 0) {
    return { encoding: "GSM-7", units: 0, segments: 0, perSegment: 160, remaining: 160, offenders: [], extended: 0, characters: 0 };
  }
  const gsm = offenders.length === 0;
  const units = gsm ? septets : chars.reduce((n, ch) => n + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = units <= single ? 1 : Math.ceil(units / multi);
  const capacity = segments === 1 ? single : segments * multi;
  return {
    encoding: gsm ? "GSM-7" : "UCS-2",
    units,
    segments,
    perSegment: segments === 1 ? single : multi,
    remaining: capacity - units,
    offenders: [...new Set(offenders)],
    extended,
    characters: chars.length,
  };
}

// Rewrite look-alike characters to GSM-7 equivalents. Anything left over (an
// emoji, a real non-Latin letter) is reported, never silently dropped.
export function toGsm7(text) {
  let out = "";
  const replaced = {};
  const remaining = [];
  for (const ch of Array.from(String(text ?? ""))) {
    if (BASIC_SET.has(ch) || EXTENDED_SET.has(ch)) out += ch;
    else if (Object.prototype.hasOwnProperty.call(LOOKALIKES, ch)) {
      out += LOOKALIKES[ch];
      replaced[ch] = (replaced[ch] || 0) + 1;
    } else {
      out += ch;
      if (!remaining.includes(ch)) remaining.push(ch);
    }
  }
  return { text: out, replaced, remaining };
}

export const DEFAULT_PRICES = {
  perSegment: 0.0083,        // carrier-agnostic outbound US long-code segment
  carrierSurcharge: 0.003,   // approximate average US carrier pass-through per segment
  numberMonthly: 1.15,       // one local number
  campaignMonthly: 1.5,      // approximate 10DLC low-volume campaign fee
};

export const num = (v, d = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);

export function monthlyCost({ segmentsPerMessage, messagesPerMonth, numbers = 1, campaigns = 1 }, prices = DEFAULT_PRICES) {
  const p = { ...DEFAULT_PRICES, ...prices };
  const segs = num(segmentsPerMessage) * num(messagesPerMonth);
  const usage = segs * (num(p.perSegment) + num(p.carrierSurcharge));
  const fixed = num(numbers) * num(p.numberMonthly) + num(campaigns) * num(p.campaignMonthly);
  return { segments: segs, usage, fixed, total: usage + fixed };
}

// Compare what the message costs now with what it would cost after each fix.
export function savingsOptions(text, volume, prices = DEFAULT_PRICES) {
  const now = countSegments(text);
  const base = monthlyCost({ ...volume, segmentsPerMessage: now.segments }, prices);
  const options = [];
  const fixed = toGsm7(text);
  const after = countSegments(fixed.text);
  if (now.encoding === "UCS-2" && after.encoding === "GSM-7") {
    const c = monthlyCost({ ...volume, segmentsPerMessage: after.segments }, prices);
    options.push({
      id: "gsm7", title: "Swap look-alike characters for plain ones",
      segments: after.segments, saving: base.total - c.total, text: fixed.text,
      detail: Object.keys(fixed.replaced).length ? "Replaced " + Object.entries(fixed.replaced).map(([k, n]) => `${JSON.stringify(k)} x${n}`).join(", ") : "",
    });
  }
  const sc = now.segments;
  if (sc > 1) {
    const cap = (now.encoding === "GSM-7" ? 160 : 70);
    const over = now.units - (sc - 1) * now.perSegment;
    const trimmed = now.units > cap && sc >= 2 && over > 0 && over <= Math.ceil(now.perSegment * 0.25);
    if (trimmed) {
      const c = monthlyCost({ ...volume, segmentsPerMessage: sc - 1 }, prices);
      options.push({ id: "trim", title: `Trim ${over} unit${over === 1 ? "" : "s"} to drop a segment`, segments: sc - 1, saving: base.total - c.total, text: null, detail: "" });
    }
  }
  return { now, base, options: options.filter((o) => o.saving > 0).sort((a, b) => b.saving - a.saving) };
}

export const fmt = (n) => "$" + (Math.round(num(n) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
