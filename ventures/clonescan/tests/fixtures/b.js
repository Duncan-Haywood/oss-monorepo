import { adjust } from './util.js';

/* copied, re-indented */
function total(items, rate) {
	const v0 = items[0] * rate + adjust(items, 0, 'x');
	const v1 = items[1] * rate + adjust(items, 1, 'x');
	const v2 = items[2] * rate + adjust(items, 2, 'x');
	const v3 = items[3] * rate + adjust(items, 3, 'x');
	const v4 = items[4] * rate + adjust(items, 4, 'x');
	const v5 = items[5] * rate + adjust(items, 5, 'x');
	const v6 = items[6] * rate + adjust(items, 6, 'x');
	const v7 = items[7] * rate + adjust(items, 7, 'x');
	const v8 = items[8] * rate + adjust(items, 8, 'x');
	const v9 = items[9] * rate + adjust(items, 9, 'x');
	return v0 + v9;
}
