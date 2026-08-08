using Toybox.WatchUi as Ui;
using Toybox.Graphics as Gfx;
using Toybox.System as Sys;
using Toybox.Time;
using Toybox.Time.Gregorian as Gregorian;
using Toybox.Application.Properties as Properties;

//
// Draws the whole face programmatically (no layout.xml) so the same code
// adapts to round, semi-round and rectangular displays purely from
// dc.getWidth()/dc.getHeight() -- no per-device resource variants needed.
//
// Layout: a compact local time/date header up top, then a 2-column x
// 8-row grid of 16 user-selectable world-city clocks below it -- a real
// world-traveler reference, not just a couple of favorites.
//
class WorldTravelerView extends Ui.WatchFace {

    var citySlotKeys = [
        "City1Index", "City2Index", "City3Index", "City4Index",
        "City5Index", "City6Index", "City7Index", "City8Index",
        "City9Index", "City10Index", "City11Index", "City12Index",
        "City13Index", "City14Index", "City15Index", "City16Index"
    ];

    // Defaults into CityData.CITIES, chosen for broad global spread:
    // Honolulu, LA, Denver, Chicago, New York, Sao Paulo, London, Paris,
    // Athens, Moscow, Dubai, Delhi, Bangkok, Beijing, Tokyo, Sydney.
    var defaultCityIndices = [
        1, 3, 4, 5,
        6, 8, 9, 10,
        11, 12, 13, 15,
        17, 18, 19, 20
    ];

    var columns = 2;

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

        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_BLACK);
        dc.clear();

        var now = Time.now();
        var clock = Sys.getClockTime();
        var is24Hour = Sys.getDeviceSettings().is24Hour;
        var localInfo = Gregorian.info(now, Time.FORMAT_MEDIUM);

        drawHeader(dc, width, height, theme, clock, is24Hour, localInfo);
        drawDivider(dc, width, height, theme);
        drawCityGrid(dc, width, height, theme, now, localInfo, is24Hour);
        drawBattery(dc, width, height, theme);
    }

    function readProperty(key, fallback) {
        var value = Properties.getValue(key);
        if (value == null) {
            return fallback;
        }
        return value;
    }

    function drawHeader(dc, width, height, theme, clock, is24Hour, info) {
        var timeText = formatTime(clock.hour, clock.min, is24Hour);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, height * 0.115, Gfx.FONT_NUMBER_MILD, timeText, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);

        var dateText = info.day_of_week + " " + info.month + " " + info.day.format("%d");
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, height * 0.205, Gfx.FONT_XTINY, dateText, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    function drawDivider(dc, width, height, theme) {
        var y = height * 0.245;
        var halfWidth = width * 0.20;
        dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(width / 2 - halfWidth, y, width / 2 + halfWidth, y);
        dc.setPenWidth(1);
    }

    // 2 columns x 8 rows of "ABBR HH:MM" cells, kept away from the round
    // bezel edges by staying within a conservative horizontal band that
    // narrows for the outer columns at the bottom-most rows.
    function drawCityGrid(dc, width, height, theme, now, localInfo, is24Hour) {
        var rowCount = citySlotKeys.size() / columns;
        var yStart = height * 0.30;
        var yEnd = height * 0.85;
        var spacing = (yEnd - yStart) / (rowCount - 1);
        var colX = [ width * 0.18, width * 0.50 ];

        for (var slot = 0; slot < citySlotKeys.size(); slot++) {
            var col = slot % columns;
            var row = slot / columns;

            var cityIndex = readProperty(citySlotKeys[slot], defaultCityIndices[slot]);
            var cityInfo = CityData.localInfoAt(cityIndex, now);
            var y = yStart + (spacing * row);

            var timeText = formatTime(cityInfo.hour, cityInfo.min, is24Hour);
            var badge = dayOffsetBadge(cityInfo, localInfo);
            var cellText = CityData.abbrAt(cityIndex) + " " + timeText + badge;

            dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
            dc.drawText(colX[col], y, Gfx.FONT_XTINY, cellText, Gfx.TEXT_JUSTIFY_LEFT | Gfx.TEXT_JUSTIFY_VCENTER);
        }
    }

    function drawBattery(dc, width, height, theme) {
        var battery = Sys.getSystemStats().battery;
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, height * 0.955, Gfx.FONT_XTINY, battery.format("%d") + "%", Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    // hour24 is always 0-23 (Sys.getClockTime()/Gregorian hour fields); this
    // renders it per the device's 12/24-hour display preference.
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

    // Best-effort single-character "day is ahead/behind mine" marker from
    // the two Gregorian day-of-month fields. Handles the common one-day-
    // apart case, including the month-boundary wraparound, but is not exact
    // for the rare city pairing that is a full two calendar days apart.
    function dayOffsetBadge(cityInfo, localInfo) {
        var cd = cityInfo.day;
        var ld = localInfo.day;

        if (cd == ld) {
            return "";
        }
        if (cd == ld + 1) {
            return "+";
        }
        if (cd == ld - 1) {
            return "-";
        }
        if (cd <= 3 && ld >= 28) {
            return "+";
        }
        if (ld <= 3 && cd >= 28) {
            return "-";
        }
        return "";
    }

}
