// a.mjs reads b's constant while a is still loading. Entered from a, b runs
// first and is fine; entered from b, a runs first and b's RATE is not yet set.
import { RATE } from './b.mjs';
export const DOUBLE = RATE * 2;
