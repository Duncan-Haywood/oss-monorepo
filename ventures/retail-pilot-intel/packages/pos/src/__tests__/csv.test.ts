import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCsv, parseCsvRecords } from "../csv.js";

test("parseCsv parses basic comma-separated rows", () => {
  const rows = parseCsv("a,b,c\n1,2,3\n");
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("parseCsv handles quoted fields with embedded commas", () => {
  const rows = parseCsv('name,note\n"Doe, Jane",hello\n');
  assert.deepEqual(rows, [
    ["name", "note"],
    ["Doe, Jane", "hello"],
  ]);
});

test("parseCsv unescapes doubled quotes inside quoted fields", () => {
  const rows = parseCsv('name,quote\nJane,"She said ""hi"""\n');
  assert.deepEqual(rows, [
    ["name", "quote"],
    ["Jane", 'She said "hi"'],
  ]);
});

test("parseCsv handles embedded newlines inside quoted fields", () => {
  const rows = parseCsv('name,address\nJane,"123 Main St\nSuite 4"\n');
  assert.deepEqual(rows, [
    ["name", "address"],
    ["Jane", "123 Main St\nSuite 4"],
  ]);
});

test("parseCsv treats CRLF line endings as a single row break", () => {
  const rows = parseCsv("a,b\r\n1,2\r\n3,4\r\n");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("parseCsv includes a trailing row that has no final newline", () => {
  const rows = parseCsv("a,b\n1,2\n3,4");
  assert.deepEqual(rows, [
    ["a", "b"],
    ["1", "2"],
    ["3", "4"],
  ]);
});

test("parseCsvRecords maps each row onto trimmed header keys and values", () => {
  const records = parseCsvRecords("sku, qty ,price\nA1, 3 , 9.99\nA2,1,4.50\n");
  assert.deepEqual(records, [
    { sku: "A1", qty: "3", price: "9.99" },
    { sku: "A2", qty: "1", price: "4.50" },
  ]);
});

test("parseCsvRecords returns an empty array for empty input", () => {
  assert.deepEqual(parseCsvRecords(""), []);
});
