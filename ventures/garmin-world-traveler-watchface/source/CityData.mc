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

    // Exactly one entry per whole-hour UTC offset from -11 to +12 (24 zones
    // -- the standard "24 time zones of the world" set; UTC-12 is skipped
    // since it has no permanent population). Each city is the single
    // largest city that observes that offset as its *standard* (winter)
    // time, not necessarily the most touristed one -- e.g. Lagos (UTC+1)
    // outsizes Paris, Shanghai (UTC+8) outsizes Beijing, Jakarta (UTC+7)
    // outsizes Bangkok. UTC-2 has no real city (mid-Atlantic islands only);
    // Fernando de Noronha is used as the token IANA-recognized zone anchor.
    //
    // index -> { :name, :abbr (3 letters, drawn on the rotating ring),
    // :offset (seconds, standard time), :dst (symbol) }
    const CITIES = [
        { :name => "Pago Pago",           :abbr => "PPG", :offset => -11 * 3600, :dst => :none },
        { :name => "Honolulu",            :abbr => "HNL", :offset => -10 * 3600, :dst => :none },
        { :name => "Anchorage",           :abbr => "ANC", :offset => -9 * 3600,  :dst => :us },
        { :name => "Los Angeles",         :abbr => "LAX", :offset => -8 * 3600,  :dst => :us },
        { :name => "Phoenix",             :abbr => "PHX", :offset => -7 * 3600,  :dst => :none },
        { :name => "Mexico City",         :abbr => "MEX", :offset => -6 * 3600,  :dst => :none },
        { :name => "New York",            :abbr => "NYC", :offset => -5 * 3600,  :dst => :us },
        { :name => "Santiago",            :abbr => "SCL", :offset => -4 * 3600,  :dst => :none },
        { :name => "Sao Paulo",           :abbr => "SAO", :offset => -3 * 3600,  :dst => :none },
        { :name => "Fernando de Noronha", :abbr => "FEN", :offset => -2 * 3600,  :dst => :none },
        { :name => "Praia",               :abbr => "PRA", :offset => -1 * 3600,  :dst => :none },
        { :name => "London",              :abbr => "LON", :offset => 0,          :dst => :eu },
        { :name => "Lagos",               :abbr => "LOS", :offset => 1 * 3600,   :dst => :none },
        { :name => "Cairo",               :abbr => "CAI", :offset => 2 * 3600,   :dst => :none },
        { :name => "Moscow",              :abbr => "MOW", :offset => 3 * 3600,   :dst => :none },
        { :name => "Dubai",               :abbr => "DXB", :offset => 4 * 3600,   :dst => :none },
        { :name => "Karachi",             :abbr => "KHI", :offset => 5 * 3600,   :dst => :none },
        { :name => "Dhaka",               :abbr => "DAC", :offset => 6 * 3600,   :dst => :none },
        { :name => "Jakarta",             :abbr => "JKT", :offset => 7 * 3600,   :dst => :none },
        { :name => "Shanghai",            :abbr => "SHA", :offset => 8 * 3600,   :dst => :none },
        { :name => "Tokyo",               :abbr => "TYO", :offset => 9 * 3600,   :dst => :none },
        { :name => "Sydney",              :abbr => "SYD", :offset => 10 * 3600,  :dst => :au },
        { :name => "Honiara",             :abbr => "HIR", :offset => 11 * 3600,  :dst => :none },
        { :name => "Auckland",            :abbr => "AKL", :offset => 12 * 3600,  :dst => :nz }
    ];

    function size() {
        return CITIES.size();
    }

    function abbrAt(index) {
        return CITIES[index][:abbr];
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

    // US & Canada: 2nd Sunday of March 02:00 -> 1st Sunday of November 02:00,
    // both in local standard time.
    function isDstUs(stdLocal) {
        var y = stdLocal.year;
        var startDay = nthSundayOfMonth(y, 3, 2);
        var endDay = nthSundayOfMonth(y, 11, 1);
        var nowKey = keyOf(stdLocal.month, stdLocal.day, stdLocal.hour, stdLocal.min);
        var startKey = keyOf(3, startDay, 2, 0);
        var endKey = keyOf(11, endDay, 2, 0);
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
