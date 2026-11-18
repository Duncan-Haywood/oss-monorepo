// Made-up nested (destructive) study for the page's second example: 3
// operators each pull 5 specimens from one batch and break 2 coupons per
// specimen. Tensile strength in MPa; the variances are invented, not measured.
// Run: node eval/simulate-nested.mjs > data/destructive-simulated.csv
let seed = 11;
const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
console.log("operator,part,trial,measurement");
for (const [i, op] of ["Ana", "Ben", "Chi"].entries()) {
  const bias = [0, 3, -2][i];
  for (let p = 1; p <= 5; p++) {
    const spec = 410 + 6 * gauss();
    for (let t = 1; t <= 2; t++) console.log(`${op},${op}-${p},${t},${(spec + bias + 2.5 * gauss()).toFixed(1)}`);
  }
}
