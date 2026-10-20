using Toybox.Time;
using Toybox.Time.Gregorian as Gregorian;

//
// World city catalog + timezone math.
//
// Every city stores a *standard* (winter) UTC offset in seconds, plus a
// symbolic DST rule (:none, :us, :eu, :au, :nz). Effective offsets are
// computed on demand from the current UTC instant -- nothing is cached
// across a DST transition, so the face is always correct without needing
// a persisted timezone database.
//
// Technique: Toybox.Time.Gregorian.utcInfo(moment, ...) reads a Moment's
// calendar fields as if it were UTC. Adding a city's offset to the real
// UTC "now" Moment and then reading it back with utcInfo() yields that
// city's local wall-clock time -- the standard trick for rendering
// arbitrary timezones on Connect IQ without a live TZ database.
//
module CityData {

    // One anchor city per whole-hour UTC offset from -11 to +12, plus a
    // handful of second cities at offsets with more than one globally
    // recognizable major city (and one half-hour zone, +5:30, for India).
    // UTC-12 is skipped (no permanent population). Picks favor
    // recognizability over strict population -- e.g. Denver over Phoenix,
    // Bangkok alongside Jakarta, Beijing+Singapore instead of Shanghai --
    // while still keeping a real, large city at every offset. UTC-2 has no
    // real city (mid-Atlantic islands only); Fernando de Noronha is used
    // as the token IANA-recognized zone anchor. Cities whose government
    // changed DST rules recently are avoided (Cairo resumed DST in 2023,
    // Santiago observes a Southern-hemisphere rule this file does not
    // model); test/citydata.test.mjs checks every entry against the tz
    // database, so add a city there only if its rule is one of the five.
    //
    // :ring selects which of the two concentric label rings a city draws
    // on (0 = outer/primary, 1 = inner/secondary) so that a same-offset
    // pair -- which would otherwise sit at the exact same angle whenever
    // neither is mid-DST -- doesn't overlap.
    //
    // index -> { :name, :abbr (3 letters, drawn on the ring), :offset
    // (seconds, standard time), :dst (symbol), :ring (0 or 1) }
    const CITIES = [
        { :name => "Pago Pago",           :abbr => "PPG", :offset => -11 * 3600,      :dst => :none, :ring => 0 },

        { :name => "Honolulu",            :abbr => "HNL", :offset => -10 * 3600,      :dst => :none, :ring => 0 },
        { :name => "Papeete",             :abbr => "PPT", :offset => -10 * 3600,      :dst => :none, :ring => 1 },

        { :name => "Anchorage",           :abbr => "ANC", :offset => -9 * 3600,       :dst => :us,   :ring => 0 },

        { :name => "Los Angeles",         :abbr => "LAX", :offset => -8 * 3600,       :dst => :us,   :ring => 0 },
        { :name => "Las Vegas",           :abbr => "LAS", :offset => -8 * 3600,       :dst => :us,   :ring => 1 },

        { :name => "Denver",              :abbr => "DEN", :offset => -7 * 3600,       :dst => :us,   :ring => 0 },

        { :name => "Mexico City",         :abbr => "MEX", :offset => -6 * 3600,       :dst => :none, :ring => 0 },
        { :name => "Chicago",             :abbr => "CHI", :offset => -6 * 3600,       :dst => :us,   :ring => 1 },

        { :name => "New York",            :abbr => "NYC", :offset => -5 * 3600,       :dst => :us,   :ring => 0 },
        { :name => "Toronto",             :abbr => "TOR", :offset => -5 * 3600,       :dst => :us,   :ring => 1 },

        { :name => "Caracas",             :abbr => "CCS", :offset => -4 * 3600,       :dst => :none, :ring => 0 },

        { :name => "Sao Paulo",           :abbr => "SAO", :offset => -3 * 3600,       :dst => :none, :ring => 0 },
        { :name => "Rio de Janeiro",      :abbr => "RIO", :offset => -3 * 3600,       :dst => :none, :ring => 1 },

        { :name => "Fernando de Noronha", :abbr => "FEN", :offset => -2 * 3600,       :dst => :none, :ring => 0 },

        { :name => "Praia",               :abbr => "PRA", :offset => -1 * 3600,       :dst => :none, :ring => 0 },
        { :name => "Azores",              :abbr => "AZO", :offset => -1 * 3600,       :dst => :eu,   :ring => 1 },

        { :name => "London",              :abbr => "LON", :offset => 0,               :dst => :eu,   :ring => 0 },
        { :name => "Reykjavik",           :abbr => "REY", :offset => 0,               :dst => :none, :ring => 1 },

        { :name => "Paris",               :abbr => "PAR", :offset => 1 * 3600,        :dst => :eu,   :ring => 0 },
        { :name => "Lagos",               :abbr => "LOS", :offset => 1 * 3600,        :dst => :none, :ring => 1 },

        { :name => "Johannesburg",        :abbr => "JNB", :offset => 2 * 3600,        :dst => :none, :ring => 0 },
        { :name => "Athens",              :abbr => "ATH", :offset => 2 * 3600,        :dst => :eu,   :ring => 1 },

        { :name => "Moscow",              :abbr => "MOW", :offset => 3 * 3600,        :dst => :none, :ring => 0 },
        { :name => "Istanbul",            :abbr => "IST", :offset => 3 * 3600,        :dst => :none, :ring => 1 },

        { :name => "Dubai",               :abbr => "DXB", :offset => 4 * 3600,        :dst => :none, :ring => 0 },

        { :name => "Karachi",             :abbr => "KHI", :offset => 5 * 3600,        :dst => :none, :ring => 0 },

        { :name => "Delhi",               :abbr => "DEL", :offset => 5 * 3600 + 1800, :dst => :none, :ring => 0 },
        { :name => "Mumbai",              :abbr => "BOM", :offset => 5 * 3600 + 1800, :dst => :none, :ring => 1 },

        { :name => "Dhaka",               :abbr => "DAC", :offset => 6 * 3600,        :dst => :none, :ring => 0 },

        { :name => "Bangkok",             :abbr => "BKK", :offset => 7 * 3600,        :dst => :none, :ring => 0 },
        { :name => "Jakarta",             :abbr => "JKT", :offset => 7 * 3600,        :dst => :none, :ring => 1 },

        { :name => "Beijing",             :abbr => "PEK", :offset => 8 * 3600,        :dst => :none, :ring => 0 },
        { :name => "Singapore",           :abbr => "SIN", :offset => 8 * 3600,        :dst => :none, :ring => 1 },

        { :name => "Tokyo",               :abbr => "TYO", :offset => 9 * 3600,        :dst => :none, :ring => 0 },
        { :name => "Seoul",               :abbr => "SEL", :offset => 9 * 3600,        :dst => :none, :ring => 1 },

        { :name => "Sydney",              :abbr => "SYD", :offset => 10 * 3600,       :dst => :au,   :ring => 0 },
        { :name => "Melbourne",           :abbr => "MEL", :offset => 10 * 3600,       :dst => :au,   :ring => 1 },

        { :name => "Honiara",             :abbr => "HIR", :offset => 11 * 3600,       :dst => :none, :ring => 0 },
        { :name => "Noumea",              :abbr => "NOU", :offset => 11 * 3600,       :dst => :none, :ring => 1 },

        { :name => "Auckland",            :abbr => "AKL", :offset => 12 * 3600,       :dst => :nz,   :ring => 0 },
        { :name => "Fiji",                :abbr => "FIJ", :offset => 12 * 3600,       :dst => :none, :ring => 1 }
    ];

