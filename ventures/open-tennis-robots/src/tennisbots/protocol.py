"""Serial protocol between the Raspberry Pi (planner) and the ESP32 (motors).

This file runs unchanged on CPython and on MicroPython (copy it to the
board next to firmware/esp32/main.py), so both ends share one definition.
Keep it free of dataclasses, f-string debugging and typing imports.

Frame:  0xA5 | cmd | len | payload[len] | crc8(cmd, len, payload)
All integers little-endian. CRC-8 polynomial 0x07, init 0x00.
"""

import struct

SYNC = 0xA5

HEARTBEAT = 0x01
ESTOP = 0x02
CLEAR_ESTOP = 0x03
SET_WHEELS = 0x10     # int16 rpm_top, int16 rpm_bottom
SET_AIM = 0x11        # int16 elevation_cdeg, int16 azimuth_cdeg
FEED = 0x12           # uint8 balls
SET_BASE = 0x13       # int16 target_y_mm, uint16 max_speed_mm_s
RESET_LIFT_HUB = 0x14  # uint16 key (RESET_LIFT_HUB_KEY): the lift's slip hub was re-set on the bench; restart its jam count
SURVEY_TAKE = 0x15    # uint8 on (2026-11-17, firmware/esp32/README.md "The contact time surveyed on the board"): the feeder
                      # refits each launched wheel at TAKE_SURVEY_TIMES contact times too; the Pi sends it for a
                      # calibration drill and turns it off at the drill's end
DRIVE = 0x20          # int16 left_mm_s, int16 right_mm_s
PICKUP = 0x21         # uint8 on
TELEMETRY = 0x80      # uint16 flags, int16 base_y_mm, int16 rpm_top, int16 rpm_bottom, uint16 battery_mv,
                      # uint8 balls_fed (feeder: balls released through the gate since power-up, mod 256)
LAUNCH = 0x81         # feeder, after TELEMETRY once a stroke has been judged (2026-11-16): uint8 seq (verdicts mod 256),
                      # int16 rpm_top, int16 rpm_bottom (each wheel's speed just before the ball), int16 drop_top,
                      # int16 drop_bottom (the fall below that, in 1/10000 of it), uint8 flags: bit 0 a ball went;
                      # bit 1 / bit 2 the top / bottom drop is the whole drop fitted from the pulse times, else the
                      # lowest single-revolution reading's fall (README "The drop from the pulse times"); bit 3 / bit 4
                      # that drop came from the loop's own commands (README "A recovery shaped by the loop's own
                      # commands"): the board re-sends the record under the same seq once that fit is done; bit 5 that
                      # fit is still under way (the Pi waits for it before a re-plan and at a drill's end); bit 6 /
                      # bit 7 the top / bottom loop fit's own misses give its drop a standard error over LOOP_SE_MAX
                      # (1%) of it (README "When the wheel is not a first-order lag")
ESC_SURVEY = 0x82     # feeder, after LAUNCH once the board has surveyed a wheel (2026-11-16, README "The ESC lag surveyed
                      # on the board"): uint8 wheels summed (to 255), uint16 the lag with the least summed residual, ms,
                      # uint16 that lag refined between its neighbours, ms, then uint16 x ESC_SURVEY_LAGS: each grid lag's
                      # mean residual rms in 1e-6 of the pre-ball speed (65535: no such lag); since 2026-11-16 the
                      # sums leave out a wheel fitting over SURVEY_TRIM (5) x worse than the median one. The grid is the
                      # firmware's ESC_SURVEY_GRID_US, 0 / 20 / 50 / 100 / 150 / 200 / 400 ms (150 and the seventh slot
                      # since 2026-11-18: a Pi and a board on either side of that date do not read each other's frame).
ESC_SURVEY_LAGS = 7
ESC_TAU = 0x83        # feeder, after TELEMETRY every period (2026-11-16, README "Checked before a calibration drill"):
                      # uint16 the ESC lag the board's drop fit runs with (config ESC_TAU_US), ms, so the Pi can compare
                      # it with the last drill's ESC_SURVEY before it feeds a ball
