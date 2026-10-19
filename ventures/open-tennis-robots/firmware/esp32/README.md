# ESP32 firmware (MicroPython)

One firmware for both robots; `config.py` picks the role (`feeder` or
`collector`).

| File | What it does |
| --- | --- |
| `controller.py` | Board-independent logic: command dispatch, role filter, clamps, 300 ms watchdog, latched e-stop, bumper rule, 10 Hz telemetry. Unit-tested on CPython (`tests/test_robots.py`). |
| `main.py` | Hardware layer (PWM, encoders, tachometers, ADC, UART) and the main loop. **Not yet run on a board.** |
| `config.py` | Role, encoder scales, battery thresholds. |
| `../../src/tennisbots/protocol.py` | The serial protocol, shared byte-for-byte with the Pi. |

## Flash

```
pip install mpremote
# flash MicroPython for ESP32 first (https://micropython.org/download/ESP32_GENERIC/)
mpremote cp ../../src/tennisbots/protocol.py controller.py config.py main.py :
mpremote reset
```

Bench-test with the launcher wheels removed (feeder) or the drive wheels
off the ground (collector). Check that pressing the e-stop and unplugging
the UART each stop every motor within 300 ms before anything else.

## Talking to it from the Pi

```python
import serial
from tennisbots import protocol as P

port = serial.Serial("/dev/ttyAMA0", 115200, timeout=0)
port.write(P.encode(P.SET_WHEELS, 4300, 2200))
port.write(P.encode(P.HEARTBEAT))   # at least every 300 ms, or the watchdog stops everything
frames = P.Decoder().feed(port.read(256))
```
