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
DRIVE = 0x20          # int16 left_mm_s, int16 right_mm_s
PICKUP = 0x21         # uint8 on
TELEMETRY = 0x80      # uint16 flags, int16 base_y_mm, int16 rpm_top, int16 rpm_bottom, uint16 battery_mv

FORMATS = {
    HEARTBEAT: "",
    ESTOP: "",
    CLEAR_ESTOP: "",
    SET_WHEELS: "<hh",
    SET_AIM: "<hh",
    FEED: "<B",
    SET_BASE: "<hH",
    DRIVE: "<hh",
    PICKUP: "<B",
    TELEMETRY: "<HhhhH",
}

# TELEMETRY flag bits
FLAG_ESTOP = 1
FLAG_WATCHDOG = 2       # stopped because heartbeats stopped
FLAG_BUMPER = 4
FLAG_HOPPER_EMPTY = 8
FLAG_HOPPER_FULL = 16
FLAG_LOW_BATTERY = 32


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
