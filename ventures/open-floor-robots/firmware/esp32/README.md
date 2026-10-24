# ESP32-S3 firmware (MicroPython)

One firmware for all three builds; `config.py` picks the role (`vacuum`,
`mop` or `combo`), which decides which tool commands it accepts.

| File | What it does |
| --- | --- |
| `controller.py` | Board-independent logic: command dispatch, role filter, clamps, 300 ms watchdog, latched stop button, bumper and cliff rules (with the automatic back-off), wheel-drop, low-battery and over-temperature faults, fan-needs-bin and pump-only-while-moving interlocks, 10 Hz telemetry. Unit-tested on CPython (`tests/test_firmware.py`). |
| `main.py` | Hardware layer (wheel PWM, encoders, speed loops, PCA9685 for the tools, servos, ADC, UART) and the main loop. **Not yet run on a board.** |
| `config.py` | Role, encoder scale, battery divider, servo positions. |
| `../../src/floorbots/protocol.py` | The serial protocol, shared byte-for-byte with the Pi. |

## Flash

```
pip install mpremote
# flash MicroPython for ESP32-S3 first (https://micropython.org/download/ESP32_GENERIC_S3/)
mpremote cp ../../src/floorbots/protocol.py controller.py config.py main.py :
mpremote reset
```

Bench-test with the wheels off the ground and the brushes and pad
removed. Before anything else, check that each of these stops every motor
within one loop: pressing the stop button, unplugging the UART (300 ms),
lifting the robot (wheel-drop switches), and covering a front cliff
sensor with your hand while driving forward (it should back off).

## Talking to it from the Pi

```python
import serial
from floorbots import protocol as P

port = serial.Serial("/dev/serial0", 115200, timeout=0)
port.write(P.encode(P.CLEAN, 80, 70, 60))   # fan %, main brush %, side brush %
port.write(P.encode(P.DRIVE, 250, 250))     # left, right mm/s (capped at 350)
port.write(P.encode(P.HEARTBEAT))           # at least every 300 ms, or the watchdog stops everything
frames = P.Decoder().feed(port.read(256))   # TELEMETRY: flags, wheel speeds, battery mV, pack temperature
```

After any fault (`FLAG_WHEEL_DROP`, `FLAG_LOW_BATTERY`, `FLAG_OVER_TEMP`)
the controller stays stopped until the cause is gone and the Pi sends
`CLEAR_FAULT`; then it must resend `CLEAN` / `MOP`, which a stop clears.
