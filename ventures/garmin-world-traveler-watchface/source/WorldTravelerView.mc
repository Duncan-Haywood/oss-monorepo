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
// Local time is read off the same 24-hour ring by a pair of analog hands
// pivoting at the center, plus a small date line.
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
        var localInfo = Gregorian.info(now, Time.FORMAT_MEDIUM);

        drawHourRing(dc, cx, cy, minDim, theme);
        drawCityRing(dc, cx, cy, minDim, theme, now);
        drawDate(dc, cx, cy, minDim, theme, localInfo);

        var localHourFraction = clock.hour + (clock.min / 60.0);
        drawHand(dc, cx, cy, angleFor24Hour(localHourFraction), minDim * 0.22, minDim * 0.045, minDim * 0.035);
        drawHand(dc, cx, cy, angleForMinute(clock.min), minDim * 0.27, minDim * 0.03, minDim * 0.02);
        drawPivot(dc, cx, cy, minDim, theme);
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

    // 0 = top (:00), clockwise, one full turn per 60 minutes.
    function angleForMinute(minute) {
        return (minute / 60.0) * 2 * Math.PI;
    }

    function pointOnCircle(cx, cy, radius, angle) {
        var x = cx + (radius * Math.sin(angle));
        var y = cy - (radius * Math.cos(angle));
        return [x, y];
    }

    // Fixed reference scale: every hour gets a tick, every 3rd hour a
    // number (0, 3, 6 .. 21), all at static positions -- this ring never
    // moves, it's what the city labels and hands are read against.
    function drawHourRing(dc, cx, cy, minDim, theme) {
        var tickInner = minDim * 0.40;
        var tickOuter = minDim * 0.44;
        var numberRadius = minDim * 0.455;

        for (var h = 0; h < 24; h++) {
            var angle = angleFor24Hour(h);
            if (h % 3 == 0) {
                var p = pointOnCircle(cx, cy, numberRadius, angle);
                dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
                dc.drawText(p[0], p[1], Gfx.FONT_XTINY, h.format("%d"), Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
            } else {
                var pInner = pointOnCircle(cx, cy, tickInner, angle);
                var pOuter = pointOnCircle(cx, cy, tickOuter, angle);
                dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
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

    function drawDate(dc, cx, cy, minDim, theme, info) {
        var text = info.day_of_week + " " + info.month + " " + info.day.format("%d");
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.drawText(cx, cy + (minDim * 0.13), Gfx.FONT_XTINY, text, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    // Tapered rectangular hand via a rotation matrix applied to a template
    // pointing straight up, matching the angle convention of
    // angleFor24Hour()/angleForMinute() (0 = up, clockwise).
    function drawHand(dc, cx, cy, angle, length, width, tail) {
        var cosA = Math.cos(angle);
        var sinA = Math.sin(angle);
        var half = width / 2.0;
        var template = [
            [-half, tail],
            [-half, -length],
            [half, -length],
            [half, tail]
        ];
        var points = new [4];
        for (var i = 0; i < 4; i++) {
            var lx = template[i][0];
            var ly = template[i][1];
            var x = (lx * cosA) - (ly * sinA);
            var y = (lx * sinA) + (ly * cosA);
            points[i] = [ cx + x, cy + y ];
        }

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.fillPolygon(points);
    }

    function drawPivot(dc, cx, cy, minDim, theme) {
        dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, minDim * 0.022);
    }

}