TAKE_SURVEY = 0x84    # feeder, after LAUNCH while the board has a contact-time survey (2026-11-17, README "The contact time
                      # surveyed on the board"): uint8 wheels summed (to 255), uint16 the contact time with the least
                      # summed residual, uint16 that time refined between its neighbours, uint16 the contact time the
                      # board's drop fit runs with (config TAKE_US), all in 0.1 ms, then uint16 x TAKE_SURVEY_TIMES:
                      # each candidate's mean residual rms in 1e-6 of the pre-ball speed (65535: none). The candidates
                      # are the firmware's TAKE_SURVEY_GRID_US, 0 / 1.5 / 2.5 / 3 / 4 / 5 / 6 / 7 / 8 ms (7 added 2026-11-19, 1.5 and 2.5
                      # in place of 2 later that day: README "Short takes on a second held-out set"), half-sine. Since
                      # 2026-11-18 (README "The take survey's verdict needs two informative wheels") a last uint8: the
                      # wheels summed, to 255, after the take-blind ones were left out; the Pi still reads the shorter
                      # frame of older firmware (OLDER_FORMATS) and then has no such count. Firmware before
                      # 2026-11-19 sent seven candidates (no 7 ms), and before the short-take grid eight (0, 2-8 ms);
                      # all three older frames still decode. Since 2026-11-19 (README "The take survey's rms in tenths of
                      # a ppm") a second last uint8: the rms slots' units per ppm, 10 (tenths) unless a value would pass
                      # 65534 tenths, then 1 (whole ppm, as every older frame). A frame without it reads as whole ppm.
                      # Since later on 2026-11-19 (README "Straddling wheels vote on the short takes") two more uint8:
                      # the kept wheels whose fit at 1.5 ms (controller.TAKE_STRADDLE_US) put the take across a
                      # revolution's edge and fit it better than the step, and those that fit it worse, each to 255.
TAKE_SURVEY_TIMES = 9
TAKE_SURVEY_TENTHS = 10       # the scale byte the board sends when every rms fits in tenths of a ppm
EIGHT_TAKE_SURVEY_TIMES = 8   # 0, 2, 3, 4, 5, 6, 7, 8 ms (2026-11-19, before the short-take grid)
OLDER_TAKE_SURVEY_TIMES = 7

FORMATS = {
    HEARTBEAT: "",
    ESTOP: "",
    CLEAR_ESTOP: "",
    SET_WHEELS: "<hh",
    SET_AIM: "<hh",
    FEED: "<B",
    SET_BASE: "<hH",
    RESET_LIFT_HUB: "<H",
    SURVEY_TAKE: "<B",
    DRIVE: "<hh",
    PICKUP: "<B",
    TELEMETRY: "<HhhhHB",
    LAUNCH: "<BhhhhB",
    ESC_SURVEY: "<BHH" + "H" * ESC_SURVEY_LAGS,
    ESC_TAU: "<H",
    TAKE_SURVEY: "<BHHH" + "H" * TAKE_SURVEY_TIMES + "BBBBBB",
}
# Frames of these lengths from older firmware still decode, to fewer values (the receiver reads the length), newest first:
# nine candidates with the 1.5 ms straddle vote only (2026-11-19, before "A second straddle vote at 2.5 ms"), nine candidates in tenths with no straddle vote (2026-11-19, before "Straddling wheels vote on the short takes"), nine candidates in whole ppm with no scale byte (2026-11-19, before tenths), eight candidates (2026-11-19, before the short-take grid), seven with the summed-wheel byte (2026-11-18), then
# seven without it.
OLDER_FORMATS = {
    TAKE_SURVEY: ("<BHHH" + "H" * TAKE_SURVEY_TIMES + "BBBB", "<BHHH" + "H" * TAKE_SURVEY_TIMES + "BB", "<BHHH" + "H" * TAKE_SURVEY_TIMES + "B", "<BHHH" + "H" * EIGHT_TAKE_SURVEY_TIMES + "B", "<BHHH" + "H" * OLDER_TAKE_SURVEY_TIMES + "B",
                  "<BHHH" + "H" * OLDER_TAKE_SURVEY_TIMES),
}

