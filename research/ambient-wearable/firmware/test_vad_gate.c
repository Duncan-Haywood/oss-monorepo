#include <stdio.h>
#include <stdlib.h>
#include "vad_gate.h"

static int16_t loud[480], quiet[480];
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); return 1; } } while (0)

int main(void) {
    for (int i = 0; i < 480; i++) { loud[i] = (i & 1) ? 3000 : -3000; quiet[i] = (i & 1) ? 10 : -10; }
    vad_gate_t g;
    vad_gate_init(&g, 1000000u, 3);
    CHECK(vad_gate_push(&g, quiet, 480) == 0);
    CHECK(vad_gate_push(&g, loud, 480) == 1);
    /* hangover: stays open for exactly 3 quiet frames, then closes */
    CHECK(vad_gate_push(&g, quiet, 480) == 1);
    CHECK(vad_gate_push(&g, quiet, 480) == 1);
    CHECK(vad_gate_push(&g, quiet, 480) == 1);
    CHECK(vad_gate_push(&g, quiet, 480) == 0);
    CHECK(vad_gate_push(&g, quiet, 0) == 0);
    /* extreme samples do not overflow */
    for (int i = 0; i < 480; i++) loud[i] = -32768;
    CHECK(vad_gate_push(&g, loud, 480) == 1);
    printf("6 firmware checks passed\n");
    return 0;
}
