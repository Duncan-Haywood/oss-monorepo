import test from 'node:test';
import assert from 'node:assert/strict';
import { importRepairOrders, classifyPayType, parseNumber, parseTable } from './ro-import.mjs';

const CSV = `RO,Tech,Pay Type,Hours Billed,Labor Sales,Clock Hours
1001,Ana,Customer Pay,2.0,"$330.00",2.5
1002,Ana,Warranty,1.5,"$142.50",1.0
1003,Ben,CP,3,"$420.00",3.5
1004,Ben,Fleet,1,$110,1
1005,Ben,Comeback,0.8,,0.8
`;

test('totals by pay type and fills the calculator fields', () => {
  const r = importRepairOrders(CSV);
  assert.equal(r.ok, true);
  assert.equal(r.totals.customerPay.hours, 6);
  assert.equal(r.totals.customerPay.sales, 860);
  assert.equal(r.totals.warranty.hours, 1.5);
  assert.equal(r.totals.internal.hours, 0.8);
  assert.equal(r.totals.internal.sales, 0);
  assert.deepEqual(r.fields, {
    customerPayHours: '6', customerPayLaborSales: '860', warrantyHours: '1.5',
    warrantyLaborSales: '143', internalHours: '0.8', totalClockHours: '9',
  });
  assert.equal(r.skipped.length, 0);
});

test('per-technician effective rate excludes internal hours', () => {
  const r = importRepairOrders(CSV);
  const ben = r.byTech.find((t) => t.name === 'Ben');
  assert.equal(ben.soldHours, 4);
  assert.equal(ben.internalHours, 0.8);
  assert.equal(ben.effectiveRate, 132.5);
});

test('unclassifiable and malformed rows are skipped with a reason, not guessed', () => {
  const r = importRepairOrders('Pay Type,Hours,Labor Sales\nCustomer,1,100\nMystery,1,100\nCustomer,abc,50\nCustomer,-1,50\nCustomer,1,xx\n');
  assert.equal(r.totals.customerPay.hours, 1);
  assert.deepEqual(r.skipped.map((s) => s.line), [3, 4, 5, 6]);
});

test('extended warranty is warranty, not customer pay', () => {
  assert.equal(classifyPayType('Extended Warranty'), 'warranty');
  assert.equal(classifyPayType('Customer Pay'), 'customerPay');
  assert.equal(classifyPayType('Internal'), 'internal');
  assert.equal(classifyPayType('???'), null);
});

test('credits (negative or parenthesised dollars) reduce sales', () => {
  assert.equal(parseNumber('(120.00)'), -120);
  assert.equal(parseNumber('-$5'), -5);
  assert.equal(parseNumber('$1,234.50'), 1234.5);
  assert.ok(Number.isNaN(parseNumber('1.2.3')));
  const r = importRepairOrders('Pay Type,Hours,Labor Sales\nCP,2,300\nCP,0,-50\n');
  assert.equal(r.totals.customerPay.sales, 250);
});

test('tab-separated paste from a spreadsheet works, quotes and BOM too', () => {
  const r = importRepairOrders('﻿Pay Type\tHours\tLabor Sales\nCP\t2\t300\n');
  assert.equal(r.ok, true);
  assert.equal(parseTable('a,"b,c",d\n')[0][1], 'b,c');
});

test('a header with no recognisable columns names what is missing', () => {
  const r = importRepairOrders('foo,bar\n1,2\n');
  assert.equal(r.ok, false);
  assert.match(r.error, /pay type, hours billed, labor sales/);
  assert.equal(importRepairOrders('').ok, false);
});
