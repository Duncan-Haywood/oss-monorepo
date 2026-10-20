# Per-robot settings. Edit before copying to the board.
ROLE = "feeder"                 # "feeder" or "collector"
BASE_COUNTS_PER_MM = 2.0        # feeder base encoder counts per mm of travel (measure it)
DRIVE_COUNTS_PER_M = 2000.0     # collector wheel encoder counts per metre (measure it)
ROLLER_DUTY = 0.7               # collector pickup roller PWM duty
BATTERY_DIVIDER = 11.0          # battery volts per ADC volt (100k/10k divider)
LOW_BATTERY_MV = 24000          # 8S LiFePO4 (25.6 V nominal): ~3.0 V/cell under load
