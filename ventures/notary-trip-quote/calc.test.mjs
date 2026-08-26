import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuote } from './calc.mjs';

const base = { travelMiles: 20, mileageRate: .7, travelMinutes: 30, hourlyRate: 60, appointmentMinutes: 45, minimumFee: 50, stateFees: 15, witnessFee: 25, witnesses: 1, afterHoursFee: 0, waitingMinutes: 0, waitingRate: 30 };
test('prices travel, time, fees, and witness', () => { const result = calculateQuote(base); assert.equal(result.travelCost, 14); assert.equal(result.travelTimeCost, 30); assert.equal(result.appointmentCost, 45); assert.equal(result.quote, 129); });
test('minimum protects a short appointment', () => { const result = calculateQuote({ ...base, travelMiles: 0, travelMinutes: 0, appointmentMinutes: 5, stateFees: 0, witnesses: 0, minimumFee: 75 }); assert.equal(result.minimumApplied, true); assert.equal(result.quote, 75); });
test('rejects negative or nonnumeric inputs', () => { assert.throws(() => calculateQuote({ ...base, travelMiles: -1 }), /Travel miles/); assert.throws(() => calculateQuote({ ...base, hourlyRate: 'nope' }), /Hourly rate/); });
