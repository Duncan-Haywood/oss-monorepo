/* Variants of ambient-gatefw's adaptive gate for Cortex-M4 (same state layout and block-minimum floor).
 * GATE_VARIANT 1: energy sum with the DSP dual multiply-accumulate SMLALD (two samples per instruction),
 *                 mean-square and 64-bit divide as in the original.
 * GATE_VARIANT 2: SMLALD, and no divide: block minima and the floor are kept as frame SUMS of squares,
 *                 and the gate opens when sum >= k * max(floor_sum, n). Not bit-exact with the mean-square
 *                 gate (it skips the floor() of the mean); experiments/run.py measures the difference.
 * Plain C99 plus <arm_acle.h>; MIT. */
#include <arm_acle.h>
#include <stdint.h>
#include <stddef.h>

#ifndef AGATE_BLOCK
#define AGATE_BLOCK 1
#endif
#define AGATE_WINDOW 250
#define AGATE_RING (AGATE_WINDOW / AGATE_BLOCK - 1)

typedef struct {
    uint32_t k;
    uint16_t hangover, left;
    uint16_t head, filled, cur_n;
    uint64_t cur_min;                 /* mean-square (variant 1) or sum of squares (variant 2) */
    uint64_t last_floor;
    uint64_t ring[AGATE_RING];
} gate_t;

static gate_t g;

void bench_init(uint32_t k, uint16_t hangover) {
    g.k = k; g.hangover = hangover; g.left = 0; g.head = 0; g.filled = 0; g.cur_n = 0;
    g.cur_min = UINT64_MAX; g.last_floor = 0;
}

static uint64_t energy_sum(const int16_t *f, size_t n) {
    uint64_t acc = 0;
    size_t i = 0;
    for (; i + 1 < n; i += 2) {
        uint32_t pair;
        __builtin_memcpy(&pair, f + i, 4);
        acc = __smlald(pair, pair, acc);
    }
    if (i < n) acc += (uint64_t)((int32_t)f[i] * f[i]);
    return acc;
}

int bench_push(const int16_t *frame, size_t n) {
    uint64_t e = energy_sum(frame, n);
#if GATE_VARIANT == 1
    uint64_t v = n ? e / n : 0;
#else
    uint64_t v = e;
#endif
    if (v < g.cur_min) g.cur_min = v;
    uint64_t fl = g.cur_min;
    for (uint16_t i = 0; i < g.filled; i++)
        if (g.ring[i] < fl) fl = g.ring[i];
    g.last_floor = fl;
#if GATE_VARIANT == 1
    if (fl < 1) fl = 1;
#else
    if (fl < n) fl = n;
#endif
    if (v >= (uint64_t)g.k * fl) g.left = g.hangover + 1;

    if (++g.cur_n == AGATE_BLOCK) {
        g.ring[g.head] = g.cur_min;
        g.head = (uint16_t)((g.head + 1) % AGATE_RING);
        if (g.filled < AGATE_RING) g.filled++;
        g.cur_n = 0;
        g.cur_min = UINT64_MAX;
    }
    if (g.left) { g.left--; return 1; }
    return 0;
}

uint32_t bench_floor(void) { return (uint32_t)g.last_floor; }   /* floor is only compared in the tests for small values */
