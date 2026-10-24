"""Board settings. Values are the design's; measure yours and edit."""

# Drive: 220 mm wheel on a 37 mm gearmotor with a 64 CPR encoder (x2 decoding in main.py)
# and a 1:90 gearbox: 2 * 64 * 90 counts per wheel turn, over pi * 220 mm.
COUNTS_PER_MM = 2 * 64 * 90 / (3.14159265 * 220)

# Battery: 7S Li-ion through a 100k / 10k divider to GPIO36 (with the ADC's 11 dB attenuation).
BATTERY_DIVIDER = 11.0

# Blade: tachometer pulses per disc revolution (one magnet on the hub, one hall sensor).
BLADE_PULSES_PER_REV = 1

# RC-style blade ESC: microseconds for zero and full throttle, and the rpm at full throttle.
ESC_MIN_US = 1000
ESC_MAX_US = 2000
BLADE_RPM_AT_FULL = 3400

# IMU (BNO085 on I2C): mounting correction so a level chassis reads 0, 0.
PITCH_OFFSET_CDEG = 0
ROLL_OFFSET_CDEG = 0
