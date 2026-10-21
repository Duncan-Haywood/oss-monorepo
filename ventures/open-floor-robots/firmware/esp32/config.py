# Per-robot settings. Edit before copying to the board.
ROLE = "vacuum"                 # "vacuum", "mop" or "combo"
DRIVE_COUNTS_PER_M = 4400.0     # wheel encoder counts per metre (measure: push it 1 m, read the count)
BATTERY_DIVIDER = 6.0           # battery volts per ADC volt (50k/10k divider; 16.8 V full -> 2.8 V)
# Cliff sensor sensitivity is the trimmer on each IR module: set it so dark carpet still reads as floor.
THERMISTOR_BETA = 3950          # 10k NTC taped to the battery pack
PUMP_MAX_DUTY = 1.0             # cap if your pump floods at full duty
SERVO_PAD_UP_US = 1100          # pad-lift servo positions (set them on the bench)
SERVO_PAD_DOWN_US = 1700
