import Foundation

/// Everything needed to render one city's clock at a single instant: local time, today's
/// sunrise/sunset there, whether it's currently day or night, and how its calendar date
/// compares to the device's.
public struct CityClockSnapshot {
    public let city: City
    public let referenceDate: Date
    public let sunrise: Date?
    public let sunset: Date?
    public let isDaytime: Bool
    /// e.g. "+1d" / "-1d" when the city's local calendar date differs from the device's;
    /// `nil` when they're on the same date.
    public let dayOffsetLabel: String?

    public init(city: City, referenceDate: Date, deviceTimeZone: TimeZone = .current) {
        self.city = city
        self.referenceDate = referenceDate

        let sunrise = SolarCalculator.time(for: .sunrise, city: city, on: referenceDate)
        let sunset = SolarCalculator.time(for: .sunset, city: city, on: referenceDate)
        self.sunrise = sunrise
        self.sunset = sunset
        self.isDaytime = Self.isDaytime(at: referenceDate, sunrise: sunrise, sunset: sunset)
        self.dayOffsetLabel = Self.dayOffsetLabel(referenceDate: referenceDate, city: city, deviceTimeZone: deviceTimeZone)
    }

    private static func isDaytime(at referenceDate: Date, sunrise: Date?, sunset: Date?) -> Bool {
        guard let sunrise, let sunset else {
            // No sunrise/sunset today (shouldn't happen for this catalog's latitudes) — default to daytime.
            return true
        }
        if sunrise < sunset {
            return referenceDate >= sunrise && referenceDate < sunset
        } else {
            // Sunset (computed for "today") lands before sunrise, which happens near the
            // International Date Line; treat it as the wrap-around case.
            return referenceDate >= sunrise || referenceDate < sunset
        }
    }

    private static func dayOffsetLabel(referenceDate: Date, city: City, deviceTimeZone: TimeZone) -> String? {
        var cityCalendar = Calendar(identifier: .gregorian)
        cityCalendar.timeZone = city.timeZone
        var deviceCalendar = Calendar(identifier: .gregorian)
        deviceCalendar.timeZone = deviceTimeZone

        let cityComponents = cityCalendar.dateComponents([.year, .month, .day], from: referenceDate)
        let deviceComponents = deviceCalendar.dateComponents([.year, .month, .day], from: referenceDate)

        // Anchor both calendar dates in a neutral (UTC) calendar so the day difference is a
        // plain integer count, unaffected by either time zone's offset.
        var neutralCalendar = Calendar(identifier: .gregorian)
        neutralCalendar.timeZone = TimeZone(identifier: "UTC")!

        guard
            let cityAnchor = neutralCalendar.date(from: cityComponents),
            let deviceAnchor = neutralCalendar.date(from: deviceComponents),
            let dayDelta = neutralCalendar.dateComponents([.day], from: deviceAnchor, to: cityAnchor).day
        else {
            return nil
        }

        switch dayDelta {
        case 0: return nil
        case let delta where delta > 0: return "+\(delta)d"
        default: return "\(dayDelta)d"
        }
    }
}
