"""Serial protocol between the Raspberry Pi (planner) and the ESP32 (motors, blade, safety).

This file runs unchanged on CPython and on MicroPython (copy it to the
board next to firmware/esp32/main.py), so both ends share one definition.
Keep it free of dataclasses, f-strings and typing imports.

Frame:  0xA5 | cmd | len | payload[len] | crc8(cmd, len, payload)
All integers little-endian. CRC-8 polynomial 0x07, init 0x00.
"""

import struct

SYNC = 0xA5

HEARTBEAT = 0x01
ESTOP = 0x02          # software stop: latches like the stop button
CLEAR_ESTOP = 0x03    # refused while any stop input is still active
DRIVE = 0x20          # int16 left_mm_s, int16 right_mm_s
BLADE = 0x30          # uint16 rpm (0 = stop with short brake)
TELEMETRY = 0x80      # uint16 flags, uint16 stop_cause, int16 blade_rpm, uint16 battery_mv, int16 pitch_cdeg, int16 roll_cdeg

FORMATS = {
    HEARTBEAT: "",
    ESTOP: "",
    CLEAR_ESTOP: "",
    DRIVE: "<hh",
    BLADE: "<H",
    TELEMETRY: "<HHhHhh",
}

# TELEMETRY flag bits (current state)
FLAG_ESTOP = 1          # latched stop: see stop_cause
FLAG_WATCHDOG = 2       # stopped because heartbeats stopped
FLAG_BUMP = 4           # shell pushed sideways: forward drive and blade refused
FLAG_LIFT = 8           # shell lifted off its posts
FLAG_TILT = 16          # beyond the blade tilt limit
FLAG_RAIN = 32          # rain sensor wet: blade refused, the Pi should go home
FLAG_LOW_BATTERY = 64   # go home
FLAG_BATTERY_CUTOFF = 128
FLAG_BLADE_ON = 256
FLAG_BLADE_FAULT = 512  # the disc did not stop in time: latched until power cycle
FLAG_CHARGING = 1024

# stop_cause bits (what latched the stop; cleared by CLEAR_ESTOP)
CAUSE_BUTTON = 1
CAUSE_LIFT = 2
CAUSE_TILT = 4          # beyond the tip-over limit (all motors stop)
CAUSE_SOFTWARE = 8


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
            if crc != crc8(body) or fmt is None or struct.calcsize(fmt) != n:
                self.errors += 1
                self.buf = self.buf[1:]
                continue
            self.buf = self.buf[4 + n:]
            out.append((cmd, struct.unpack(fmt, body[2:]) if fmt else ()))
