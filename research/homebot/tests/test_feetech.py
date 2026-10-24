import pytest

from homebot.hardware.feetech import (MODE_SPEED, PING, FeetechBus, MockSerial, checksum, decode, encode,
                                      packet, parse_status)


def test_ping_packet_bytes():
    # FF FF 01 02 01 FB: checksum = ~(1 + 2 + 1) & 0xFF
    assert packet(1, PING) == bytes([0xFF, 0xFF, 0x01, 0x02, 0x01, 0xFB])


def test_sign_magnitude_round_trip():
    for v in (0, 1, 2047, -1, -2047, 32767, -32767):
        assert decode(encode(v, 2, 15), 15) == v
    assert encode(-5, 2, 15) == bytes([5, 0x80])
    assert decode(bytes([0x05, 0x04]), 10) == -5  # load: sign in bit 10
    with pytest.raises(ValueError):
        encode(40000, 2, 15)


def test_status_parse_rejects_bad_checksum():
    body = bytes([1, 2, 0])
    good = b"\xff\xff" + body + bytes([checksum(body)])
    assert parse_status(good)[:2] == (1, 0)
    with pytest.raises(IOError):
        parse_status(good[:-1] + bytes([good[-1] ^ 1]))


def test_bus_read_write_sync():
    ser = MockSerial(ids=(1, 2, 3))
    bus = FeetechBus(serial=ser)
    assert bus.ping(2) and not bus.ping(9)
    assert bus.read(1, "model") == 777
    bus.sync_write("torque_enable", {1: 1, 2: 1, 3: 1})
    bus.sync_write("goal_position", {1: 100, 2: 2000, 3: 4000})
    assert bus.sync_read("present_position", [1, 2, 3]) == {1: 100, 2: 2000, 3: 4000}
    bus.write(2, "goal_speed", -300)
    assert bus.read(2, "goal_speed") == -300


def test_eeprom_needs_unlock():
    ser = MockSerial(ids=(4,))
    bus = FeetechBus(serial=ser)
    bus.write(4, "mode", MODE_SPEED)  # locked: servo answers with an error, value unchanged
    assert bus.read(4, "mode") == 0
    bus.write_eeprom(4, "mode", MODE_SPEED)
    assert bus.read(4, "mode") == MODE_SPEED
