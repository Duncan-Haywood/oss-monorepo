/* Noise-adaptive energy gate for a 16 kHz mono PCM stream (port of ambient-gateroc's adaptive gate).
 * Open while frame mean-square >= k * (running-minimum noise floor), with hangover.
 * The floor is the minimum frame energy over the last 250 frames (5 s of 20 ms frames), kept as
 * block minima: AGATE_BLOCK frames per block. AGATE_BLOCK 1 is the exact window; 10 keeps 24
 * finished blocks plus the current one (a window of 241-250 frames) in 1/10 of the RAM.
 * Plain C99, no allocation, no SDK. MIT. */
#ifndef ADAPTIVE_GATE_H
#define ADAPTIVE_GATE_H
#include <stdint.h>
#include <stddef.h>

#ifndef AGATE_BLOCK
#define AGATE_BLOCK 1
#endif
#define AGATE_WINDOW 250
#define AGATE_RING (AGATE_WINDOW / AGATE_BLOCK - 1)   /* finished blocks kept */

typedef struct {
    uint32_t k;                  /* open when ms >= k * max(floor, 1) */
    uint16_t hangover, left;
    uint16_t head, filled;       /* ring position and number of valid finished blocks */
    uint16_t cur_n;              /* frames in the current block */
    uint32_t cur_min;
    uint32_t last_floor;         /* floor used for the latest push */
    uint32_t ring[AGATE_RING];
} adaptive_gate_t;

void adaptive_gate_init(adaptive_gate_t *g, uint32_t k, uint16_t hangover);
/* Returns 1 while the gate is open (encode and send the frame), else 0. */
int adaptive_gate_push(adaptive_gate_t *g, const int16_t *frame, size_t n);
/* Noise floor (mean-square) used for the most recent push. */
uint32_t adaptive_gate_floor(const adaptive_gate_t *g);

#ifdef AGATE_COUNT
extern unsigned long agate_compares;   /* host-only instrumentation: floor-scan comparisons */
#endif
#endif
