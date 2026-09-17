import test from "node:test";
import assert from "node:assert/strict";
import { run } from "./cli.mjs";

const GOOD_CSV = [
  "id,title,description,link,image_link,availability,price,brand,gtin",
  'sku-1,Blue Cotton T-Shirt,A soft breathable blue cotton t-shirt.,https://shop.example.test/blue-tee,https://shop.example.test/blue-tee.jpg,in stock,19.99 USD,Examplewear,4006381333931',
].join("\n");

const BAD_CSV = [
  "id,title,description,link,image_link,availability,price",
  ",BAD TITLE FREE SHIPPING,short,not-a-url,not-a-url,maybe,free",
].join("\n");

function fakeReadFile(files) {
  return async (p) => {
    if (!(p in files)) throw new Error(`ENOENT: no such file, open '${p}'`);
    return files[p];
  };
}

test("--help prints usage and exits 0", async () => {
  const { exitCode, output } = await run(["--help"]);
  assert.equal(exitCode, 0);
  assert.match(output, /Usage:/);
});

test("no subcommand exits 1 with usage", async () => {
  const { exitCode, output } = await run([]);
  assert.equal(exitCode, 1);
  assert.match(output, /Usage:/);
});

test("check on a fully valid feed exits 0", async () => {
  const { exitCode, output } = await run(["check", "feed.csv"], { readFile: fakeReadFile({ "feed.csv": GOOD_CSV }) });
  assert.equal(exitCode, 0);
  assert.match(output, /0 error/);
});

test("check on a feed with errors exits 1 and names the codes", async () => {
  const { exitCode, output } = await run(["check", "feed.csv"], { readFile: fakeReadFile({ "feed.csv": BAD_CSV }) });
  assert.equal(exitCode, 1);
  assert.match(output, /missing-required/);
  assert.match(output, /invalid-availability/);
});

test("check --json emits parseable JSON with the same totals", async () => {
  const { exitCode, output } = await run(["check", "feed.csv", "--json"], { readFile: fakeReadFile({ "feed.csv": GOOD_CSV }) });
  assert.equal(exitCode, 0);
  const parsed = JSON.parse(output);
  assert.equal(parsed.totalErrors, 0);
  assert.equal(parsed.totalItems, 1);
});

test("check --max-warnings 0 fails a feed that is warning-only", async () => {
  const warnOnlyCsv = [
    "id,title,description,link,image_link,availability,price",
    "sku-1,A Thing,A short description of the thing.,https://shop.example.test/a,https://shop.example.test/a.jpg,in stock,9.99 USD",
  ].join("\n");
  const withoutFlag = await run(["check", "feed.csv"], { readFile: fakeReadFile({ "feed.csv": warnOnlyCsv }) });
  assert.equal(withoutFlag.exitCode, 0);
  const withFlag = await run(["check", "feed.csv", "--max-warnings", "0"], { readFile: fakeReadFile({ "feed.csv": warnOnlyCsv }) });
  assert.equal(withFlag.exitCode, 1);
});

test("check on a missing file exits 2 with a readable error", async () => {
  const { exitCode, output } = await run(["check", "missing.csv"], { readFile: fakeReadFile({}) });
  assert.equal(exitCode, 2);
  assert.match(output, /Error:/);
});

test("check with no path argument exits 2", async () => {
  const { exitCode } = await run(["check"]);
  assert.equal(exitCode, 2);
});

test("unknown subcommand exits 2", async () => {
  const { exitCode, output } = await run(["frobnicate"]);
  assert.equal(exitCode, 2);
  assert.match(output, /Unknown subcommand/);
});
