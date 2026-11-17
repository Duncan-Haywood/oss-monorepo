// Writes data/online-stream.csv, the online example: a SIMULATED stream, not
// real data. 400 one-sided z-tests in arrival order; each is a true effect
// (mean shift 3) with probability 0.15, else N(0,1). Seeded, so rerunning
// gives the same file:  node eval/make_online_example.mjs > data/online-stream.csv
// The truth column is kept so the example can show what each rule got right.
import { mulberry32, gauss, normSf } from "./simulate.mjs";

const rand = mulberry32(20261116);
const lines = ["test,p_value,truth"];
for (let t = 1; t <= 400; t++) {
  const effect = rand() < 0.15;
  const p = normSf(gauss(rand) + (effect ? 3 : 0));
  lines.push(`T${String(t).padStart(3, "0")},${+p.toPrecision(6)},${effect ? "effect" : "null"}`);
}
process.stdout.write(lines.join("\n") + "\n");
