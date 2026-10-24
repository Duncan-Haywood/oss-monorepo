"""Minimal driver for Feetech STS/SMS serial bus servos (protocol 0), pure pyserial.

Packet format (Feetech communication protocol manual; FTServo SDK):

    instruction:  FF FF ID LEN INST P1..Pn CHK      LEN = n + 2
    status:       FF FF ID LEN ERR  P1..Pn CHK
    CHK = ~(ID + LEN + INST/ERR + sum(P)) & 0xFF

Multi-byte registers are little-endian. Signed registers use sign-magnitude, not two's
complement: bit 15 for position and speed, bit 10 for load (FTServo SDK, LeRobot
``encoding_utils``). Register addresses follow the STS/SMS control table (FTServo SDK
``sms_sts.py``; LeRobot ``motors/feetech/tables.py``). Untested on hardware in this
repository: ``MockBus`` checks the encoding, and a build log should confirm it on a servo.
"""
from __future__ import annotations

import time
from dataclasses import dataclass

PING, READ, WRITE, REG_WRITE, ACTION, SYNC_READ, SYNC_WRITE = 0x01, 0x02, 0x03, 0x04, 0x05, 0x82, 0x83
BROADCAST = 0xFE

# STS/SMS control table: name -> (address, size)
REG = {
    "model": (3, 2),
    "id": (5, 1),
    "baud": (6, 1),
    "return_delay": (7, 1),
    "min_angle": (9, 2),
    "max_angle": (11, 2),
    "max_torque": (16, 2),
    "p_gain": (21, 1),
    "d_gain": (22, 1),
    "i_gain": (23, 1),
    "homing_offset": (31, 2),
    "mode": (33, 1),  # 0 position, 1 constant speed (wheel), 2 open-loop PWM, 3 step
    "torque_enable": (40, 1),
    "acceleration": (41, 1),
    "goal_position": (42, 2),
    "goal_time": (44, 2),
    "goal_speed": (46, 2),
    "torque_limit": (48, 2),
    "lock": (55, 1),
    "present_position": (56, 2),
    "present_speed": (58, 2),
    "present_load": (60, 2),
    "present_voltage": (62, 1),
    "present_temperature": (63, 1),
    "moving": (66, 1),
    "present_current": (69, 2),
}
SIGN_BIT = {"goal_position": 15, "goal_speed": 15, "present_position": 15, "present_speed": 15,
            "present_load": 10, "homing_offset": 11, "present_current": 15}
MODE_POSITION, MODE_SPEED, MODE_PWM, MODE_STEP = 0, 1, 2, 3
TICKS_PER_REV = 4096


def checksum(body: bytes) -> int:
    return (~sum(body)) & 0xFF


def packet(servo_id: int, inst: int, params: bytes = b"") -> bytes:
    body = bytes([servo_id, len(params) + 2, inst]) + bytes(params)
    return b"\xff\xff" + body + bytes([checksum(body)])


def encode(value: int, size: int, sign_bit: int | None = None) -> bytes:
    if sign_bit is not None:
        mag = abs(int(value))
        if mag >= (1 << sign_bit):
            raise ValueError(f"{value} does not fit a sign-magnitude field with sign bit {sign_bit}")
        raw = mag | ((1 << sign_bit) if value < 0 else 0)
    else:
        raw = int(value)
        if not 0 <= raw < (1 << (8 * size)):
            raise ValueError(f"{value} does not fit {size} unsigned bytes")
    return raw.to_bytes(size, "little")


def decode(data: bytes, sign_bit: int | None = None) -> int:
    raw = int.from_bytes(data, "little")
    if sign_bit is None:
        return raw
    mag = raw & ((1 << sign_bit) - 1)
    return -mag if raw & (1 << sign_bit) else mag


def parse_status(buf: bytes) -> tuple[int, int, bytes, bytes]:
    """Parse one status packet at the start of ``buf``: (id, error, params, rest)."""
    i = buf.find(b"\xff\xff")
    if i < 0 or len(buf) < i + 6:
        raise TimeoutError("incomplete status packet")
    sid, ln, err = buf[i + 2], buf[i + 3], buf[i + 4]
    end = i + 4 + ln
    if len(buf) < end:
        raise TimeoutError("incomplete status packet")
    params = buf[i + 5:end - 1]
    if checksum(buf[i + 2:end - 1]) != buf[end - 1]:
        raise IOError(f"checksum error from servo {sid}")
    return sid, err, params, buf[end:]


