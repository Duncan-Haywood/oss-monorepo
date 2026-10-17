#include "vad_gate.h"

void vad_gate_init(vad_gate_t *g, uint32_t threshold, uint16_t hangover) {
    g->threshold = threshold;
    g->hangover = hangover;
    g->left = 0;
}

int vad_gate_push(vad_gate_t *g, const int16_t *frame, size_t n) {
    uint64_t acc = 0;
    for (size_t i = 0; i < n; i++) {
        int32_t s = frame[i];
        acc += (uint64_t)(s * s);
    }
    uint32_t ms = n ? (uint32_t)(acc / n) : 0;
    if (ms >= g->threshold) g->left = g->hangover + 1;
    if (g->left) { g->left--; return 1; }
    return 0;
}
