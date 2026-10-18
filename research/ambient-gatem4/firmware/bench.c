/* Emulator driver, not firmware: one gate in static storage and two entry points the Python side calls. */
#include "adaptive_gate.h"

static adaptive_gate_t g;

void bench_init(uint32_t k, uint16_t hangover) { adaptive_gate_init(&g, k, hangover); }
int bench_push(const int16_t *frame, size_t n) { return adaptive_gate_push(&g, frame, n); }
uint32_t bench_floor(void) { return adaptive_gate_floor(&g); }