class FeetechBus:
    """Half-duplex TTL bus (Waveshare Bus Servo Adapter / FE-URT-1 style USB adapter)."""

    def __init__(self, port: str | None = None, baudrate: int = 1_000_000, timeout: float = 0.02, serial=None):
        if serial is None:
            import serial as pyserial

            serial = pyserial.Serial(port, baudrate=baudrate, timeout=timeout)
        self.ser = serial

    # ------------------------------------------------------------------ raw transactions
    def _send(self, pkt: bytes) -> None:
        self.ser.reset_input_buffer()
        self.ser.write(pkt)

    def _recv(self, n_packets: int = 1, deadline: float = 0.05) -> list[tuple[int, int, bytes]]:
        buf = b""
        out = []
        t_end = time.monotonic() + deadline
        while len(out) < n_packets and time.monotonic() < t_end:
            buf += self.ser.read(max(1, self.ser.in_waiting or 1))
            while True:
                try:
                    sid, err, params, buf = parse_status(buf)
                except TimeoutError:
                    break
                out.append((sid, err, params))
        if len(out) < n_packets:
            raise TimeoutError(f"expected {n_packets} status packets, got {len(out)}")
        return out

    def ping(self, servo_id: int) -> bool:
        self._send(packet(servo_id, PING))
        try:
            self._recv(1)
            return True
        except TimeoutError:
            return False

    def read(self, servo_id: int, name: str) -> int:
        addr, size = REG[name]
        self._send(packet(servo_id, READ, bytes([addr, size])))
        (_, err, params), = self._recv(1)
        if err:
            raise IOError(f"servo {servo_id} error 0x{err:02x}")
        return decode(params, SIGN_BIT.get(name))

    def write(self, servo_id: int, name: str, value: int, wait_status: bool = True) -> None:
        addr, size = REG[name]
        self._send(packet(servo_id, WRITE, bytes([addr]) + encode(value, size, SIGN_BIT.get(name))))
        if wait_status and servo_id != BROADCAST:
            self._recv(1)

    def sync_write(self, name: str, values: dict[int, int]) -> None:
        addr, size = REG[name]
        params = bytes([addr, size])
        for sid, v in values.items():
            params += bytes([sid]) + encode(v, size, SIGN_BIT.get(name))
        self._send(packet(BROADCAST, SYNC_WRITE, params))  # no status for broadcast

    def sync_read(self, name: str, ids: list[int]) -> dict[int, int]:
        addr, size = REG[name]
        self._send(packet(BROADCAST, SYNC_READ, bytes([addr, size]) + bytes(ids)))
        res = self._recv(len(ids), deadline=0.002 * len(ids) + 0.02)
        return {sid: decode(params, SIGN_BIT.get(name)) for sid, err, params in res}

    # ------------------------------------------------------------------ EEPROM helpers
    def write_eeprom(self, servo_id: int, name: str, value: int) -> None:
        """EEPROM registers need the lock released and restored."""
        self.write(servo_id, "lock", 0)
        self.write(servo_id, name, value)
        self.write(servo_id, "lock", 1)


# ----------------------------------------------------------------------------------------
# A simulated bus for tests and dry runs (no hardware)
# ----------------------------------------------------------------------------------------

@dataclass
class _MockServo:
    mem: bytearray

    def get(self, name):
        a, n = REG[name]
        return decode(bytes(self.mem[a:a + n]), SIGN_BIT.get(name))

    def set(self, name, v):
        a, n = REG[name]
        self.mem[a:a + n] = encode(v, n, SIGN_BIT.get(name))


class MockSerial:
    """Byte-level stand-in for a serial port with servos behind it. Goal positions are
    reached instantly (for checking the protocol, not the dynamics)."""

    def __init__(self, ids=(1,), model=777):
        self.servos = {}
        for i in ids:
            s = _MockServo(bytearray(128))
            s.set("model", model)
            s.set("id", i)
            s.set("present_position", 2048)
            s.set("goal_position", 2048)
            s.set("lock", 1)
            self.servos[i] = s
        self._out = b""
        self.log: list[bytes] = []

    @property
    def in_waiting(self):
        return len(self._out)

    def reset_input_buffer(self):
        self._out = b""

    def read(self, n=1):
        d, self._out = self._out[:n], self._out[n:]
        return d

    def _status(self, sid, params=b"", err=0):
        body = bytes([sid, len(params) + 2, err]) + params
        self._out += b"\xff\xff" + body + bytes([checksum(body)])

    def write(self, pkt: bytes):
        self.log.append(bytes(pkt))
        assert pkt[:2] == b"\xff\xff", "bad header"
        sid, ln, inst = pkt[2], pkt[3], pkt[4]
        params = pkt[5:5 + ln - 2]
        assert checksum(pkt[2:3 + ln]) == pkt[3 + ln], "bad checksum"
        if inst == PING and sid in self.servos:
            self._status(sid)
        elif inst == READ and sid in self.servos:
            a, n = params
            self._status(sid, bytes(self.servos[sid].mem[a:a + n]))
        elif inst == WRITE and sid in self.servos:
            a = params[0]
            s = self.servos[sid]
            if a < 40 and s.mem[REG["lock"][0]] == 1 and a != REG["lock"][0]:
                self._status(sid, err=0x08)  # EEPROM locked
                return len(pkt)
            s.mem[a:a + len(params) - 1] = params[1:]
            self._apply(s)
            self._status(sid)
        elif inst == SYNC_WRITE:
            a, n = params[0], params[1]
            body = params[2:]
            for k in range(0, len(body), n + 1):
                s = self.servos.get(body[k])
                if s is not None:
                    s.mem[a:a + n] = body[k + 1:k + 1 + n]
                    self._apply(s)
        elif inst == SYNC_READ:
            a, n = params[0], params[1]
            for i in params[2:]:
                if i in self.servos:
                    self._status(i, bytes(self.servos[i].mem[a:a + n]))
        return len(pkt)

    @staticmethod
    def _apply(s: _MockServo):
        if s.get("torque_enable") and s.get("mode") == MODE_POSITION:
            s.set("present_position", s.get("goal_position"))
