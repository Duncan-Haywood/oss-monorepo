# Per-robot settings. Edit before copying to the board.
ROLE = "feeder"                 # "feeder" or "collector"
BASE_COUNTS_PER_MM = 2.0        # feeder base encoder counts per mm of travel (measure it)
DRIVE_COUNTS_PER_M = 2000.0     # collector wheel encoder counts per metre (measure it)
ROLLER_DUTY = 0.7               # collector pickup roller PWM duty
BATTERY_DIVIDER = 11.0          # battery volts per ADC volt (100k/10k divider)
LOW_BATTERY_MV = 24000          # 8S LiFePO4 (25.6 V nominal): ~3.0 V/cell under load
WHEEL_RPM_FULL = 9000          # launcher wheel free speed at full ESC throttle, no ball (measure it with the tach)
AZ_MICROSTEPS = 4               # azimuth driver's microstep setting (match its MS pins)
AZ_RATIO = 10.0                 # 150-tooth sector over the 15-tooth pinion
AZ_VMAX_DEG_S = 60.0            # peak turntable speed: 30 deg in 1 s, triangular (cad: Feeder.azimuth_drive)
AZ_ACCEL_DEG_S2 = 120.0
AZ_HOME_DEG = -32.0             # where the home switch trips (just past -30); set it from your build
# Elevation actuator (cad: Feeder.elevation_drive). Mode: "rc" (actuator with its own servo input, L16-R class),
# "pot" (feedback potentiometer, through an H-bridge, L16-P class) or "timed" (bare actuator through an H-bridge,
# homed on its retract limit). Lengths are hole to hole; read yours off the datasheet and a ruler.
ELEV_MODE = "pot"
ELEV_CLOSED_MM = 246.0          # retracted length: 244.9 to 247.7 mm, so its own limit stops the head before the plates hit
ELEV_STROKE_MM = 150.0
ELEV_SPEED_EXT_MM_S = 18.0      # timed/rc: measured extending (nose down, against the head's weight)
ELEV_SPEED_RET_MM_S = 22.0      # measured retracting (nose up, the weight helps)
ELEV_POT_RAW_RETRACTED = 1500   # pot: read_u16() at full retract (measure it)
ELEV_POT_RAW_EXTENDED = 63000   # pot: read_u16() at full extension (measure it)
ELEV_SELF_LOCKING = True        # timed: False if the head sinks when power is cut (then every stop re-homes)
# Feed shuttle servo (cad: Feeder.shuttle_drive): a crank turned 180 deg between these pulses moves the shuttle from
# retracted (pocket under the column) to forward (ball at the wheels); both ends are the crank's dead centres.
GATE_LO_US = 500                # retracted; many servos turn 180 deg over 500-2500 us: check yours, and that it
GATE_HI_US = 2500               # does not buzz against its own stop at either end
GATE_OUT_MS = 850               # forward stroke: cad 0.76 s loaded, plus 0.1 s held while the wheels take the ball
GATE_BACK_MS = 850              # back stroke: cad 0.68 s, plus 0.14 s for the next ball to drop into the pocket
