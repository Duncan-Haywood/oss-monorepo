using Toybox.WatchUi as Ui;
using Toybox.Graphics as Gfx;
using Toybox.System as Sys;
using Toybox.Time;
using Toybox.Time.Gregorian as Gregorian;
using Toybox.Application.Properties as Properties;
using Toybox.Math;

//
// A worldtimer-bezel style face: a fixed 24-hour ring runs around the rim
// (0 at top/midnight, clockwise, matching a classic 24-hour dial), and all
// 24 CityData zones are drawn as 3-letter labels positioned at the angle
// matching THEIR OWN current local hour on that same ring. Every city is
// computed independently via CityData.localInfoAt() (fully DST-aware), so
// in effect the whole city ring rotates together over the course of a day
// -- exactly like a real GMT/worldtimer watch bezel -- except a city's
// label additionally "hops" a notch on its own DST transition day rather
// than drifting the whole ring out of alignment, which is more accurate
// than what the mechanical version of this complication can do.
//
// Local time itself is digital (big HH:MM + date in the center), not
// hands -- a small accent dot on the ring marks where "now" sits on the
// 24-hour scale, tying the digital readout back to the ring without
// drawing anything hand-like.
//
class WorldTravelerView extends Ui.WatchFace {

    function initialize() {
        WatchFace.initialize();
    }

    function onLayout(dc) {
    }

    function onShow() {
    }

    function onHide() {
    }

    function onExitSleep() {
    }

    function onEnterSleep() {
    }

    function onUpdate(dc) {
        var width = dc.getWidth();
        var height = dc.getHeight();
        var theme = Themes.get(readProperty("ThemeIndex", 0));
        var cx = width / 2.0;
        var cy = height / 2.0;
        var minDim = (width < height) ? width : height;

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_BLACK);
        dc.clear();

        var now = Time.now();
        var clock = Sys.getClockTime();
        var is24Hour = Sys.getDeviceSettings().is24Hour;
        var localInfo = Gregorian.info(now, Time.FORMAT_MEDIUM);
        var localHourFraction = clock.hour + (clock.min / 60.0);

        drawBezel(dc, cx, cy, minDim, theme);
        drawHourRing(dc, cx, cy, minDim, theme);
        drawCityRing(dc, cx, cy, minDim, theme, now);
        drawNowMarker(dc, cx, cy, minDim, theme, localHourFraction);
        drawSubDial(dc, cx, cy, minDim, theme);
        drawCenter(dc, cx, cy, minDim, theme, clock, is24Hour, localInfo);
    }

    function readProperty(key, fallback) {
        var value = Properties.getValue(key);
        if (value == null) {
            return fallback;
        }
        return value;
    }

    // 0 = top (midnight), clockwise, one full turn per 24 hours.
    function angleFor24Hour(hourFraction) {
        return (hourFraction / 24.0) * 2 * Math.PI;
    }

    function pointOnCircle(cx, cy, radius, angle) {
        var x = cx + (radius * Math.sin(angle));
        var y = cy - (radius * Math.cos(angle));
        return [x, y];
    }

    // A thin static ring right at the rim, giving the dial a defined edge
    // instead of just stopping at the raw screen boundary.
    function drawBezel(dc, cx, cy, minDim, theme) {
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(cx, cy, minDim * 0.49);
    }

    // Fixed reference scale: every hour gets a tick, every 3rd hour a
    // number (0, 3, 6 .. 21), all at static positions -- this ring never
    // moves, it's what the city labels and the now-marker are read
    // against. Night-side hours (18:00-06:00) are tinted with the theme's
    // dimmer tone as a rough day/night cue.
    function drawHourRing(dc, cx, cy, minDim, theme) {
        var tickInner = minDim * 0.40;
        var tickOuter = minDim * 0.44;
        var numberRadius = minDim * 0.455;

        for (var h = 0; h < 24; h++) {
            var angle = angleFor24Hour(h);
            var isNight = (h < 6 || h >= 18);
            var tickColor = isNight ? theme[:dim] : theme[:muted];

            if (h % 3 == 0) {
                var p = pointOnCircle(cx, cy, numberRadius, angle);
                dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
                dc.drawText(p[0], p[1], Gfx.FONT_XTINY, h.format("%d"), Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
            } else {
                var pInner = pointOnCircle(cx, cy, tickInner, angle);
                var pOuter = pointOnCircle(cx, cy, tickOuter, angle);
                dc.setColor(tickColor, Gfx.COLOR_TRANSPARENT);
                dc.drawLine(pInner[0], pInner[1], pOuter[0], pOuter[1]);
            }
        }
    }

    // Each city's label sits at the angle for ITS OWN current local hour
    // (fractional, DST-aware) on the same 24-hour scale as the fixed ring
    // above -- so a city's label always lines up with its correct current
    // hour on that ring.
    function drawCityRing(dc, cx, cy, minDim, theme, now) {
        var radius = minDim * 0.33;
        var count = CityData.size();

        for (var i = 0; i < count; i++) {
            var info = CityData.localInfoAt(i, now);
            var hourFraction = info.hour + (info.min / 60.0);
            var angle = angleFor24Hour(hourFraction);
            var p = pointOnCircle(cx, cy, radius, angle);

            dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
            dc.drawText(p[0], p[1], Gfx.FONT_XTINY, CityData.abbrAt(i), Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
        }
    }

    // A small halo dot sitting on the hour ring at the current local-time
    // angle -- ties the digital center readout back to the ring without
    // drawing a hand.
    function drawNowMarker(dc, cx, cy, minDim, theme, hourFraction) {
        var radius = minDim * 0.42;
        var angle = angleFor24Hour(hourFraction);
        var p = pointOnCircle(cx, cy, radius, angle);

        dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
        dc.fillCircle(p[0], p[1], minDim * 0.016);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(p[0], p[1], minDim * 0.016);
    }

    // A thin inner boundary framing the digital time/date, giving the
    // center a sunken "sub-dial" look separate from the city ring.
    function drawSubDial(dc, cx, cy, minDim, theme) {
        dc.setColor(theme[:dim], Gfx.COLOR_TRANSPARENT);
        dc.setPenWidth(1);
        dc.drawCircle(cx, cy, minDim * 0.29);
    }

    function drawCenter(dc, cx, cy, minDim, theme, clock, is24Hour, info) {
        var timeText = formatTime(clock.hour, clock.min, is24Hour);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy - (minDim * 0.05), Gfx.FONT_NUMBER_MEDIUM, timeText, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);

        var dividerHalf = minDim * 0.09;
        var dividerY = cy + (minDim * 0.065);
        dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(cx - dividerHalf, dividerY, cx + dividerHalf, dividerY);
        dc.setPenWidth(1);

        var dateText = info.day_of_week + " " + info.month + " " + info.day.format("%d");
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + (minDim * 0.12), Gfx.FONT_XTINY, dateText, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    // hour24 is always 0-23 (Sys.getClockTime() field); this renders it per
    // the device's 12/24-hour display preference.
    function formatTime(hour24, minute, is24Hour) {
        var minuteText = minute.format("%02d");

        if (is24Hour) {
            return hour24.format("%02d") + ":" + minuteText;
        }

        var hour12 = hour24 % 12;
        if (hour12 == 0) {
            hour12 = 12;
        }
        var suffix = (hour24 < 12) ? "A" : "P";
        return hour12.format("%d") + ":" + minuteText + suffix;
    }

}
