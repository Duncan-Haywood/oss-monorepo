/* Energy gate for a 16 kHz mono PCM stream: speech/not-speech per frame with hangover.
 * Plain C99, no allocation, no SDK. Compiles for Cortex-M4 and for the host. MIT. */
#ifndef VAD_GATE_H
#define VAD_GATE_H
#include <stdint.h>
#include <stddef.h>

typedef struct {
    uint32_t threshold;   /* mean-square threshold on int16 samples */
    uint16_t hangover;    /* frames to stay open after the last loud frame */
    uint16_t left;        /* frames of hangover remaining */
} vad_gate_t;

void vad_gate_init(vad_gate_t *g, uint32_t threshold, uint16_t hangover);
/* Returns 1 while the gate is open (frame should be encoded and sent), else 0. */
int vad_gate_push(vad_gate_t *g, const int16_t *frame, size_t n);
#endif
