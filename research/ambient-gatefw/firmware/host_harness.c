/* Host-only: run a whole stream through the gate for the Python tests and experiment. Not firmware. */
#include "adaptive_gate.h"

size_t harness_sizeof(void) { return sizeof(adaptive_gate_t); }

/* x: nframes * frame int16 samples. open_out: nframes bytes; floor_out: nframes uint32. */
void harness_run(const int16_t *x, size_t nframes, size_t frame, uint32_t k, uint16_t hangover,
                 uint8_t *open_out, uint32_t *floor_out) {
    adaptive_gate_t g;
    adaptive_gate_init(&g, k, hangover);
    for (size_t i = 0; i < nframes; i++) {
        open_out[i] = (uint8_t)adaptive_gate_push(&g, x + i * frame, frame);
        floor_out[i] = adaptive_gate_floor(&g);   /* floor used for this frame */
    }
}

#ifdef AGATE_COUNT
unsigned long harness_compares(void) { return agate_compares; }
#endif
