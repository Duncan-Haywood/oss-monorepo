"""Serial protocol between the Raspberry Pi (planner) and the ESP32 (motors and safety).

This file runs unchanged on CPython and on MicroPython (copy it to the
board next to firmware/esp32/main.py), so both ends share one definition.
Keep it free of dataclasses, f-string debugging and typing imports.

Frame:  0xA5 | cmd | len | payload[len] | crc8(cmd, len, payload)
All integers little-endian. CRC-8 polynomial 0x07, init 0x00.
(The framing is the one Open Tennis Robots uses, so tools carry over.)
"""

import struct

SYNC = 0xA5

HEARTBEAT = 0x01
ESTOP = 0x02
CLEAR_ESTOP = 0x03
CLEAR_FAULT = 0x04    # clear a latched wheel-drop, over-temperature or low-battery stop
DRIVE = 0x20          # int16 left_mm_s, int16 right_mm_s
CLEAN = 0x30          # uint8 fan_pct, uint8 main_brush_pct, uint8 side_brush_pct
MOP = 0x31            # uint8 pump_pct, uint8 vibration_pct, uint8 pad_down
TELEMETRY = 0x80      # uint16 flags, int16 left_mm_s, int16 right_mm_s, uint16 battery_mv, int16 temp_dC

FORMATS = {
    HEARTBEAT: "",
    ESTOP: "",
    CLEAR_ESTOP: "",
    CLEAR_FAULT: "",
    DRIVE: "<hh",
    CLEAN: "<BBB",
    MOP: "<BBB",
    TELEMETRY: "<HhhHh",
}

# TELEMETRY flag bits
FLAG_ESTOP = 1
FLAG_WATCHDOG = 2        # stopped because heartbeats stopped
FLAG_BUMPER = 4
FLAG_CLIFF = 8
FLAG_WHEEL_DROP = 16     # robot lifted or a wheel over an edge: everything stopped, latched
FLAG_LOW_BATTERY = 32    # below the cut-off: everything stopped, latched
FLAG_OVER_TEMP = 64      # motor driver or pack too hot: everything stopped, latched
FLAG_BIN_MISSING = 128   # fan will not run without the bin in place
FLAG_TANK_EMPTY = 256
FLAG_BACKING_OFF = 512   # firmware is reversing away from a cliff
FLAG_PUMP_ON = 1024


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
            fmt = FORMATS.get(cmd)
            if fmt is None or struct.calcsize(fmt) != n:
                # Reject on the header: waiting for a garbage length would stall the stream.
                self.errors += 1
                self.buf = self.buf[1:]
                continue
            if len(self.buf) < 4 + n:
                return out
            body = bytes(self.buf[1:3 + n])
            crc = self.buf[3 + n]
            if crc != crc8(body):
                self.errors += 1
                self.buf = self.buf[1:]
                continue
            self.buf = self.buf[4 + n:]
            out.append((cmd, struct.unpack(fmt, body[2:]) if fmt else ()))
