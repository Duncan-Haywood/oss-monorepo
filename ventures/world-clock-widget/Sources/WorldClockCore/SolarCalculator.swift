import Foundation

public enum SolarEvent {
    case sunrise
    case sunset
}

/// Computes sunrise/sunset instants without any network access or API key.
///
/// Implements the "Sunrise/Sunset Algorithm" from the *Almanac for Computers, 1990*
/// (Nautical Almanac Office, United States Naval Observatory) — the same public-domain
/// algorithm behind most open-source sunrise calculators. It's accurate to roughly a minute
/// for non-polar latitudes, which is more than enough for a clock widget.
public enum SolarCalculator {

    /// The official zenith angle (in degrees) used for sunrise/sunset, which already accounts
    /// for atmospheric refraction and the sun's apparent radius.
    private static let officialZenith = 90.83

    /// Sunrise or sunset for `city` on the calendar date `referenceDate` falls on *in that
    /// city's own time zone* (i.e. "today" as observed locally there, not at the device).
    ///
    /// Returns `nil` for the small number of city/date combinations where the sun doesn't
    /// rise or set at all (this catalog has no cities inside the polar circles, so in practice
    /// this only guards against the math, not a real-world case).
    public static func time(for event: SolarEvent, city: City, on referenceDate: Date) -> Date? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = city.timeZone
        let components = calendar.dateComponents([.year, .month, .day], from: referenceDate)

        guard let year = components.year, let month = components.month, let day = components.day else {
            return nil
        }

        guard let candidate = calculate(event: event, year: year, month: month, day: day, latitude: city.latitude, longitude: city.longitude) else {
            return nil
        }

        // `calculate` anchors its result to the UTC calendar day matching (year, month, day),
        // but that's the city's *local* calendar day, not a UTC one. For any city whose civil
        // UTC offset diverges from its raw longitude/15 — true for most cities away from the
        // Greenwich meridian, e.g. Tokyo (offset +9, longitude/15 ≈ +9.31) or Los Angeles
        // (offset -7/-8, longitude/15 ≈ -7.88) — the instant `calculate` returns can land a
        // full calendar day off once converted back into the city's own time zone: real-world
        // Tokyo sunrise on June 21 came back dated June 22 JST until this was added. Nudge by
        // a day in whichever direction lands the event back on the date that was asked for.
        func fallsOnRequestedLocalDay(_ date: Date) -> Bool {
            let local = calendar.dateComponents([.year, .month, .day], from: date)
            return local.year == year && local.month == month && local.day == day
        }

        if fallsOnRequestedLocalDay(candidate) {
            return candidate
        }
        for dayOffset in [1.0, -1.0] {
            let shifted = candidate.addingTimeInterval(dayOffset * 86400)
            if fallsOnRequestedLocalDay(shifted) {
                return shifted
            }
        }
        return candidate
    }

    private static func calculate(event: SolarEvent, year: Int, month: Int, day: Int, latitude: Double, longitude: Double) -> Date? {
        // 1. Day of the year.
        let n1 = floor(275.0 * Double(month) / 9.0)
        let n2 = floor((Double(month) + 9.0) / 12.0)
        let n3 = 1.0 + floor((Double(year) - 4.0 * floor(Double(year) / 4.0) + 2.0) / 3.0)
        let dayOfYear = n1 - (n2 * n3) + Double(day) - 30.0

        // 2. Convert longitude to hours and estimate the event time.
        let longitudeHours = longitude / 15.0
        let approxTime: Double
        switch event {
        case .sunrise: approxTime = dayOfYear + ((6.0 - longitudeHours) / 24.0)
        case .sunset: approxTime = dayOfYear + ((18.0 - longitudeHours) / 24.0)
        }

        // 3. Sun's mean anomaly.
        let meanAnomaly = (0.9856 * approxTime) - 3.289

        // 4. Sun's true longitude.
        var trueLongitude = meanAnomaly
            + (1.916 * sinDegrees(meanAnomaly))
            + (0.020 * sinDegrees(2 * meanAnomaly))
            + 282.634
        trueLongitude = normalizedDegrees(trueLongitude)

        // 5. Sun's right ascension, moved into the same quadrant as trueLongitude.
        var rightAscension = atanDegrees(0.91764 * tanDegrees(trueLongitude))
        rightAscension = normalizedDegrees(rightAscension)

        let longitudeQuadrant = floor(trueLongitude / 90.0) * 90.0
        let ascensionQuadrant = floor(rightAscension / 90.0) * 90.0
        rightAscension += (longitudeQuadrant - ascensionQuadrant)
        rightAscension /= 15.0 // degrees -> hours

        // 6. Sun's declination.
        let sinDeclination = 0.39782 * sinDegrees(trueLongitude)
        let cosDeclination = cos(asin(sinDeclination))

        // 7. Sun's local hour angle.
        let cosHourAngle = (cosDegrees(officialZenith) - (sinDeclination * sinDegrees(latitude)))
            / (cosDeclination * cosDegrees(latitude))

        // The sun never rises (> 1) or never sets (< -1) at this latitude on this date.
        guard cosHourAngle >= -1, cosHourAngle <= 1 else { return nil }

        var hourAngle: Double
        switch event {
        case .sunrise: hourAngle = 360.0 - acosDegrees(cosHourAngle)
        case .sunset: hourAngle = acosDegrees(cosHourAngle)
        }
        hourAngle /= 15.0 // degrees -> hours

        // 8. Local mean time of the event.
        let localMeanTime = hourAngle + rightAscension - (0.06571 * approxTime) - 6.622

        // 9. Adjust to UTC, wrapped into [0, 24).
        var universalTime = localMeanTime - longitudeHours
        universalTime = universalTime.truncatingRemainder(dividingBy: 24.0)
        if universalTime < 0 { universalTime += 24.0 }

        var utcCalendar = Calendar(identifier: .gregorian)
        utcCalendar.timeZone = TimeZone(identifier: "UTC")!

        var midnightComponents = DateComponents()
        midnightComponents.year = year
        midnightComponents.month = month
        midnightComponents.day = day

        guard let midnightUTC = utcCalendar.date(from: midnightComponents) else { return nil }
        return midnightUTC.addingTimeInterval(universalTime * 3600.0)
    }

    // MARK: - Degree-based trig helpers (the reference algorithm is defined entirely in degrees)

    private static func sinDegrees(_ degrees: Double) -> Double { sin(degrees * .pi / 180.0) }
    private static func cosDegrees(_ degrees: Double) -> Double { cos(degrees * .pi / 180.0) }
    private static func tanDegrees(_ degrees: Double) -> Double { tan(degrees * .pi / 180.0) }
    private static func atanDegrees(_ value: Double) -> Double { atan(value) * 180.0 / .pi }
    private static func acosDegrees(_ value: Double) -> Double { acos(value) * 180.0 / .pi }

    private static func normalizedDegrees(_ degrees: Double) -> Double {
        var result = degrees.truncatingRemainder(dividingBy: 360.0)
        if result < 0 { result += 360.0 }
        return result
    }
}
