import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { run, parseArgs, HELP } from "./cli.mjs";

const data = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
const CLI = fileURLToPath(new URL("./cli.mjs", import.meta.url));

test("help cites the papers and carries the disclaimer", () => {
  const r = run(["--help"]);
  assert.equal(r.code, 0);
  for (const s of ["Ralph Allan Bradley, Milton E. Terry (1952)", "doi:10.1080/01621459.1970.10481082", "doi:10.2307/2529467", "doi:10.1214/aos/1079120141", "No warranty", "Not betting, financial or professional"]) assert.ok(HELP.includes(s), s);
});

test("text output: the table, the home advantage and a prediction", () => {
  const r = run([data("premier-league-2023-24.csv"), "--predict", "Arsenal,Manchester City", "--draws", "500"]);
  assert.equal(r.code, 0);
  assert.match(r.out, /^20 players, 380 games \(82 ties\)\. Manchester City is strongest/);
  assert.match(r.out, /Playing at home \(first-listed\) is worth \d+ rating points/);
  assert.match(r.out, /\n {2}1 {2}Manchester City +1,9\d\d/);
  assert.match(r.out, /Arsenal v Manchester City \(Arsenal at home\): Arsenal wins \d+\.\d%, tie \d+\.\d%, Manchester City wins/);
  const missing = run([data("premier-league-2023-24.csv"), "--predict", "Arsenal,Nobody", "--draws", "0"]);
  assert.match(missing.out, /Cannot predict: Nobody not in the results/);
});

test("--csv, --json, options and stdin", () => {
  const csv = run([data("coffee-taste-test.csv"), "--csv", "--draws", "200"]).out.split("\n");
  assert.equal(csv[0], "rank,player,rating,rating_se,log_strength,se,lower,upper,rank_low,rank_high,p_top,games,wins,ties,losses,actual_score,expected_score");
  assert.match(csv[1], /^1,Ethiopia washed,/);
  assert.equal(csv.filter(Boolean).length, 6);
  const j = JSON.parse(run([data("premier-league-2023-24.csv"), "--json", "--ties", "half", "--home", "no", "--draws", "0"]).out);
  assert.equal(j.settings.ties, "half");
  assert.equal(j.settings.home, false);
  assert.equal(j.home, null);
  const out = execFileSync(process.execPath, [CLI, "--ties", "drop", "--draws", "0"], { input: readFileSync(data("premier-league-2023-24.csv")) }).toString();
  assert.match(out, /^20 players, 298 games\./);
});

test("errors exit non-zero with a plain message", () => {
  assert.equal(run(["--nope"]).code, 2);
  assert.equal(run(["--ties", "maybe"]).code, 2);
  assert.equal(run(["--level", "2"]).code, 2);
  assert.equal(run(["--draws", "1.5"]).code, 2);
  assert.equal(run(["--predict", "onlyone"]).code, 2);
  assert.equal(run([]).code, 2);
  assert.equal(run(["/no/such/file.csv"]).code, 2);
  const dir = mkdtempSync(join(tmpdir(), "pr-"));
  const f = join(dir, "bad.csv");
  writeFileSync(f, "a,b,result\nx,y,D\ny,x,D\n");
  const r = run([f]);
  assert.equal(r.code, 1);
  assert.match(r.out, /Every result is a tie/);
  assert.deepEqual(parseArgs(["x.csv", "--level=0.9", "--prior-sd", "2"]), { json: false, help: false, csv: false, file: "x.csv", ties: "auto", home: "auto", priorSd: 2, level: 0.9, draws: 4000, seed: 20261118, predict: null });
});
