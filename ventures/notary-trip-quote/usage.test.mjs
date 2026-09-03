import test from 'node:test';
import assert from 'node:assert/strict';
import { recordUsage } from './usage.mjs';
test('usage module is safe outside a browser', () => assert.doesNotThrow(() => recordUsage('quote_calculated')));
