#include <stdio.h>
#include "adaptive_gate.h"

static int16_t loud[320], quiet[320];
#define CHECK(c) do { if (!(c)) { printf("FAIL line %d: %s\n", __LINE__, #c); return 1; } } while (0)

int main(void) {
    for (int i = 0; i < 320; i++) { loud[i] = (i & 1) ? 3000 : -3000; quiet[i] = (i & 1) ? 100 : -100; }
    adaptive_gate_t g;
    adaptive_gate_init(&g, 4, 2);
    /* the first frame is its own floor, so ms >= 4*ms is false: closed */
    CHECK(adaptive_gate_push(&g, quiet, 320) == 0);
    for (int i = 0; i < 20; i++) CHECK(adaptive_gate_push(&g, quiet, 320) == 0);
    CHECK(adaptive_gate_floor(&g) == 10000u);   /* floor used for the last push */
    CHECK(adaptive_gate_push(&g, loud, 320) == 1);
    CHECK(adaptive_gate_push(&g, quiet, 320) == 1);   /* hangover 2 */
    CHECK(adaptive_gate_push(&g, quiet, 320) == 1);
    CHECK(adaptive_gate_push(&g, quiet, 320) == 0);
    CHECK(adaptive_gate_push(&g, quiet, 0) == 0);     /* empty frame: ms 0 is the floor, clamped to 1 */
    printf("ok\n");
    return 0;
}
