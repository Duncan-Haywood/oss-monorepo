// Shared number formatting for every surface that claims to match the CLI
// (`src/quote_margin.py`) byte-for-byte: the Markdown review's module comment
// and the CSV export's own comment ("Null extras keep the same shape as the
// CLI") both say so.
//
// Python's `f"{x:.2f}"` — what the CLI uses everywhere — rounds a value that
// sits exactly on a half-cent to the nearest *even* hundredth (banker's
// rounding, on the value's true binary representation), not away from zero.
// `Number.prototype.toFixed` does not: `(62.125).toFixed(2)` is `"62.13"`,
// while Python prints `"62.12"` for the identical double. Most quotes never
// land on an exact half cent, so this drifted unnoticed; when one does, the
// browser and the CLI show two different numbers for the same calculation.
//
// A naive `Math.round(value * 100)` reimplementation is not safe here: the
// multiplication by 100 can itself introduce or hide floating-point error,
// so it disagrees with Python on ordinary (non-tie) values too — verified
// against Python on 200k+ random and division-derived values before this
// landed. Instead this decomposes the IEEE-754 double into its exact
// mantissa and binary exponent and does the rounding in exact integer
// (BigInt) arithmetic, which is the same "round the true value" contract
// Python's formatter follows.
export function formatDecimal(value) {
  if (!Number.isFinite(value)) return String(value);
  const negative = value < 0 || Object.is(value, -0);
  const abs = Math.abs(value);

  const buf = new ArrayBuffer(8);
  const f64 = new Float64Array(buf);
  const u64 = new BigUint64Array(buf);
  f64[0] = abs;
  const bits = u64[0];
  let exponent = Number((bits >> 52n) & 0x7ffn);
  let mantissa = bits & 0xfffffffffffffn;
  if (exponent === 0) {
    exponent = 1; // subnormal: no implicit leading 1 bit
  } else {
    mantissa |= 0x10000000000000n; // normal: restore the implicit leading 1
  }
  exponent -= 1075; // unbias (1023) and account for the 52 mantissa bits

  // abs === mantissa * 2^exponent, exactly. Round abs*100 to the nearest
  // integer (ties to even) using only integer arithmetic.
  let cents;
  if (exponent >= 0) {
    cents = mantissa * 100n * (1n << BigInt(exponent));
  } else {
    const denom = 1n << BigInt(-exponent);
    const numerator = mantissa * 100n;
    let q = numerator / denom;
    const remainder = numerator % denom;
    const twiceRemainder = remainder * 2n;
    if (twiceRemainder > denom || (twiceRemainder === denom && q % 2n !== 0n)) {
      q += 1n;
    }
    cents = q;
  }

  const padded = cents.toString().padStart(3, "0");
  const wholePart = padded.slice(0, -2);
  const centsPart = padded.slice(-2);
  return `${negative ? "-" : ""}${wholePart}.${centsPart}`;
}
