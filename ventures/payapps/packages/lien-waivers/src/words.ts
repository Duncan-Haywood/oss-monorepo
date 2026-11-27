// A dollar amount in words, for forms that state a payment in words and figures (Massachusetts'
// partial waiver, c. 254, § 32(4)). Its own module, with no form text, so a browser bundle can
// import it alone (apps/payapps aliases it as "@lien-waivers/words").

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion"];

function underThousand(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r >= 20) parts.push(TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  else if (r) parts.push(ONES[r] as string);
  return parts.join(" ");
}

/**
 * A dollar amount in words as cheques write it: 1234567 cents is
 * "Twelve Thousand Three Hundred Forty-Five and 67/100 Dollars". Non-negative whole cents only,
 * below one trillion dollars; throws RangeError otherwise.
 */
export function amountInWords(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents >= 100_000_000_000_000) {
    throw new RangeError(`Not a non-negative whole number of cents below $1 trillion: ${cents}`);
  }
  let dollars = Math.floor(cents / 100);
  const groups: string[] = [];
  for (let i = 0; dollars > 0; i++, dollars = Math.floor(dollars / 1000)) {
    const g = dollars % 1000;
    if (g) groups.unshift(`${underThousand(g)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  const words = groups.length ? groups.join(" ") : "Zero";
  return `${words} and ${String(cents % 100).padStart(2, "0")}/100 Dollars`;
}
