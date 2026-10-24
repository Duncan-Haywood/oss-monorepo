# ESP32 firmware (MicroPython)

The ESP32 owns the motors and every safety input. The Raspberry Pi plans
and steers, but it can only *ask*: the ESP32 decides whether the blade may
spin.

| File | What it does |
| --- | --- |
| `controller.py` | Board-independent logic: command dispatch and clamps, blade interlock, latched stops (button, lift, tip-over, software), bump and rain handling, battery cutoff, blade soft start, blade-stop check, 300 ms watchdog, 10 Hz telemetry. Unit-tested on CPython (`tests/test_firmware.py`). |
| `main.py` | Hardware layer (PWM, encoders, ESC, blade relay, tach, hall inputs, IMU, ADC, UART) and the 50 Hz loop. **Not yet run on a board.** |
| `config.py` | Encoder scale, battery divider, ESC calibration, IMU offsets. |
| `../../src/mowerbot/protocol.py` | The serial protocol, shared byte-for-byte with the Pi. |

## The blade interlock

The blade spins only while **all** of these hold, checked every 20 ms:

- no latched stop (stop button, shell lifted, tilted past 35 degrees, or an `ESTOP` command);
- heartbeats from the Pi within the last 300 ms;
- shell not lifted and not bumped;
- pitch and roll under 20 degrees (it may restart under 15);
- rain sensor dry, not on the charging contacts, battery above cutoff;
- no blade fault (a disc still turning 1.5 s after a stop latches a fault until power-off).

When any of them fails the blade relay drops, which disconnects the ESC
and shorts the motor phases (a dynamic brake that needs no electronics),
and the blade stays off until the Pi sends a new `BLADE` command. A latched
stop clears only with `CLEAR_ESTOP`, and only while the button is up, the
shell is down and the mower is level.

## Flash

```
pip install mpremote
# flash MicroPython for ESP32 first (https://micropython.org/download/ESP32_GENERIC/)
mpremote cp ../../src/mowerbot/protocol.py controller.py config.py main.py :
mpremote reset
```

Bench-test **with the blade disc removed** and the wheels off the ground.
Before anything else, check that each of these stops the blade motor
within 1 s: pressing the stop button, lifting the shell, tilting the
chassis past 20 degrees, unplugging the UART, and pulling the IMU's I2C
lead (a missing IMU reads as tipped over).

## Talking to it from the Pi

```python
import serial
from mowerbot import protocol as P

port = serial.Serial("/dev/ttyAMA0", 115200, timeout=0)
port.write(P.encode(P.BLADE, 2800))
port.write(P.encode(P.DRIVE, 300, 300))
port.write(P.encode(P.HEARTBEAT))   # at least every 300 ms, or the watchdog stops everything
frames = P.Decoder().feed(port.read(256))
```
