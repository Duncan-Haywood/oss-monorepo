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
class WorldTravelerView extends Ui.WatchFace {

    // Property keys for the four user-selectable world-city slots.
    var citySlotKeys = [ "City1Index", "City2Index", "City3Index", "City4Index" ];

    // Default city indices into CityData.CITIES: London, New York, Tokyo, Sydney.
    var defaultCityIndices = [ 8, 6, 17, 18 ];

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

        drawDate(dc, width, height, theme, localInfo);
        drawMainClock(dc, width, height, clock, is24Hour);
        drawDivider(dc, width, height, theme);
        drawCityRows(dc, width, height, theme, now, localInfo, is24Hour);
        drawBattery(dc, width, height, theme);
    }

    function readProperty(key, fallback) {
        var value = Properties.getValue(key);
        if (value == null) {
            return fallback;
        }
        return value;
    }

    function drawDate(dc, width, height, theme, info) {
        var text = info.day_of_week + " " + info.month + " " + info.day.format("%d");
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, height * 0.14, Gfx.FONT_SMALL, text, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    function drawMainClock(dc, width, height, clock, is24Hour) {
        var text = formatTime(clock.hour, clock.min, is24Hour);
        dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, height * 0.31, Gfx.FONT_NUMBER_MEDIUM, text, Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
    }

    function drawDivider(dc, width, height, theme) {
        var y = height * 0.47;
        var halfWidth = width * 0.22;
        dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
        dc.setPenWidth(2);
        dc.drawLine(width / 2 - halfWidth, y, width / 2 + halfWidth, y);
        dc.setPenWidth(1);
    }

    function drawCityRows(dc, width, height, theme, now, localInfo, is24Hour) {
        var rowFont = (width < 220) ? Gfx.FONT_XTINY : Gfx.FONT_SMALL;
        var yStart = height * 0.56;
        var yEnd = height * 0.90;
        var rowCount = citySlotKeys.size();
        var spacing = (yEnd - yStart) / (rowCount - 1);
        var leftX = width * 0.20;
        var rightX = width * 0.80;

        for (var row = 0; row < rowCount; row++) {
            var cityIndex = readProperty(citySlotKeys[row], defaultCityIndices[row]);
            var cityInfo = CityData.localInfoAt(cityIndex, now);
            var y = yStart + (spacing * row);

            dc.setColor(theme[:accent], Gfx.COLOR_TRANSPARENT);
            dc.drawText(leftX, y, rowFont, CityData.nameAt(cityIndex), Gfx.TEXT_JUSTIFY_LEFT | Gfx.TEXT_JUSTIFY_VCENTER);

            var timeText = formatTime(cityInfo.hour, cityInfo.min, is24Hour);
            var badge = dayOffsetBadge(cityInfo, localInfo);
            if (!badge.equals("")) {
                timeText = timeText + " " + badge;
            }

            dc.setColor(Gfx.COLOR_WHITE, Gfx.COLOR_TRANSPARENT);
            dc.drawText(rightX, y, rowFont, timeText, Gfx.TEXT_JUSTIFY_RIGHT | Gfx.TEXT_JUSTIFY_VCENTER);
        }
    }

    function drawBattery(dc, width, height, theme) {
        var battery = Sys.getSystemStats().battery;
        dc.setColor(theme[:muted], Gfx.COLOR_TRANSPARENT);
        dc.drawText(width / 2, height * 0.97, Gfx.FONT_XTINY, battery.format("%d") + "%", Gfx.TEXT_JUSTIFY_CENTER | Gfx.TEXT_JUSTIFY_VCENTER);
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

    // Best-effort "day is ahead/behind mine" badge from the two Gregorian
    // day-of-month fields. Handles the common one-day-apart case, including
    // the month-boundary wraparound, but is not exact for the rare city
    // pairing that is a full two calendar days apart.
    function dayOffsetBadge(cityInfo, localInfo) {
        var cd = cityInfo.day;
        var ld = localInfo.day;

        if (cd == ld) {
            return "";
        }
        if (cd == ld + 1) {
            return "+1";
        }
        if (cd == ld - 1) {
            return "-1";
        }
        if (cd <= 3 && ld >= 28) {
            return "+1";
        }
        if (ld <= 3 && cd >= 28) {
            return "-1";
        }
        return "";
    }

}
