#include "adaptive_gate.h"

#ifdef AGATE_COUNT
unsigned long agate_compares;
#define COUNT() (agate_compares++)
#else
#define COUNT() ((void)0)
#endif

void adaptive_gate_init(adaptive_gate_t *g, uint32_t k, uint16_t hangover) {
    g->k = k;
    g->hangover = hangover;
    g->left = 0;
    g->head = 0;
    g->filled = 0;
    g->cur_n = 0;
    g->cur_min = UINT32_MAX;
    g->last_floor = 0;
}

static uint32_t floor_now(const adaptive_gate_t *g) {
    uint32_t m = g->cur_min;
    for (uint16_t i = 0; i < g->filled; i++) {
        COUNT();
        if (g->ring[i] < m) m = g->ring[i];
    }
    return m;
}

uint32_t adaptive_gate_floor(const adaptive_gate_t *g) { return g->last_floor; }

int adaptive_gate_push(adaptive_gate_t *g, const int16_t *frame, size_t n) {
    uint64_t acc = 0;
    for (size_t i = 0; i < n; i++) {
        int32_t s = frame[i];
        acc += (uint64_t)(s * s);
    }
    uint32_t ms = n ? (uint32_t)(acc / n) : 0;

    if (ms < g->cur_min) g->cur_min = ms;
    uint32_t fl = floor_now(g);
    g->last_floor = fl;
    if (fl < 1) fl = 1;
    if ((uint64_t)ms >= (uint64_t)g->k * fl) g->left = g->hangover + 1;

    if (++g->cur_n == AGATE_BLOCK) {      /* close the block, after the floor was read */
        g->ring[g->head] = g->cur_min;
        g->head = (uint16_t)((g->head + 1) % AGATE_RING);
        if (g->filled < AGATE_RING) g->filled++;
        g->cur_n = 0;
        g->cur_min = UINT32_MAX;
    }
    if (g->left) { g->left--; return 1; }
    return 0;
}
