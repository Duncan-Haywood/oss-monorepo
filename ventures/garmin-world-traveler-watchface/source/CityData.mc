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

    // index -> { :name, :abbr (<=4 chars, for dense grid rows), :offset
    // (seconds, standard time), :dst (symbol) }
    const CITIES = [
        { :name => "Pago Pago",   :abbr => "PPG", :offset => -11 * 3600,      :dst => :none },
        { :name => "Honolulu",    :abbr => "HNL", :offset => -10 * 3600,      :dst => :none },
        { :name => "Anchorage",   :abbr => "ANC", :offset => -9 * 3600,       :dst => :us },
        { :name => "Los Angeles", :abbr => "LAX", :offset => -8 * 3600,       :dst => :us },
        { :name => "Denver",      :abbr => "DEN", :offset => -7 * 3600,       :dst => :us },
        { :name => "Chicago",     :abbr => "CHI", :offset => -6 * 3600,       :dst => :us },
        { :name => "New York",    :abbr => "NYC", :offset => -5 * 3600,       :dst => :us },
        { :name => "Halifax",     :abbr => "HFX", :offset => -4 * 3600,       :dst => :us },
        { :name => "Sao Paulo",   :abbr => "SAO", :offset => -3 * 3600,       :dst => :none },
        { :name => "London",      :abbr => "LON", :offset => 0,               :dst => :eu },
        { :name => "Paris",       :abbr => "PAR", :offset => 1 * 3600,        :dst => :eu },
        { :name => "Athens",      :abbr => "ATH", :offset => 2 * 3600,        :dst => :eu },
        { :name => "Moscow",      :abbr => "MOW", :offset => 3 * 3600,        :dst => :none },
        { :name => "Dubai",       :abbr => "DXB", :offset => 4 * 3600,        :dst => :none },
        { :name => "Karachi",     :abbr => "KHI", :offset => 5 * 3600,        :dst => :none },
        { :name => "Delhi",       :abbr => "DEL", :offset => 5 * 3600 + 1800, :dst => :none },
        { :name => "Dhaka",       :abbr => "DAC", :offset => 6 * 3600,        :dst => :none },
        { :name => "Bangkok",     :abbr => "BKK", :offset => 7 * 3600,        :dst => :none },
        { :name => "Beijing",     :abbr => "PEK", :offset => 8 * 3600,        :dst => :none },
        { :name => "Tokyo",       :abbr => "TYO", :offset => 9 * 3600,        :dst => :none },
        { :name => "Sydney",      :abbr => "SYD", :offset => 10 * 3600,       :dst => :au },
        { :name => "Honiara",     :abbr => "HIR", :offset => 11 * 3600,       :dst => :none },
        { :name => "Auckland",    :abbr => "AKL", :offset => 12 * 3600,       :dst => :nz },
        { :name => "Nukualofa",   :abbr => "TBU", :offset => 13 * 3600,       :dst => :none }
    ];

    function size() {
        return CITIES.size();
    }

    function nameAt(index) {
        var i = normalizeIndex(index);
        return CITIES[i][:name];
    }

    function abbrAt(index) {
        var i = normalizeIndex(index);
        return CITIES[i][:abbr];
    }

    // Returns a Gregorian.Info (FORMAT_SHORT) for the given city's current
    // local wall-clock time, DST-adjusted for "now" (a Time.Moment, UTC).
    function localInfoAt(index, nowUtc) {
        var i = normalizeIndex(index);
        var city = CITIES[i];
        var offset = effectiveOffsetSeconds(city, nowUtc);
        var shifted = nowUtc.add(new Time.Duration(offset));
        return Gregorian.utcInfo(shifted, Time.FORMAT_SHORT);
    }

    function normalizeIndex(index) {
        var n = CITIES.size();
        var i = index % n;
        if (i < 0) {
            i += n;
        }
        return i;
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