    function size() {
        return CITIES.size();
    }

    function abbrAt(index) {
        return CITIES[index][:abbr];
    }

    function ringAt(index) {
        return CITIES[index][:ring];
    }

    // Returns a Gregorian.Info (FORMAT_SHORT) for the given city's current
    // local wall-clock time, DST-adjusted for "now" (a Time.Moment, UTC).
    function localInfoAt(index, nowUtc) {
        var city = CITIES[index];
        var offset = effectiveOffsetSeconds(city, nowUtc);
        var shifted = nowUtc.add(new Time.Duration(offset));
        return Gregorian.utcInfo(shifted, Time.FORMAT_SHORT);
    }

    function effectiveOffsetSeconds(city, nowUtc) {
        var stdOffset = city[:offset];
        var rule = city[:dst];

        if (rule == :none) {
            return stdOffset;
        }

        if (rule == :eu) {
            // The EU transition instant (01:00 UTC) is the same across every
            // EU timezone, so comparing directly in UTC is exact.
            return isDstEu(nowUtc) ? stdOffset + 3600 : stdOffset;
        }

        // US/AU/NZ rules are legally defined in each zone's own *standard*
        // local time (e.g. "2:00 a.m. local standard time"), so evaluate the
        // calendar against that city's standard-time clock, not raw UTC.
        var stdLocal = Gregorian.utcInfo(nowUtc.add(new Time.Duration(stdOffset)), Time.FORMAT_SHORT);

        if (rule == :us) {
            return isDstUs(stdLocal) ? stdOffset + 3600 : stdOffset;
        }
        if (rule == :au) {
            return isDstAu(stdLocal) ? stdOffset + 3600 : stdOffset;
        }
        if (rule == :nz) {
            return isDstNz(stdLocal) ? stdOffset + 3600 : stdOffset;
        }

        return stdOffset;
    }

