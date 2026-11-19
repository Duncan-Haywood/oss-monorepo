# Per-robot settings. Edit before copying to the board.
ROLE = "feeder"                 # "feeder" or "collector"
BASE_COUNTS_PER_MM = 2.0        # feeder base encoder counts per mm of travel (measure it)
DRIVE_COUNTS_PER_M = 2000.0     # collector wheel encoder counts per metre (measure it)
ROLLER_DUTY = 0.7               # collector pickup roller PWM duty
BATTERY_DIVIDER = 11.0          # battery volts per ADC volt (100k/10k divider)
LOW_BATTERY_MV = 24000          # 8S LiFePO4 (25.6 V nominal): ~3.0 V/cell under load
WHEEL_RPM_FULL = 9000          # launcher wheel free speed at full ESC throttle, no ball (measure it with the tach)
# True if the launcher ESCs hold an rpm setpoint with a speed loop of their own (VESC-class firmware in a speed or
# "PID speed" input mode), False for a plain throttle ESC. With it on the board's wheel loop drops its proportional
# term, which rang in cascade with the ESC's loop on the simulator (firmware/esp32/README.md "An ESC with its own speed
# loop"). Set WHEEL_RPM_FULL to the rpm the ESC is told at full throttle. The ball-drop fit, and so a calibration
# drill, assumes a throttle ESC: in speed mode its drops are marked unsure; calibrate with the ESC in duty mode.
ESC_SPEED_LOOP = False
# Launcher tachs timed by the ESP32's MCPWM capture unit rather than the pin interrupt's ticks_us() (firmware/esp32/
# capture.py, README "A tach timed in hardware"): the edge time is latched in hardware, so the handler's latency drops
# out. Not yet run on a board: log both ways with tach_log.run(34, 600) and tach_log.run(34, 600, capture=True), read
# each with `tennisbots tach-jitter`, and turn it on only if the capture reads lower. Copy capture.py to the board too.
TACH_CAPTURE = False
# With TACH_CAPTURE on, its periods in units of 1 / TACH_CAPTURE_SUB us (README "Periods finer than a microsecond").
# Must divide 80. 8 since 2026-11-18 (README "Take-blind rows traced"): its first held-out failure (14 of 54 spread takes
# named and advised, against 43 at whole microseconds) was the take survey's trim dropping the only informative wheels;
# with controller.TAKE_SURVEY_TRIM = 0, over four sets 173 of 216 against 138 at 1, and 1 of 72 instant builds advised
# against 0 (tests/take_survey_trim.py, eval/take-blind-trace-2026-11-18.txt). Read tach-jitter's bands from a sub-1 log.
TACH_CAPTURE_SUB = 8
# Launcher spin-up ramp (cad: Feeder.power_distribution): each wheel's target rises at most WHEEL_RAMP_MAX_RPM_S, and
# above that at WHEEL_SPINUP_W of shaft power, so two wheels spinning up with everything else running stay under the
# BMS's continuous limit. WHEEL_INERTIA_KGM2 is one wheel and its motor's rotor (cad Feeder.launch_wheel_kgm2): weigh
# your wheel and update both here and in cad/otr_cad/params.py.
WHEEL_SPINUP_W = 100.0
WHEEL_INERTIA_KGM2 = 0.00155
WHEEL_RAMP_MAX_RPM_S = 1500.0
# Regenerative braking (cad: Feeder.regen_braking). Lowering a wheel's speed ramps it down at WHEEL_SPINUP_W, which an
# ESC that brakes sends back to the pack (about 6 A for both wheels). Above REGEN_BRAKE_MAX_MV on the battery reading
# the ramp coasts instead, because braking into a nearly full pack lifts a cell to the BMS's cut and the bus then has
# nowhere to go. Set WHEEL_BRAKE = False to always coast: needed if your BMS blocks charging when cold, or if your ESC
# brakes harder than the ramp asks. Fit the Schottky across the contactor (hardware/electronics.md) either way.
WHEEL_BRAKE = True
REGEN_BRAKE_MAX_MV = 27600
# Once braking has stopped on a high reading it starts again only under REGEN_BRAKE_MAX_MV - REGEN_BRAKE_HYST_MV (cad:
# Feeder.regen_guard): braking lifts the reading about 260 mV and the ADC adds noise, so one threshold flipped brake and
# coast every tick for a pack resting near it. At least 600 mV with the assumed figures; widen it if your reading is noisier.
REGEN_BRAKE_HYST_MV = 700
AZ_MICROSTEPS = 4               # azimuth driver's microstep setting (match its MS pins)
AZ_RATIO = 10.0                 # 150-tooth sector over the 15-tooth pinion
AZ_VMAX_DEG_S = 60.0            # peak turntable speed: 30 deg in 1 s, triangular (cad: Feeder.azimuth_drive)
AZ_ACCEL_DEG_S2 = 120.0
# The stepper driver's ENABLE is held off until the contactor's coil has been on this long (cad: Feeder.contactor_bounce,
# stepper_enable_after_ms): longer than the contactor's pull-in plus its bounce (assumed 50 + 10 ms; read yours).
CONTACTOR_SETTLE_MS = 150
AZ_HOME_DEG = -32.0             # where the home switch closes turning negative (cad: Feeder.home_switch_design; its
#   cam holds it closed below this, so homing backs off first when it starts closed); calibrate it from your build
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
ELEV_POT_READS = 8              # pot: readings per tick; the 2 highest and 2 lowest are dropped and the rest averaged
#   (the PWM's pickup and the ESP32 ADC's own noise; the 1 uF capacitor on GPIO 39 is the real fix, cad check_elev_pot)
ELEV_SELF_LOCKING = True        # timed: False if the head sinks when power is cut (then every stop re-homes)
# Feed shuttle servo (cad: Feeder.shuttle_drive): a crank turned 180 deg between these pulses moves the shuttle from
# retracted (pocket under the column) to forward (ball at the wheels); both ends are the crank's dead centres.
GATE_LO_US = 500                # retracted; many servos turn 180 deg over 500-2500 us: check yours, and that it
GATE_HI_US = 2500               # does not buzz against its own stop at either end
GATE_OUT_MS = 900               # forward stroke: cad 0.76 s loaded, plus 0.1 s held while the wheels take the ball
GATE_BACK_MS = 850              # back stroke: cad 0.68 s, plus 0.14 s for the next ball to drop into the pocket
# Ball lift (cad: Feeder.lift_design): its gearmotor on a MOSFET from GPIO 12 runs this long after each ball is fed,
# so balls still in the trough or on the belt reach the tub (manifest "ball lift" line: run-on).
LIFT_RUN_ON_MS = 16000
LIFT_DUTY = 1.0
# Lift jam cutoff (cad: Feeder.lift_jam_cutoff; manifest "lift jam" line). A shunt in the lift motor's + lead, inside
# the flyback diode's loop, read by an INA186-class amplifier and a comparator, pulls GPIO 0 low above about 1.64 A
# (1.51 to 1.77 A over the parts' tolerances) at any duty, under the 2.5 A the motor draws while the slip hub slides.
# Ignored for LIFT_JAM_BLANK_MS after each start (a start stays over it about 75 ms by the CAD's figures, 184 ms at most on the simulated feeder); over for LIFT_JAM_TRIP_MS cuts the motor,
# which tries again after LIFT_JAM_REST_MS, LIFT_JAM_RETRIES times, then stays off (FLAG_LIFT_JAM) until the e-stop is
# pressed and released. The CAD's params carry the same numbers and a test fails if they disagree.
LIFT_JAM_BLANK_MS = 400
LIFT_JAM_TRIP_MS = 10
LIFT_JAM_REST_MS = 2000
LIFT_JAM_RETRIES = 1
# Slip hub wear (cad: Feeder.lift_slip_jams, lift_slip_wear; cad/README.md "Slip hub wear"). Every cut is a jam the hub
# slid through, and its facings wear a little each time. The count is kept in flash (LIFT_JAM_LOG, survives power-off);
# after LIFT_SLIP_JAMS cuts since the last bench set, telemetry sets FLAG_LIFT_HUB_DUE: check the hub's slip on the
# scale, set it again, then run `tennisbots lift-hub-reset`. 0 never flags. A test fails if it and the CAD disagree.
LIFT_SLIP_JAMS = 300
LIFT_JAM_LOG = "lift_jams.json"
# Lift soft start (cad: Feeder.lift_ramp_ms; cad/README.md "Lift coupling dynamics"): each start ramps the duty up over
# this long, so the rotor does not cross the jaw coupling's free play at speed and ring the drive into the slip hub.
# It must end well inside LIFT_JAM_BLANK_MS; 0 switches straight to LIFT_DUTY.
LIFT_RAMP_MS = 100
# Lift speed held over the battery (cad: Feeder.lift_v_ref; cad/README.md "Lift duty follows the battery"). Above
# LIFT_V_REF_MV on the battery reading the duty is LIFT_DUTY x LIFT_V_REF_MV / reading (smoothed over LIFT_BUS_TAU_MS),
# so the belt runs at its 24 V speed from the cut to the charger's 29.2 V instead of 0.91 to 1.23 times nominal; never
# under LIFT_DUTY_MIN. 0 keeps the fixed duty. The jam cutoff's trip does not move with the duty (its shunt is inside
# the diode's loop since 2026-11-15); the CAD still checks a hot stall trips at the lowest duty.
LIFT_V_REF_MV = 24000
LIFT_DUTY_MIN = 0.82
LIFT_BUS_TAU_MS = 500
# Hopper agitator (cad: Feeder.agitator_design): its gearmotor on a MOSFET from GPIO 2 stirs the outlet while balls
# are queued or on their way, and this long after, for two more passes of its arms (manifest "hopper agitator" line).
AGIT_RUN_ON_MS = 3000
AGIT_DUTY = 1.0
# Empty hopper (2026-11-16, firmware/esp32/README.md "Empty hopper"; controller.LaunchCheck). A ball squeezed through
# the launcher takes its momentum from the wheels, so each feed stroke is judged by the tachometers: the wheel with the
# larger predicted drop (8.8% on a flat shot with these numbers, at least 4.4% on the faster wheel at any spin) must
# fall by LAUNCH_DIP_SHARE of it, and by LAUNCH_DIP_MIN at least, below its own speed just before the fall (not its
# target: README "The verdict from the pre-ball speed"), within LAUNCH_CHECK_MS of the stroke's end, or the
# pocket was empty: telemetry sets FLAG_HOPPER_EMPTY until the next FEED. The model's numbers are the CAD's ball mass
# and wheel radius and the launcher's efficiencies (src/tennisbots/launcher.py); a test fails if they disagree.
# WHEEL_INERTIA_KGM2 above is the wheel's inertia: weigh yours. LAUNCH_CHECK = False turns the check off.
LAUNCH_CHECK = True
BALL_KG = 0.0577                # the flight model's ball too (2026-11-16: 57.0 here read efficiencies 1.2% high)
WHEEL_RADIUS_M = 0.075
BALL_RADIUS_M = 0.0335
LAUNCH_SPEED_EFF = 0.85
LAUNCH_SPIN_EFF = 0.5
LAUNCH_DIP_SHARE = 0.25
LAUNCH_DIP_MIN = 0.015
LAUNCH_CHECK_MS = 250
# The ESC's own lag between its command and the drive it gives the motor, microseconds (2026-11-16, firmware/esp32/
# README.md "An ESC lag picked from the build's own balls"). 0 (the default) fits each ball's drop with the wheel as
# one lag of the commands. An ESC that ramps its output adds a second lag, and the drop then reads low (1.3-4.6% on
# average at 40-100 ms on the simulator). The board surveys it itself (README "The ESC lag surveyed on the board"):
# after a drill, `python -m tennisbots esc-lag shots.jsonl` on the Pi (or the drill summary) prints the lag its balls
# pick, from the ESC_SURVEY frame; set it here and re-flash. Any value works; the survey refines between its grid's
# lags. The board reports it (ESC_TAU frame), and `tennisbots run` stops a calibration drill before its first ball
# when it disagrees with the shot log's last survey (README "Checked before a calibration drill").
ESC_TAU_US = 0
# The survey's lags (seven, the ESC_SURVEY frame's slots; 150 ms added 2026-11-18, README "The ESC-lag survey between
# 100 and 200 ms"), or () to turn the survey off: it refits each turning wheel once a lag after its record is out, one
# step a control tick, pausing while a stroke is under way.
ESC_SURVEY_GRID_US = (0, 20000, 50000, 100000, 150000, 200000, 400000)
# The ball's contact time the drop fit models, microseconds (2026-11-17, firmware/esp32/README.md "A take that lasts a
# few milliseconds" and "The contact time surveyed on the board"). 0 (the default) models the take as one step. A real
# ball is in the wheels for a few ms, and on the simulator a 6 ms take read the drop 0.98% (sd) off as a step and 0.19%
# told its contact time. `tennisbots run` on a calibration drill asks the board to survey it (SURVEY_TAKE) and prints
# the contact time its balls pick; set it here and re-flash.
TAKE_US = 0
# The survey's contact times (eight since 2026-11-19, the TAKE_SURVEY frame's slots), or () to turn it off.
TAKE_SURVEY_GRID_US = (0, 1500, 2500, 3000, 4000, 5000, 6000, 7000, 8000)