# TELEMETRY flag bits
FLAG_ESTOP = 1
FLAG_WATCHDOG = 2       # stopped because heartbeats stopped
FLAG_BUMPER = 4
FLAG_HOPPER_EMPTY = 8     # feeder: the last feed stroke put no ball through the wheels (their speed did not drop: an empty
                          # pocket, so an empty tub, a bridged outlet or a stuck ball); cleared by the next FEED (2026-11-16)
FLAG_HOPPER_FULL = 16
FLAG_LOW_BATTERY = 32
FLAG_AZ_UNHOMED = 64     # azimuth stepper has no position yet (homing, or lost after an abrupt stop)
FLAG_AIM_SETTLING = 128  # elevation or azimuth not yet at its goal (or homing): the feed gate waits for it
FLAG_ELEV_FAULT = 256    # elevation actuator stopped: feedback lost or stalled; power-cycle the board to retry
FLAG_WHEELS_SETTLING = 512  # launcher wheels not yet held within 3% of target for 150 ms (or stopped): the gate waits
FLAG_BUS_OFF = 1024       # switched bus not up (contactor open, or closed under CONTACTOR_SETTLE_MS ago): motors unpowered
FLAG_LIFT_JAM = 2048      # ball lift stalled again after its retries and is off: clear the jam, press and release the e-stop
FLAG_LIFT_HUB_DUE = 4096  # the lift has cut LIFT_SLIP_JAMS jams since its slip hub was last set (or the count in flash is
                          # unreadable): re-set the hub on the bench, then send RESET_LIFT_HUB. The lift still runs.

# RESET_LIFT_HUB's payload must be this, so a stray or mistyped command cannot zero the count.
RESET_LIFT_HUB_KEY = 0x4855


def crc8(data):
    crc = 0
    for b in data:
        crc ^= b
        for _ in range(8):
            crc = ((crc << 1) ^ 0x07) & 0xFF if crc & 0x80 else (crc << 1) & 0xFF
    return crc


def encode(cmd, *values):
    fmt = FORMATS[cmd]
    payload = struct.pack(fmt, *values) if fmt else b""
    body = bytes([cmd, len(payload)]) + payload
    return bytes([SYNC]) + body + bytes([crc8(body)])


class Decoder:
    """Streaming decoder: feed() raw bytes, get back complete (cmd, values) frames.

    Bad CRCs, unknown commands and wrong lengths are dropped and counted in
    `errors`; the decoder resynchronises on the next 0xA5.
    """

    def __init__(self):
        self.buf = bytearray()
        self.errors = 0

    def feed(self, data):
        self.buf.extend(data)
        out = []
        while True:
            try:
                i = self.buf.index(SYNC)
            except ValueError:
                self.buf = bytearray()
                return out
            if i:
                self.buf = self.buf[i:]
            if len(self.buf) < 3:
                return out
            cmd, n = self.buf[1], self.buf[2]
            if len(self.buf) < 4 + n:
                return out
            body = bytes(self.buf[1:3 + n])
            crc = self.buf[3 + n]
            fmt = FORMATS.get(cmd)
            if fmt is not None and struct.calcsize(fmt) != n and cmd in OLDER_FORMATS:
                fmt = next((f for f in OLDER_FORMATS[cmd] if struct.calcsize(f) == n), fmt)
            if crc != crc8(body) or fmt is None or struct.calcsize(fmt) != n:
                self.errors += 1
                self.buf = self.buf[1:]
                continue
            self.buf = self.buf[4 + n:]
            out.append((cmd, struct.unpack(fmt, body[2:]) if fmt else ()))