    // Sortable (month, day, hour, minute) key, valid within a single year.
    function keyOf(month, day, hour, minute) {
        return ((month * 100 + day) * 100 + hour) * 100 + minute;
    }

    // Day-of-month of the n-th Sunday of `month`/`year`.
    // Gregorian day_of_week: 1 = Sunday .. 7 = Saturday.
    function nthSundayOfMonth(year, month, n) {
        var first = Gregorian.utcInfo(Gregorian.moment({ :year => year, :month => month, :day => 1 }), Time.FORMAT_SHORT);
        var dow1 = first.day_of_week;
        var firstSunday = 1 + ((1 - dow1 + 7) % 7);
        return firstSunday + (n - 1) * 7;
    }

    // Day-of-month of the last Sunday of `month`/`year`. `daysInMonth` must
    // be supplied by the caller (only non-February months are used here, so
    // no leap-year handling is needed).
    function lastSundayOfMonth(year, month, daysInMonth) {
        var last = Gregorian.utcInfo(Gregorian.moment({ :year => year, :month => month, :day => daysInMonth }), Time.FORMAT_SHORT);
        var dowLast = last.day_of_week;
        return daysInMonth - ((dowLast - 1) % 7);
    }

    // US & Canada: transitions are legally defined at 2:00 a.m. on the
    // *prevailing* clock -- standard time in March (pre-transition, so
    // 02:00 standard = 02:00 wall), but daylight time in November
    // (pre-transition, so 02:00 wall = 02:00 daylight = 01:00 standard).
    // Both keys below are expressed on stdLocal's standard-time clock, so
    // the November end must use 01:00, not the literal "02:00" the legal
    // text names -- using 02:00 here would keep DST active for a spurious
    // extra hour every fall-back morning. Start: 2nd Sunday of March 02:00
    // standard. End: 1st Sunday of November 01:00 standard (= 02:00
    // daylight).
    function isDstUs(stdLocal) {
        var y = stdLocal.year;
        var startDay = nthSundayOfMonth(y, 3, 2);
        var endDay = nthSundayOfMonth(y, 11, 1);
        var nowKey = keyOf(stdLocal.month, stdLocal.day, stdLocal.hour, stdLocal.min);
        var startKey = keyOf(3, startDay, 2, 0);
        var endKey = keyOf(11, endDay, 1, 0);
        return nowKey >= startKey && nowKey < endKey;
    }

    // EU: last Sunday of March 01:00 UTC -> last Sunday of October 01:00 UTC.
    function isDstEu(nowUtc) {
        var info = Gregorian.utcInfo(nowUtc, Time.FORMAT_SHORT);
        var y = info.year;
        var startDay = lastSundayOfMonth(y, 3, 31);
        var endDay = lastSundayOfMonth(y, 10, 31);
        var nowKey = keyOf(info.month, info.day, info.hour, info.min);
        var startKey = keyOf(3, startDay, 1, 0);
        var endKey = keyOf(10, endDay, 1, 0);
        return nowKey >= startKey && nowKey < endKey;
    }

    // Australia (NSW/VIC/SA/TAS/ACT): 1st Sunday of October 02:00 -> 1st
    // Sunday of April 02:00, local standard time. Southern-hemisphere DST
    // wraps across the new year, so it is active from the October start
    // through year end, and again from January through the April end.
    function isDstAu(stdLocal) {
        var y = stdLocal.year;
        var startDay = nthSundayOfMonth(y, 10, 1);
        var endDay = nthSundayOfMonth(y, 4, 1);
        var nowKey = keyOf(stdLocal.month, stdLocal.day, stdLocal.hour, stdLocal.min);
        var startKey = keyOf(10, startDay, 2, 0);
        var endKey = keyOf(4, endDay, 2, 0);
        return nowKey >= startKey || nowKey < endKey;
    }

    // New Zealand: last Sunday of September 02:00 -> 1st Sunday of April
    // 02:00, local standard time. Same year-wraparound as isDstAu().
    function isDstNz(stdLocal) {
        var y = stdLocal.year;
        var startDay = lastSundayOfMonth(y, 9, 30);
        var endDay = nthSundayOfMonth(y, 4, 1);
        var nowKey = keyOf(stdLocal.month, stdLocal.day, stdLocal.hour, stdLocal.min);
        var startKey = keyOf(9, startDay, 2, 0);
        var endKey = keyOf(4, endDay, 2, 0);
        return nowKey >= startKey || nowKey < endKey;
    }
}
