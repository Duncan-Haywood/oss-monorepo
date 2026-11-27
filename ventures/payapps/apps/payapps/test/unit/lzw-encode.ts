// A plain LZW encoder for tests of the PDF reader's LZWDecode (src/shared/pdf/filters.ts).

/** A plain LZW encoder (MSB-first, clear code first, EOD last) to round-trip the decoder. */
export function lzwEncode(data: Uint8Array, earlyChange = 1) {
  const bits: number[] = [];
  let codeLen = 9;
  const write = (code: number) => {
    for (let k = codeLen - 1; k >= 0; k--) bits.push((code >> k) & 1);
  };
  let dict = new Map<string, number>();
  let next = 258;
  const reset = () => {
    dict = new Map();
    for (let k = 0; k < 256; k++) dict.set(String.fromCharCode(k), k);
    next = 258;
    codeLen = 9;
  };
  reset();
  write(256);
  let w = "";
  for (const b of data) {
    const c = String.fromCharCode(b);
    if (dict.has(w + c)) {
      w += c;
      continue;
    }
    write(dict.get(w) as number);
    dict.set(w + c, next++);
    // The decoder adds its entry one code later than the encoder, so it grows on the same code.
    if (next + earlyChange >= 4096) {
      write(256);
      reset();
    } else if (next + earlyChange > 1 << codeLen) codeLen++;
    w = c;
  }
  if (w) write(dict.get(w) as number);
  if (next + earlyChange > 1 << codeLen && codeLen < 12) codeLen++;
  write(257);
  while (bits.length % 8) bits.push(0);
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++)
    for (let k = 0; k < 8; k++) out[i] = ((out[i] as number) << 1) | (bits[i * 8 + k] as number);
  return out;
}
